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

function renderCard() {
  const card = state.queue[state.idx];
  state.flipped = false;
  state.spokeThisCard = false;

  // progress + combo
  $('#session-bar').style.width =
    Math.round((state.idx / state.queue.length) * 100) + '%';
  const comboChip = $('#combo-chip');
  if (state.combo >= 2) {
    comboChip.hidden = false;
    $('#combo-num').textContent = state.combo;
  } else {
    comboChip.hidden = true;
  }

  const cat = CATEGORIES[card.cat];
  const levelTag =
    card.level === 1
      ? '<span class="lv-badge lv1">기초</span>'
      : '<span class="lv-badge lv2">중급</span>';

  // Drills (say-it-again variations) — the core of speaking practice.
  const drillsHtml = (card.drills || [])
    .map(
      (d, i) => `
      <div class="drill" data-i="${i}">
        <div class="drill-text">
          <div class="drill-en">${d.en}</div>
          <div class="drill-ko">${d.ko}</div>
        </div>
        <button class="drill-play" data-say="${encodeURIComponent(d.en)}">🔊</button>
      </div>`
    )
    .join('');

  const area = $('#card-area');
  area.innerHTML = `
    <div class="flashcard" id="flashcard" style="--c:${cat.color}">
      <div class="card-cat">${cat.emoji} ${cat.label} ${levelTag}</div>
      <div class="card-situation">${card.situation}</div>
      <div class="card-en" id="card-en">${card.en}</div>
      <div class="card-ipa">${card.ipa || ''}</div>
      <div class="card-ko-inline">${card.ko}</div>

      <div class="card-voice">
        <button class="voice-btn" id="btn-listen">🔊 듣기</button>
        <button class="voice-btn primary" id="btn-speak">🎙️ 따라 말하기</button>
      </div>
      <div class="speak-result" id="speak-result" hidden></div>
      <button class="selfcheck-btn" id="btn-self">✅ 소리 내어 말했어요</button>

      ${
        drillsHtml
          ? `<div class="drills-wrap">
               <div class="drills-title">🔁 단어만 바꿔서 말해보기</div>
               ${drillsHtml}
             </div>`
          : ''
      }

      <details class="card-tip">
        <summary>💡 팁 · 예문</summary>
        <div class="ex-en">“${card.ex_en}”</div>
        <div class="ex-ko">${card.ex_ko}</div>
        <div class="card-fun">${card.fun}</div>
      </details>
    </div>

    <div class="grade-prompt" id="grade-prompt" hidden>방금 얼마나 잘 말했나요?</div>
    <div class="grade-row" id="grade-row" hidden>
      <button class="grade again" data-g="again">😵 못했어</button>
      <button class="grade hard" data-g="hard">😣 더듬더듬</button>
      <button class="grade good" data-g="good">🙂 말했어</button>
      <button class="grade easy" data-g="easy">😎 술술</button>
    </div>
  `;

  // auto-pronounce on appearance (gentle)
  Speech.speak(card.en);

  $('#btn-listen').addEventListener('click', () => {
    haptic();
    Speech.speak(card.en);
  });
  $('#btn-speak').addEventListener('click', () => doSpeak(card));
  $('#btn-self').addEventListener('click', () => {
    state.spokeThisCard = true;
    haptic();
    revealGrade();
  });
  $('#card-en').addEventListener('click', () => Speech.speak(card.en));
  $$('#card-area .drill-play').forEach((b) =>
    b.addEventListener('click', () => {
      haptic();
      Speech.speak(decodeURIComponent(b.dataset.say));
    })
  );
  $$('#grade-row .grade').forEach((b) =>
    b.addEventListener('click', () => gradeCard(card, b.dataset.g))
  );
}

// Reveal the self-assessment buttons once the learner has practiced speaking.
function revealGrade() {
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

// ----------------------------- PWA install -----------------------------
// Android/Chrome fires beforeinstallprompt → we can show a 1-tap install.
// iOS Safari does NOT support programmatic install, so we show manual steps.
let deferredPrompt = null;

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}
function isIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('#install-text').textContent = '📲 홈 화면에 추가하면 앱처럼 쓸 수 있어요';
  $('#btn-install').textContent = '설치';
  $('#install-hint').hidden = false;
});

function setupInstall() {
  // Already installed → nothing to nag about.
  if (isStandalone()) {
    $('#install-hint').hidden = true;
    return;
  }
  // iOS can't auto-install; show manual guidance instead of a dead button.
  if (isIOS()) {
    $('#install-text').innerHTML = '📲 앱처럼 쓰려면 <b>공유 ⬆️ → 홈 화면에 추가</b>';
    $('#btn-install').textContent = '방법 보기';
    $('#install-hint').hidden = false;
  }
  // Other browsers: wait for beforeinstallprompt (hint stays hidden until then).
}

// ----------------------------- wire up -----------------------------
function bindEvents() {
  $('#btn-start').addEventListener('click', () => startSession(null));
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
  $('#btn-install').addEventListener('click', async () => {
    if (deferredPrompt) {
      // Android/Chrome: native install prompt.
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $('#install-hint').hidden = true;
    } else {
      // iOS / unsupported: open the manual how-to.
      $('#ios-install').hidden = false;
    }
  });
  $('#ios-x').addEventListener('click', () => ($('#ios-install').hidden = true));
  $('#ios-install').addEventListener('click', (e) => {
    if (e.target.id === 'ios-install') $('#ios-install').hidden = true;
  });
}

function init() {
  bindEvents();
  renderHome();
  setupInstall();
  if (Notification?.permission === 'granted') scheduleNextReminder();

  // register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) =>
      console.warn('SW registration failed', e)
    );
  }
}

document.addEventListener('DOMContentLoaded', init);
