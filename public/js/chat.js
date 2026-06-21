/* ===========================================================================
 * 회화한입 — Stage 2: AI 대화 파트너
 *
 * Two ways to reach Claude:
 *   1) EASY mode — paste your Anthropic API key in settings. The PWA calls the
 *      Claude API directly from the browser (key stored only in localStorage on
 *      this device). No server to deploy — works on the live GitHub Pages URL.
 *   2) SERVER mode — set a server URL; the PWA calls that server's /api/chat,
 *      which holds the key server-side (most secure). See README.
 *
 * Reuses global helpers from app.js: show(), toast(), renderHome(), window.Speech.
 * ========================================================================= */
(function () {
  const byId = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const chat = { topic: 'core', messages: [], busy: false };

  // ---- settings (localStorage) ----
  const getApiKey = () => localStorage.getItem('es_api_key') || '';
  const getModel = () => localStorage.getItem('es_chat_model') || 'claude-opus-4-8';
  const getApiBase = () => (localStorage.getItem('es_api_base') || '').replace(/\/$/, '');
  const getSecret = () => localStorage.getItem('es_app_secret') || '';

  const TOPIC_HINTS = {
    core: '일상 기본 상황(인사, 부탁, 주문 등)으로 쉽게.',
    comedy: '코미디/유머 — 좋아하는 프로, 웃겼던 일, 농담에 대한 가벼운 수다.',
    politics: '정치/시사 — 뉴스, 선거, 이슈에 대한 의견을 아주 쉬운 말로.',
    economy: '경제/생활 — 물가, 돈 관리, 일/직업 이야기.',
    daily: '일상 — 카페, 길찾기, 자기소개 같은 생존 영어 상황극.',
  };

  function buildSystemPrompt(topic) {
    return `너는 "회화한입" 앱의 영어 회화 파트너야. 상대는 영어를 떠듬떠듬 하는 초급 한국인 학습자야.

규칙:
- reply(영어 발화)는 아주 쉬운 단어로 1~2문장만. 길게 설명하지 마.
- 매 턴 끝에 짧은 질문 하나로 대화를 이어가. 한 번에 질문 하나만.
- 학습자를 격려하고 편하게 만들어줘.
- 직전 영어 문장에 눈에 띄는 실수가 있으면 correction에 고친 문장을, correction_note_ko에 한국어로 아주 짧게 이유를. 없으면 "".
- tip_ko: 다음에 써보면 좋은 표현/짧은 코칭(선택, 없으면 "").
- 주제: ${TOPIC_HINTS[topic] || TOPIC_HINTS.core}
- 한국어로 말해도 영어로 어떻게 말하는지 reply 안에서 보여줘.
- 재미있고 친근하게.

출력: 오직 아래 키의 JSON 객체 하나만. 코드펜스나 다른 텍스트 금지.
{"reply":"...","reply_ko":"...","correction":"","correction_note_ko":"","tip_ko":""}`;
  }

  const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      reply: { type: 'string' },
      reply_ko: { type: 'string' },
      correction: { type: 'string' },
      correction_note_ko: { type: 'string' },
      tip_ko: { type: 'string' },
    },
    required: ['reply', 'reply_ko', 'correction', 'correction_note_ko', 'tip_ko'],
  };

  function parseReply(text) {
    const empty = { reply: '', reply_ko: '', correction: '', correction_note_ko: '', tip_ko: '' };
    let raw = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
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

  // ----------------------------- open / topic picker -----------------------------
  function openChat() {
    show('screen-chat');
    renderTopicPicker();
  }

  function renderTopicPicker() {
    byId('chat-title').textContent = 'AI 대화';
    byId('chat-input-bar').hidden = true;
    const configured = getApiKey() || getApiBase();
    const cats = window.CATEGORIES;
    const tiles = Object.entries(cats)
      .map(
        ([key, c]) => `
        <button class="chat-topic" data-topic="${key}" style="--c:${c.color}">
          <span class="ct-emoji">${c.emoji}</span><span class="ct-label">${c.label}</span>
        </button>`
      )
      .join('');

    byId('chat-body').innerHTML = `
      <div class="chat-intro">
        <div class="chat-intro-emoji">🤖</div>
        <h3>무슨 주제로 얘기할까요?</h3>
        <p>AI가 쉬운 영어로 말 걸어줘요. 영어로 답하거나 🎙️ 눌러 말해보세요. 틀려도 살짝 고쳐줄게요.</p>
      </div>
      ${
        configured
          ? ''
          : `<div class="chat-needkey" id="chat-needkey">
               🔑 먼저 <b>API 키</b>를 넣어야 대화가 돼요.
               <button id="chat-needkey-btn">키 넣기 (1분)</button>
             </div>`
      }
      <div class="chat-topics">${tiles}</div>`;
    byId('chat-body')
      .querySelectorAll('.chat-topic')
      .forEach((b) => b.addEventListener('click', () => startTopic(b.dataset.topic)));
    byId('chat-needkey-btn')?.addEventListener('click', renderSettings);
  }

  // ----------------------------- conversation -----------------------------
  function startTopic(topic) {
    chat.topic = topic;
    chat.messages = [];
    const c = window.CATEGORIES[topic];
    byId('chat-title').textContent = `${c.emoji} ${c.label}`;
    byId('chat-body').innerHTML = '';
    byId('chat-input-bar').hidden = false;
    byId('chat-input').value = '';
    requestReply();
  }

  function renderMessages() {
    const body = byId('chat-body');
    body.innerHTML = chat.messages.map(renderBubble).join('');
    body.querySelectorAll('.bubble-tts').forEach((b) =>
      b.addEventListener('click', () => window.Speech.speak(decodeURIComponent(b.dataset.say)))
    );
    body.scrollTop = body.scrollHeight;
  }

  function renderBubble(m) {
    if (m.role === 'user') {
      return `<div class="msg user"><div class="bubble">${esc(m.content)}</div></div>`;
    }
    const d = m.data || { reply: m.content };
    const correction =
      d.correction && d.correction.trim()
        ? `<div class="msg-correction">✏️ <b>${esc(d.correction)}</b>${
            d.correction_note_ko ? `<br><span>${esc(d.correction_note_ko)}</span>` : ''
          }</div>`
        : '';
    const tip = d.tip_ko && d.tip_ko.trim() ? `<div class="msg-tip">💡 ${esc(d.tip_ko)}</div>` : '';
    return `
      <div class="msg ai">
        ${correction}
        <div class="bubble">
          <div class="bubble-en">${esc(d.reply)}</div>
          ${d.reply_ko ? `<div class="bubble-ko">${esc(d.reply_ko)}</div>` : ''}
          <button class="bubble-tts" data-say="${encodeURIComponent(d.reply)}">🔊</button>
        </div>
        ${tip}
      </div>`;
  }

  function appendTyping() {
    const body = byId('chat-body');
    const el = document.createElement('div');
    el.className = 'msg ai';
    el.id = 'chat-typing';
    el.innerHTML = '<div class="bubble typing"><span></span><span></span><span></span></div>';
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }
  const removeTyping = () => byId('chat-typing')?.remove();

  function send(text) {
    text = (text || '').trim();
    if (!text || chat.busy) return;
    chat.messages.push({ role: 'user', content: text });
    byId('chat-input').value = '';
    renderMessages();
    requestReply();
  }

  async function requestReply() {
    if (chat.busy) return;
    chat.busy = true;
    appendTyping();
    try {
      let apiMessages = chat.messages.map((m) => ({ role: m.role, content: m.content }));
      if (!apiMessages.length || apiMessages[0].role !== 'user') {
        apiMessages.unshift({ role: 'user', content: '(Start the conversation — greet me and ask the first question.)' });
      }
      const data = getApiKey() ? await callDirect(apiMessages) : await callServer(apiMessages);
      removeTyping();
      chat.messages.push({ role: 'assistant', content: data.reply || '', data });
      renderMessages();
      if (data.reply) window.Speech.speak(data.reply);
    } catch (e) {
      removeTyping();
      handleError(e?.kind ?? 0, e);
    } finally {
      chat.busy = false;
    }
  }

  // EASY mode — call the Claude API directly from the browser.
  async function callDirect(apiMessages) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': getApiKey(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: 1024,
        system: buildSystemPrompt(chat.topic),
        messages: apiMessages,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      }),
    });
    if (!r.ok) {
      const e = await safeJson(r);
      throw { kind: r.status, msg: e?.error?.message };
    }
    const data = await r.json();
    const text = (data.content || []).find((b) => b.type === 'text')?.text || '{}';
    return parseReply(text);
  }

  // SERVER mode — call our backend proxy.
  async function callServer(apiMessages) {
    const r = await fetch(getApiBase() + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getSecret() ? { 'x-app-secret': getSecret() } : {}),
      },
      body: JSON.stringify({ messages: apiMessages, topic: chat.topic, level: 'beginner' }),
    });
    if (!r.ok) {
      const e = await safeJson(r);
      throw { kind: r.status, msg: e?.message };
    }
    return await r.json();
  }

  async function safeJson(r) {
    try {
      return await r.json();
    } catch {
      return null;
    }
  }

  function handleError(status) {
    if (status === 401) {
      toast('🔑 API 키가 없거나 틀렸어요. ⚙️에서 확인하세요.');
      renderSettings();
    } else if (status === 429) {
      toast('요청이 많아요. 잠시 후 다시 시도하세요.');
    } else if (status === 400) {
      toast('요청 형식 오류가 났어요. 모델 설정을 확인해보세요.');
    } else if (status === 501) {
      renderSettings();
    } else {
      // No key and no reachable server.
      renderSettings();
      toast('먼저 API 키를 넣어주세요.');
    }
  }

  // ----------------------------- settings panel -----------------------------
  function renderSettings() {
    byId('chat-title').textContent = '⚙️ AI 설정';
    byId('chat-input-bar').hidden = true;
    byId('chat-body').innerHTML = `
      <div class="chat-settings">
        <div class="cs-card">
          <h3>🔑 쉬운 방법 (추천)</h3>
          <p class="cs-sub">Anthropic API 키만 붙여넣으면 서버 없이 바로 대화돼요.
            키는 <b>이 폰에만</b> 저장되고 Anthropic에만 전송됩니다.</p>
          <label>API 키
            <input id="cs-key" type="password" placeholder="sk-ant-..." value="${esc(getApiKey())}" />
          </label>
          <label>모델
            <select id="cs-model">
              <option value="claude-opus-4-8">claude-opus-4-8 (똑똑함)</option>
              <option value="claude-haiku-4-5">claude-haiku-4-5 (저렴·빠름, 추천)</option>
              <option value="claude-sonnet-4-6">claude-sonnet-4-6 (중간)</option>
            </select>
          </label>
          <p class="cs-hint">키 발급: console.anthropic.com → API Keys (소액 유료). 회화 연습은 양이 많으니 <b>haiku</b> 추천.</p>
        </div>

        <details class="cs-card">
          <summary>🖥️ 고급: 내 서버 사용</summary>
          <p class="cs-sub">서버를 배포했다면 주소를 넣으세요(같은 주소에서 열었으면 비워두기). 위 API 키는 비워두세요.</p>
          <label>서버 주소
            <input id="cs-base" type="text" placeholder="https://my-app.onrender.com" value="${esc(getApiBase())}" />
          </label>
          <label>APP_SECRET(선택)
            <input id="cs-secret" type="password" placeholder="" value="${esc(getSecret())}" />
          </label>
        </details>

        <div class="cs-actions">
          <button class="cta" id="cs-save">저장</button>
          <button class="ghost-btn" id="cs-back">← 돌아가기</button>
        </div>
        <p class="cs-warn">⚠️ API 키는 비밀번호와 같아요. 남과 공유하지 말고, Anthropic 콘솔에서 사용 한도를 걸어두는 걸 추천해요.</p>
      </div>`;
    byId('cs-model').value = getModel();
    byId('cs-save').addEventListener('click', () => {
      localStorage.setItem('es_api_key', byId('cs-key').value.trim());
      localStorage.setItem('es_chat_model', byId('cs-model').value);
      localStorage.setItem('es_api_base', byId('cs-base').value.trim());
      localStorage.setItem('es_app_secret', byId('cs-secret').value.trim());
      toast('저장됨! 주제를 골라 대화해보세요 🎉');
      renderTopicPicker();
    });
    byId('cs-back').addEventListener('click', renderTopicPicker);
  }

  // ----------------------------- mic (STT) -----------------------------
  async function micInput() {
    if (!window.Speech.sttSupported()) {
      toast('이 기기는 음성 입력이 안 돼요. 타이핑으로 해보세요.');
      return;
    }
    const mic = byId('chat-mic');
    mic.classList.add('listening');
    try {
      const text = await window.Speech.listenOnce();
      byId('chat-input').value = text;
      send(text);
    } catch {
      toast('🤔 잘 안 들렸어요. 다시 시도하거나 타이핑하세요.');
    } finally {
      mic.classList.remove('listening');
    }
  }

  // ----------------------------- wire up -----------------------------
  function bind() {
    byId('btn-chat')?.addEventListener('click', openChat);
    byId('btn-chat-back')?.addEventListener('click', () => {
      if (typeof renderHome === 'function') renderHome();
      show('screen-home');
    });
    byId('btn-chat-settings')?.addEventListener('click', renderSettings);
    byId('chat-send')?.addEventListener('click', () => send(byId('chat-input').value));
    byId('chat-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send(byId('chat-input').value);
    });
    byId('chat-mic')?.addEventListener('click', micInput);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
