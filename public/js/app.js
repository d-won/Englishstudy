/* ===========================================================================
 * 회화한입 — app controller
 * Wires together data + SRS + game + speech into screens.
 * Vanilla JS, no framework (MVP). State persists in localStorage.
 * ========================================================================= */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  queue: [], // cards for the current session
  idx: 0,
  combo: 0,
  sessionXp: 0,
  sessionCards: 0,
  sessionAchievements: [],
  flipped: false,
  spokeThisCard: false,
};

const SESSION_TARGET = 8; // cards per micro-session (keeps it ~1–2 min)

// ----------------------------- screen routing -----------------------------
function show(screenId) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $(`#${screenId}`).classList.add('active');
  window.scrollTo(0, 0);
}

function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => (t.hidden = true), 250);
  }, ms);
}

function haptic(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ----------------------------- HOME render -----------------------------
function renderHome() {
  const g = Game.rollDay(Game.loadGame());
  Game.saveGame(g);
  const lv = Game.levelFor(g.xp);

  $('#stat-streak').textContent = g.streak;
  $('#level-emoji').textContent = lv.emoji;
  $('#level-name').textContent = lv.name;
  $('#level-num').textContent = lv.lvl;
  $('#xp-now').textContent = g.xp;
  $('#xp-tonext').textContent = lv.next ? lv.toNext + ' XP' : 'MAX';
  $('#xp-fill').style.width = Math.round(lv.progress * 100) + '%';

  // daily goal ring
  $('#today-count').textContent = g.todayCount;
  $('#today-goal').textContent = g.dailyGoal;
  const ratio = Math.min(1, g.todayCount / g.dailyGoal);
  const C = 2 * Math.PI * 52;
  const ring = $('#ring-fg');
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C * (1 - ratio);

  // CTA subtitle
  const due = SRS.getDueCards(DECK).length;
  const fresh = SRS.getNewCards(DECK).length;
  $('#cta-sub').textContent = `복습 ${due} · 신규 ${fresh} · 약 1분`;

  renderCatStrip(g);
  updateNotifyButton();
}

function renderCatStrip(g) {
  const wrap = $('#cat-strip');
  wrap.innerHTML = '';
  Object.entries(CATEGORIES).forEach(([key, c]) => {
    const total = DECK.filter((d) => d.cat === key).length;
    const studied = DECK.filter(
      (d) => d.cat === key && SRS.loadSrs()[d.id]
    ).length;
    const el = document.createElement('button');
    el.className = 'cat-pill';
    el.style.setProperty('--c', c.color);
    el.innerHTML = `
      <span class="cat-emoji">${c.emoji}</span>
      <span class="cat-name">${c.label}</span>
      <span class="cat-count">${studied}/${total}</span>`;
    el.addEventListener('click', () => startSession(key));
    wrap.appendChild(el);
  });
}

// ----------------------------- SESSION -----------------------------
// Beginner speaking focus: lead with 기초(level 1) and sprinkle 중급(level 2),
// roughly 3 basics to every 1 intermediate card.
const BASICS_PER_INTER = 3;

function buildQueue(catFilter) {
  let pool = DECK;
  if (catFilter) pool = DECK.filter((d) => d.cat === catFilter);

  const due = SRS.getDueCards(pool).map((x) => x.card);
  const fresh = SRS.getNewCards(pool);
  // Candidate order: review what's due first, then introduce new cards.
  const ordered = [...due, ...fresh];

  // Category-filtered session: just take them in order.
  if (catFilter) {
    const q = ordered.slice(0, SESSION_TARGET);
    return q.length
      ? q
      : [...pool].sort(() => Math.random() - 0.5).slice(0, SESSION_TARGET);
  }

  // Mixed session: interleave basics and intermediate by level.
  const basics = ordered.filter((c) => c.level === 1);
  const inter = ordered.filter((c) => c.level !== 1);
  const queue = [];
  let bi = 0;
  let ii = 0;
  while (queue.length < SESSION_TARGET && (bi < basics.length || ii < inter.length)) {
    for (let k = 0; k < BASICS_PER_INTER && bi < basics.length && queue.length < SESSION_TARGET; k++) {
      queue.push(basics[bi++]);
    }
    if (ii < inter.length && queue.length < SESSION_TARGET) queue.push(inter[ii++]);
    if (bi >= basics.length && ii >= inter.length) break;
  }
  if (queue.length === 0) {
    queue.push(...[...pool].sort(() => Math.random() - 0.5).slice(0, SESSION_TARGET));
  }
  return queue;
}

function startSession(catFilter) {
  state.queue = buildQueue(catFilter);
  state.idx = 0;
  state.combo = 0;
  state.sessionXp = 0;
  state.sessionCards = 0;
  state.sessionAchievements = [];
  show('screen-session');
  renderCard();
}

// ── exercise engine ──────────────────────────────────────────────────────
// Evidence-based: spacing (SRS) + RETRIEVAL PRACTICE (testing effect) with
// immediate FEEDBACK and MULTIMODAL input/output. New cards are taught first
// (comprehensible input); seen cards are tested via varied retrieval activities
// to keep recall effortful (desirable difficulty) and the session fresh.
function shuffle(arr) {
  return arr
    .map((x) => [Math.random(), x])
    .sort((a, b) => a[0] - b[0])
    .map((x) => x[1]);
}
function enWords(card) {
  return card.en
    .replace(/[^A-Za-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}
function distractors(card, n) {
  const pool = DECK.filter((d) => d.id !== card.id && d.ko !== card.ko);
  return shuffle(pool).slice(0, n).map((d) => d.ko);
}
function cardHeader(card) {
  const cat = CATEGORIES[card.cat];
  const lv =
    card.level === 1
      ? '<span class="lv-badge lv1">기초</span>'
      : '<span class="lv-badge lv2">중급</span>';
  return `<div class="card-cat">${cat.emoji} ${cat.label} ${lv}</div>
          <div class="card-situation">${card.situation}</div>`;
}
function gradeRowHtml(prompt) {
  return `
    <div class="grade-prompt" id="grade-prompt" hidden>${prompt}</div>
    <div class="grade-row" id="grade-row" hidden>
      <button class="grade again" data-g="again">😵 못함</button>
      <button class="grade hard" data-g="hard">😣 가물</button>
      <button class="grade good" data-g="good">🙂 됐어</button>
      <button class="grade easy" data-g="easy">😎 쉬움</button>
    </div>`;
}
function bindGradeRow(card) {
  $$('#grade-row .grade').forEach((b) =>
    b.addEventListener('click', () => gradeCard(card, b.dataset.g))
  );
}
function updateProgressCombo() {
  $('#session-bar').style.width =
    Math.round((state.idx / state.queue.length) * 100) + '%';
  const chip = $('#combo-chip');
  if (state.combo >= 2) {
    chip.hidden = false;
    $('#combo-num').textContent = state.combo;
  } else chip.hidden = true;
}

function chooseExercise(card) {
  const seen = !!SRS.loadSrs()[card.id];
  if (!seen) return 'teach'; // first exposure → teach (can't retrieve the unseen)
  const pool = ['recall', 'listen'];
  const wc = enWords(card).length;
  if (wc >= 3 && wc <= 7) pool.push('wordbank');
  const st = SRS.getCardState(card.id);
  return pool[(st.reps + state.idx) % pool.length];
}

function renderCard() {
  const card = state.queue[state.idx];
  state.spokeThisCard = false;
  updateProgressCombo();
  const type = chooseExercise(card);
  ({
    teach: renderTeach,
    recall: renderRecall,
    listen: renderListen,
    wordbank: renderWordbank,
  }[type])(card);
}

// 1) TEACH — full info + listen + shadow (input + scaffolded output). New cards.
function renderTeach(card) {
  const cat = CATEGORIES[card.cat];
  const drillsHtml = (card.drills || [])
    .map(
      (d) => `
      <div class="drill">
        <div class="drill-text"><div class="drill-en">${d.en}</div><div class="drill-ko">${d.ko}</div></div>
        <button class="drill-play" data-say="${encodeURIComponent(d.en)}">🔊</button>
      </div>`
    )
    .join('');

  $('#card-area').innerHTML = `
    <div class="flashcard" style="--c:${cat.color}">
      <div class="ex-tag">🆕 새 표현 — 듣고 따라 말해요</div>
      ${cardHeader(card)}
      <div class="card-en" id="card-en">${card.en}</div>
      <div class="card-ipa">${card.ipa || ''}</div>
      <div class="card-ko-inline">${card.ko}</div>
      <div class="card-voice">
        <button class="voice-btn" id="btn-listen">🔊 듣기</button>
        <button class="voice-btn primary" id="btn-speak">🎙️ 따라 말하기</button>
      </div>
      <div class="speak-result" id="speak-result" hidden></div>
      <button class="selfcheck-btn" id="btn-self">✅ 소리 내어 말했어요</button>
      ${drillsHtml ? `<div class="drills-wrap"><div class="drills-title">🔁 단어만 바꿔서 말해보기</div>${drillsHtml}</div>` : ''}
      <details class="card-tip"><summary>💡 팁 · 예문</summary>
        <div class="ex-en">“${card.ex_en}”</div><div class="ex-ko">${card.ex_ko}</div>
        <div class="card-fun">${card.fun}</div>
      </details>
    </div>
    ${gradeRowHtml('방금 얼마나 잘 말했나요?')}`;

  Speech.speak(card.en);
  $('#btn-listen').addEventListener('click', () => { haptic(); Speech.speak(card.en); });
  $('#btn-speak').addEventListener('click', () => doSpeak(card));
  $('#btn-self').addEventListener('click', () => { state.spokeThisCard = true; haptic(); revealGrade(); });
  $('#card-en').addEventListener('click', () => Speech.speak(card.en));
  $$('#card-area .drill-play').forEach((b) =>
    b.addEventListener('click', () => { haptic(); Speech.speak(decodeURIComponent(b.dataset.say)); })
  );
  bindGradeRow(card);
}

// 2) RECALL (KO→EN) — produce from memory before seeing the answer (testing
//    effect + output hypothesis). Then self-grade how well you recalled.
function renderRecall(card) {
  const cat = CATEGORIES[card.cat];
  $('#card-area').innerHTML = `
    <div class="flashcard" style="--c:${cat.color}">
      <div class="ex-tag">🧠 영어로 말해보기 (먼저 떠올려요!)</div>
      ${cardHeader(card)}
      <div class="recall-q">${card.ko}</div>
      <div class="recall-hint">소리 내어 영어로 말해본 뒤 정답을 확인하세요.</div>
      <div class="card-voice">
        <button class="voice-btn primary" id="btn-speak">🎙️ 영어로 말해보기</button>
        <button class="voice-btn" id="btn-reveal">👀 정답 확인</button>
      </div>
      <div class="speak-result" id="speak-result" hidden></div>
      <div id="hidden-answer" hidden>
        <div class="card-en" id="card-en">${card.en}</div>
        <div class="card-ipa">${card.ipa || ''}</div>
        <button class="voice-btn" id="btn-listen">🔊 듣기</button>
      </div>
    </div>
    ${gradeRowHtml('얼마나 잘 떠올렸나요?')}`;

  $('#btn-speak').addEventListener('click', () => doSpeak(card));
  $('#btn-reveal').addEventListener('click', () => { revealGrade(); Speech.speak(card.en); });
  $('#btn-listen')?.addEventListener('click', () => Speech.speak(card.en));
  bindGradeRow(card);
}

// 3) LISTEN (EN→KO) — comprehensible input + low-anxiety retrieval with
//    immediate feedback. Hear it, pick the meaning.
function renderListen(card) {
  const cat = CATEGORIES[card.cat];
  const opts = shuffle([card.ko, ...distractors(card, 2)]);
  $('#card-area').innerHTML = `
    <div class="flashcard" style="--c:${cat.color}">
      <div class="ex-tag">🎧 잘 듣고 뜻을 고르세요</div>
      <button class="voice-btn primary listen-big" id="btn-listen">🔊 다시 듣기</button>
      <div class="opts" id="opts">
        ${opts.map((o) => `<button class="opt" data-ko="${encodeURIComponent(o)}">${o}</button>`).join('')}
      </div>
      <div class="ex-feedback" id="ex-fb" hidden></div>
    </div>
    <div id="continue-wrap" hidden><button class="reveal-btn" id="btn-continue">계속 →</button></div>`;

  setTimeout(() => Speech.speak(card.en), 250);
  $('#btn-listen').addEventListener('click', () => { haptic(); Speech.speak(card.en); });
  $$('#opts .opt').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.done) return;
      const correct = decodeURIComponent(b.dataset.ko) === card.ko;
      $$('#opts .opt').forEach((o) => {
        o.dataset.done = '1';
        if (decodeURIComponent(o.dataset.ko) === card.ko) o.classList.add('correct');
        else if (o === b) o.classList.add('wrong');
      });
      objectiveFeedback(card, correct);
    })
  );
}

// 4) WORDBANK — reconstruct the sentence (scaffolded output, focus on form,
//    lower affective filter than free production).
function renderWordbank(card) {
  const cat = CATEGORIES[card.cat];
  const target = enWords(card);
  let bank = shuffle(target.slice());
  let ans = [];

  $('#card-area').innerHTML = `
    <div class="flashcard" style="--c:${cat.color}">
      <div class="ex-tag">🧩 단어를 순서대로 배열하세요</div>
      <div class="wb-ko">${card.ko}</div>
      <div class="wb-answer" id="wb-answer"></div>
      <div class="wb-bank" id="wb-bank"></div>
      <div class="ex-feedback" id="ex-fb" hidden></div>
      <button class="reveal-btn" id="wb-check" disabled>확인</button>
    </div>
    <div id="continue-wrap" hidden><button class="reveal-btn" id="btn-continue">계속 →</button></div>`;

  function draw() {
    $('#wb-answer').innerHTML = ans
      .map((w, i) => `<button class="wb-tile" data-where="ans" data-i="${i}">${w}</button>`)
      .join('');
    $('#wb-bank').innerHTML = bank
      .map((w, i) => `<button class="wb-tile" data-where="bank" data-i="${i}">${w}</button>`)
      .join('');
    $('#wb-check').disabled = ans.length === 0;
    $$('#card-area .wb-tile').forEach((t) =>
      t.addEventListener('click', () => {
        haptic(8);
        const i = +t.dataset.i;
        if (t.dataset.where === 'bank') { ans.push(bank[i]); bank.splice(i, 1); }
        else { bank.push(ans[i]); ans.splice(i, 1); }
        draw();
      })
    );
  }
  draw();

  $('#wb-check').addEventListener('click', () => {
    const correct = ans.join(' ').toLowerCase() === target.join(' ').toLowerCase();
    $('#wb-check').style.display = 'none';
    objectiveFeedback(card, correct);
    Speech.speak(card.en);
  });
}

// Shared feedback + continue for objective exercises (listen/wordbank).
function objectiveFeedback(card, correct) {
  haptic(correct ? 30 : 12);
  const fb = $('#ex-fb');
  fb.hidden = false;
  fb.className = 'ex-feedback ' + (correct ? 'good' : 'bad');
  fb.innerHTML = `${correct ? '🌟 정답!' : '💪 아쉬워요'} <b>${card.en}</b><br><span>${card.ko}</span>`;
  const wrap = $('#continue-wrap');
  wrap.hidden = false;
  $('#btn-continue').addEventListener('click', () => gradeCard(card, correct ? 'good' : 'again'));
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Reveal the self-assessment buttons (and any hidden answer) after practice.
function revealGrade() {
  const ans = $('#hidden-answer');
  if (ans) ans.hidden = false;
  $('#grade-prompt').hidden = false;
  $('#grade-row').hidden = false;
  $('#grade-row').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function doSpeak(card) {
  const resEl = $('#speak-result');
  if (!Speech.sttSupported()) {
    resEl.hidden = false;
    resEl.className = 'speak-result warn';
    resEl.textContent =
      '이 기기는 자동 채점(음성 인식)이 안 돼요. 🔊 듣고 소리 내어 따라 말한 뒤, 아래 "말했어요"를 누르세요!';
    revealGrade();
    return;
  }
  const btn = $('#btn-speak');
  btn.classList.add('listening');
  resEl.hidden = false;
  resEl.className = 'speak-result';
  resEl.textContent = '🎙️ 말해보세요...';
  try {
    const transcript = await Speech.listenOnce((st) => {
      if (st === 'processing') resEl.textContent = '⏳ 분석 중...';
    });
    const score = Speech.scorePronunciation(card.en, transcript);
    state.spokeThisCard = true;
    let emoji = score >= 80 ? '🌟' : score >= 55 ? '👍' : '💪';
    let msg = score >= 80 ? '완벽해요!' : score >= 55 ? '좋아요!' : '한 번 더!';
    resEl.className = 'speak-result ' + (score >= 55 ? 'good' : 'mid');
    resEl.innerHTML = `${emoji} <b>${score}점</b> · ${msg}<br><span class="heard">들린 말: “${transcript}”</span>`;
    haptic(score >= 80 ? 30 : 12);
  } catch (err) {
    resEl.className = 'speak-result warn';
    resEl.textContent =
      err.message === 'no_speech'
        ? '🤔 소리가 안 들렸어요. 마이크 권한과 볼륨을 확인하세요.'
        : '⚠️ 음성 인식 오류 (마이크 권한을 허용했나요?)';
  } finally {
    btn.classList.remove('listening');
    revealGrade();
  }
}

function gradeCard(card, grade) {
  haptic();
  // combo logic: good/easy keeps combo; hard neutral; again breaks it
  if (grade === 'good' || grade === 'easy') state.combo += 1;
  else if (grade === 'again') state.combo = 0;

  SRS.review(card.id, grade);

  const g = Game.loadGame();
  const { gained, newAchievements } = Game.registerReview(g, {
    grade,
    card,
    combo: state.combo,
    spoke: state.spokeThisCard,
  });
  state.sessionXp += gained;
  state.sessionCards += 1;
  state.sessionAchievements.push(...newAchievements);

  if (state.combo >= 2) toast(`⚡ ${state.combo} 콤보! +${gained} XP`);
  else toast(`+${gained} XP`);

  state.idx += 1;
  if (state.idx >= state.queue.length) finishSession();
  else renderCard();
}

function finishSession() {
  const g = Game.loadGame();
  $('#done-xp').textContent = '+' + state.sessionXp;
  $('#done-cards').textContent = state.sessionCards;
  $('#done-streak').textContent = g.streak;

  const wrap = $('#done-achievements');
  wrap.innerHTML = '';
  if (state.sessionAchievements.length) {
    state.sessionAchievements.forEach((a) => {
      const el = document.createElement('div');
      el.className = 'ach-pop';
      el.innerHTML = `<span>${a.emoji}</span> <b>${a.name}</b> · ${a.desc}`;
      wrap.appendChild(el);
    });
  }

  // schedule the next reminder now that due times changed
  scheduleNextReminder();
  show('screen-done');
}

// ----------------------------- BROWSE -----------------------------
function renderBrowse() {
  const list = $('#browse-list');
  list.innerHTML = '';
  Object.entries(CATEGORIES).forEach(([key, c]) => {
    const section = document.createElement('div');
    section.className = 'browse-section';
    section.innerHTML = `<h3 style="color:${c.color}">${c.emoji} ${c.label}</h3>`;
    DECK.filter((d) => d.cat === key).forEach((d) => {
      const st = SRS.getCardState(d.id);
      const seen = SRS.loadSrs()[d.id];
      const item = document.createElement('div');
      item.className = 'browse-item';
      item.innerHTML = `
        <div class="bi-main">
          <div class="bi-en">${d.en}</div>
          <div class="bi-ko">${d.ko}</div>
        </div>
        <button class="bi-play">🔊</button>
        ${seen ? '<span class="bi-dot" title="학습함">●</span>' : ''}`;
      item.querySelector('.bi-play').addEventListener('click', () =>
        Speech.speak(d.en)
      );
      section.appendChild(item);
    });
    list.appendChild(section);
  });
}

// ----------------------------- PROFILE -----------------------------
function renderProfile() {
  const g = Game.loadGame();
  const lv = Game.levelFor(g.xp);
  const body = $('#profile-body');
  const achGrid = Game.ACHIEVEMENTS.map((a) => {
    const got = g.achievements.includes(a.id);
    return `<div class="ach-cell ${got ? 'on' : 'off'}">
      <div class="ach-emoji">${a.emoji}</div>
      <div class="ach-name">${a.name}</div>
      <div class="ach-desc">${got ? a.desc : '???'}</div>
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="profile-hero">
      <div class="profile-level">${lv.emoji}</div>
      <div class="profile-lvname">${lv.name}</div>
      <div class="profile-lvsub">Lv.${lv.lvl} · ${g.xp} XP</div>
    </div>
    <div class="profile-grid">
      <div class="pstat"><b>${g.streak}</b><span>🔥 연속</span></div>
      <div class="pstat"><b>${g.totalReviews}</b><span>총 복습</span></div>
      <div class="pstat"><b>${g.speakCount}</b><span>🗣️ 발화</span></div>
      <div class="pstat"><b>${g.catsStudied.length}/4</b><span>분야</span></div>
    </div>
    <h3 class="ach-title">🏆 업적</h3>
    <div class="ach-grid">${achGrid}</div>
    <div class="profile-settings">
      <label>하루 목표 (카드)
        <input type="number" id="goal-input" min="3" max="50" value="${g.dailyGoal}" />
      </label>
      <button class="ghost-btn danger" id="btn-reset">데이터 초기화</button>
    </div>
  `;

  $('#goal-input').addEventListener('change', (e) => {
    const g2 = Game.loadGame();
    g2.dailyGoal = Math.max(3, Math.min(50, +e.target.value || 10));
    Game.saveGame(g2);
    toast('하루 목표 저장됨');
  });
  $('#btn-reset').addEventListener('click', () => {
    if (confirm('모든 진행 상황(XP, 스트릭, 복습 기록)을 지울까요?')) {
      localStorage.clear();
      toast('초기화 완료');
      renderProfile();
    }
  });
}

// ----------------------------- NOTIFICATIONS -----------------------------
// MVP uses LOCAL notifications (scheduled via service worker while installed).
// True server push (multiple nudges/day even when closed) comes in Stage 2.
function updateNotifyButton() {
  const btn = $('#btn-notify');
  if (!('Notification' in window)) {
    btn.textContent = '🔕 알림 미지원';
    btn.disabled = true;
    return;
  }
  if (Notification.permission === 'granted') btn.textContent = '🔔 알림 켜짐';
  else if (Notification.permission === 'denied') btn.textContent = '🔕 알림 차단됨';
  else btn.textContent = '🔔 알림 켜기';
}

async function enableNotifications() {
  if (!('Notification' in window)) return toast('이 브라우저는 알림 미지원');
  const perm = await Notification.requestPermission();
  updateNotifyButton();
  if (perm === 'granted') {
    toast('알림 켜짐! 잊을 때쯤 알려줄게요 🔔');
    scheduleNextReminder();
    // friendly confirmation
    navigator.serviceWorker?.ready.then((reg) =>
      reg.showNotification('회화한입 🍱', {
        body: '준비 완료! 복습할 때가 되면 알려줄게요.',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
      })
    );
  } else {
    toast('알림 권한이 필요해요');
  }
}

/**
 * Schedule a local reminder for when the next card is due.
 * Note: timers only fire while the page/SW is alive — this is a best-effort
 * MVP. Stage 2 replaces this with VAPID web-push for true background nudges.
 */
function scheduleNextReminder() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const next = SRS.nextDueAt(DECK);
  if (!next) return;
  const delay = Math.max(5000, next - Date.now());
  clearTimeout(scheduleNextReminder._t);
  // Cap at ~6h so a long-lived tab still fires something reasonable.
  scheduleNextReminder._t = setTimeout(() => {
    navigator.serviceWorker?.ready.then((reg) => {
      const due = SRS.getDueCards(DECK).length;
      reg.showNotification('회화 한입 시간! 🍱', {
        body: due
          ? `복습할 표현 ${due}개가 기다려요. 1분이면 충분!`
          : '잠깐, 영어 한 입 어때요? 😋',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: 'es-reminder',
        renotify: true,
      });
    });
  }, Math.min(delay, 6 * 60 * 60 * 1000));
}

// ----------------------------- help / how-to -----------------------------
function openHelp() {
  $('#help-modal').hidden = false;
}
function closeHelp() {
  $('#help-modal').hidden = true;
  localStorage.setItem('es_seen_help', '1');
}

// ----------------------------- wire up -----------------------------
function bindEvents() {
  $('#btn-start').addEventListener('click', () => startSession(null));
  $('#btn-help').addEventListener('click', openHelp);
  $('#help-x').addEventListener('click', closeHelp);
  $('#help-start').addEventListener('click', () => {
    closeHelp();
    startSession(null);
  });
  $('#help-modal').addEventListener('click', (e) => {
    if (e.target.id === 'help-modal') closeHelp();
  });
  $('#btn-browse').addEventListener('click', () => {
    renderBrowse();
    show('screen-browse');
  });
  $('#btn-browse-back').addEventListener('click', () => {
    renderHome();
    show('screen-home');
  });
  $('#btn-profile').addEventListener('click', () => {
    renderProfile();
    show('screen-profile');
  });
  $('#btn-profile-back').addEventListener('click', () => {
    renderHome();
    show('screen-home');
  });
  $('#btn-quit').addEventListener('click', () => {
    if (confirm('세션을 끝낼까요?')) {
      renderHome();
      show('screen-home');
    }
  });
  $('#btn-done-home').addEventListener('click', () => {
    renderHome();
    show('screen-home');
  });
  $('#btn-notify').addEventListener('click', enableNotifications);
}

function init() {
  bindEvents();
  renderHome();
  // First launch → show the how-to once.
  if (!localStorage.getItem('es_seen_help')) openHelp();
  if (Notification?.permission === 'granted') scheduleNextReminder();

  // register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) =>
      console.warn('SW registration failed', e)
    );
  }
}

document.addEventListener('DOMContentLoaded', init);
