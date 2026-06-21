/**
 * Express server for the English-study PWA.
 *
 * Serves the static PWA AND hosts the Stage-2 AI conversation partner
 * (`POST /api/chat`) which calls the Claude API server-side so the API key
 * never reaches the browser.
 *
 * Run:  npm install && ANTHROPIC_API_KEY=sk-ant-... npm start
 * Open: http://localhost:3000  (or deploy to any Node host — see README)
 */
const path = require('path');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Default to the most capable model. For much lower cost/latency on a
// high-volume chat app you can set CHAT_MODEL=claude-haiku-4-5 (or sonnet).
const CHAT_MODEL = process.env.CHAT_MODEL || 'claude-opus-4-8';

// Optional: lock cross-origin access to a known front-end (e.g. your GitHub
// Pages origin). Defaults to '*' so it works out of the box; set it in prod.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
// Optional shared secret. If set, the client must send it as x-app-secret —
// stops strangers from spending your API credits through an open proxy.
const APP_SECRET = process.env.APP_SECRET || '';

// ---- CORS (so a PWA hosted elsewhere can reach this API) ----
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-secret');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Serve the PWA. Service worker must be served from the app root scope.
app.use(
  express.static(path.join(__dirname, 'public'), {
    setHeaders(res, filePath) {
      if (filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  })
);

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// Topic flavor injected into the system prompt.
const TOPIC_HINTS = {
  core: '일상 기본 상황(인사, 부탁, 주문 등)으로 쉽게.',
  comedy: '코미디/유머 — 좋아하는 프로, 웃겼던 일, 농담에 대한 가벼운 수다.',
  politics: '정치/시사 — 뉴스, 선거, 이슈에 대한 의견을 아주 쉬운 말로.',
  economy: '경제/생활 — 물가, 돈 관리, 일/직업 이야기.',
  daily: '일상 — 카페, 길찾기, 자기소개 같은 생존 영어 상황극.',
};

function buildSystem(topic, level) {
  const beginner = level !== 'inter';
  return `너는 "회화한입" 앱의 영어 회화 파트너야. 상대는 영어를 ${
    beginner ? '떠듬떠듬 하는 초급' : '중급'
  } 한국인 학습자야.

규칙:
- 너의 reply(영어 발화)는 ${beginner ? '아주 쉬운 단어로 1~2문장' : '쉬운 단어로 2~3문장'}만. 길게 설명하지 마.
- 매 턴 끝에 자연스럽게 짧은 질문 하나로 대화를 이어가. 한 번에 질문 하나만.
- 학습자가 말을 멈추지 않도록 격려하고, 편하게 만들어줘.
- 학습자의 직전 영어 문장에 눈에 띄는 실수가 있으면 correction에 고친 문장을, correction_note_ko에 한국어로 아주 짧게 이유를 적어. 실수 없으면 빈 문자열("").
- tip_ko에는 다음에 써보면 좋은 표현이나 짧은 코칭을 한국어로(선택, 없으면 "").
- 주제: ${TOPIC_HINTS[topic] || TOPIC_HINTS.core}
- 학습자가 한국어로 말해도 영어로 어떻게 말하는지 reply 안에서 자연스럽게 보여줘.
- 절대 길게 훈계하지 말고, 재미있고 친근하게.

출력 형식: 오직 아래 키를 가진 JSON 객체 하나만 출력해. 코드펜스(\`\`\`)나 다른 텍스트는 절대 넣지 마.
{"reply": "...", "reply_ko": "...", "correction": "", "correction_note_ko": "", "tip_ko": ""}`;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string', description: 'Your reply in simple English (the conversation partner speaking).' },
    reply_ko: { type: 'string', description: 'Natural Korean translation of reply.' },
    correction: { type: 'string', description: "Corrected version of the user's last English sentence, or empty string if no notable mistake / not applicable." },
    correction_note_ko: { type: 'string', description: 'Very short Korean note explaining the correction, or empty string.' },
    tip_ko: { type: 'string', description: 'Optional short Korean coaching tip or phrase to try next, or empty string.' },
  },
  required: ['reply', 'reply_ko', 'correction', 'correction_note_ko', 'tip_ko'],
};

// Robustly pull the JSON object out of the model's text (handles code fences
// or stray prose if structured output wasn't applied).
function parseReply(text) {
  const empty = { reply: '', reply_ko: '', correction: '', correction_note_ko: '', tip_ko: '' };
  let raw = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return { ...empty, ...JSON.parse(raw) };
  } catch {}
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return { ...empty, ...JSON.parse(m[0]) };
    } catch {}
  }
  return { ...empty, reply: text };
}

app.post('/api/chat', express.json(), async (req, res) => {
  if (APP_SECRET && req.get('x-app-secret') !== APP_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!client) {
    return res.status(501).json({
      error: 'not_configured',
      message:
        'AI 대화를 쓰려면 서버에 ANTHROPIC_API_KEY 환경변수를 설정해야 해요. (README 참고)',
    });
  }

  try {
    const { messages = [], topic = 'core', level = 'beginner' } = req.body || {};
    // Keep the last ~20 turns to bound tokens; coerce to the API shape.
    const history = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));
    // The API requires the first message to be from the user.
    if (history.length === 0 || history[0].role !== 'user') {
      history.unshift({ role: 'user', content: '(Start the conversation — greet me and ask the first question.)' });
    }

    const response = await client.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: buildSystem(topic, level),
      messages: history,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    });

    const text = response.content.find((b) => b.type === 'text')?.text || '{}';
    res.json(parseReply(text));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'rate_limit', message: '잠시 후 다시 시도해 주세요.' });
    }
    console.error('chat error:', err?.message || err);
    res.status(500).json({ error: 'server_error', message: 'AI 응답 생성 중 오류가 났어요.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📚 회화한입 PWA running on http://localhost:${PORT}`);
  console.log(`   AI chat: ${client ? `enabled (${CHAT_MODEL})` : 'DISABLED — set ANTHROPIC_API_KEY'}\n`);
});
