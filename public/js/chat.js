/* ===========================================================================
 * 회화한입 — Stage 2: AI 대화 파트너
 * Talks to the server's /api/chat (which proxies the Claude API).
 * Reuses global helpers from app.js: show(), toast(), and window.Speech.
 * ========================================================================= */
(function () {
  const byId = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const chat = {
    topic: 'core',
    messages: [], // {role:'user'|'assistant', content, data?}
    busy: false,
  };

  const getApiBase = () => (localStorage.getItem('es_api_base') || '').replace(/\/$/, '');
  const getSecret = () => localStorage.getItem('es_app_secret') || '';

  // ----------------------------- open / topic picker -----------------------------
  function openChat() {
    show('screen-chat');
    renderTopicPicker();
  }

  function renderTopicPicker() {
    byId('chat-title').textContent = 'AI 대화';
    byId('chat-input-bar').hidden = true;
    const cats = window.CATEGORIES;
    const tiles = Object.entries(cats)
      .map(
        ([key, c]) => `
        <button class="chat-topic" data-topic="${key}" style="--c:${c.color}">
          <span class="ct-emoji">${c.emoji}</span>
          <span class="ct-label">${c.label}</span>
        </button>`
      )
      .join('');

    byId('chat-body').innerHTML = `
      <div class="chat-intro">
        <div class="chat-intro-emoji">🤖</div>
        <h3>무슨 주제로 얘기할까요?</h3>
        <p>AI 파트너가 쉬운 영어로 말 걸어줘요. 영어로 답하거나 🎙️ 눌러 말해보세요. 틀려도 괜찮아요 — 살짝 고쳐줄게요.</p>
      </div>
      <div class="chat-topics">${tiles}</div>
    `;
    byId('chat-body')
      .querySelectorAll('.chat-topic')
      .forEach((b) => b.addEventListener('click', () => startTopic(b.dataset.topic)));
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
    // Ask the AI to open the conversation.
    requestReply();
  }

  function renderMessages() {
    const body = byId('chat-body');
    body.innerHTML = chat.messages.map(renderBubble).join('');
    // wire up TTS buttons
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
  function removeTyping() {
    byId('chat-typing')?.remove();
  }

  async function send(text) {
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
      const apiMessages = chat.messages.map((m) => ({ role: m.role, content: m.content }));
      const r = await fetch(getApiBase() + '/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getSecret() ? { 'x-app-secret': getSecret() } : {}),
        },
        body: JSON.stringify({ messages: apiMessages, topic: chat.topic, level: 'beginner' }),
      });
      removeTyping();
      if (!r.ok) return handleError(r.status, await safeJson(r));
      const data = await r.json();
      chat.messages.push({ role: 'assistant', content: data.reply || '', data });
      renderMessages();
      if (data.reply) window.Speech.speak(data.reply);
    } catch (e) {
      removeTyping();
      handleError(0, null);
    } finally {
      chat.busy = false;
    }
  }

  async function safeJson(r) {
    try {
      return await r.json();
    } catch {
      return null;
    }
  }

  function handleError(status, body) {
    if (status === 501) {
      showSetupHelp(body?.message || 'AI 대화는 서버에 API 키 설정이 필요해요.');
    } else if (status === 401) {
      toast('서버 비밀키가 필요하거나 틀렸어요. ⚙️에서 확인하세요.');
    } else if (status === 429) {
      toast('요청이 많아요. 잠시 후 다시 시도하세요.');
    } else {
      // No server reachable (e.g. opened on GitHub Pages without a backend).
      showSetupHelp(
        'AI 대화는 서버가 필요해요. 이 주소엔 서버가 없네요. 아래 안내를 보거나 ⚙️에서 서버 주소를 설정하세요.'
      );
    }
  }

  function showSetupHelp(msg) {
    byId('chat-input-bar').hidden = true;
    byId('chat-body').innerHTML = `
      <div class="chat-help">
        <div class="chat-intro-emoji">🔌</div>
        <h3>AI 대화 연결이 필요해요</h3>
        <p>${esc(msg)}</p>
        <ol class="help-steps">
          <li>이 앱을 <b>서버로 배포</b>하고 <code>ANTHROPIC_API_KEY</code>를 설정 (README의 Stage 2 참고 — Render 추천)</li>
          <li>배포한 <b>서버 주소</b>를 ⚙️ 설정에 입력 (같은 주소에서 열었다면 비워두기)</li>
        </ol>
        <div class="chat-help-actions">
          <button class="ghost-btn" id="chat-help-settings">⚙️ 서버 주소 설정</button>
          <button class="ghost-btn" id="chat-help-back">← 돌아가기</button>
        </div>
        <p class="chat-help-base">현재 서버 주소: <code>${esc(getApiBase() || '(같은 주소)')}</code></p>
      </div>`;
    byId('chat-help-settings').addEventListener('click', openSettings);
    byId('chat-help-back').addEventListener('click', renderTopicPicker);
  }

  // ----------------------------- settings -----------------------------
  function openSettings() {
    const cur = getApiBase();
    const next = prompt(
      'AI 서버 주소를 입력하세요.\n예: https://my-app.onrender.com\n(앱과 같은 주소에서 열었다면 비워두세요)',
      cur
    );
    if (next === null) return; // cancelled
    localStorage.setItem('es_api_base', next.trim());

    const secret = prompt(
      '서버에 APP_SECRET을 설정했다면 입력하세요. 없으면 비워두세요.',
      getSecret()
    );
    if (secret !== null) localStorage.setItem('es_app_secret', secret.trim());

    toast('저장됨. 다시 시도해보세요.');
    renderTopicPicker();
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
    byId('btn-chat-settings')?.addEventListener('click', openSettings);
    byId('chat-send')?.addEventListener('click', () => send(byId('chat-input').value));
    byId('chat-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send(byId('chat-input').value);
    });
    byId('chat-mic')?.addEventListener('click', micInput);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
