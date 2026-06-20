/**
 * Gamification layer: XP, levels, daily streak 🔥, combos, achievements.
 * Pure state + helpers; the UI lives in app.js.
 */

const GAME_KEY = 'es_game_v1';

// Funny, themed level names (정치/경제/코미디 감성).
const LEVELS = [
  { lvl: 1, xp: 0, name: '인턴 개그러', emoji: '🐣' },
  { lvl: 2, xp: 100, name: '동네 만담꾼', emoji: '🎤' },
  { lvl: 3, xp: 250, name: '시사 토론 견습생', emoji: '🗣️' },
  { lvl: 4, xp: 500, name: '카페 주문 마스터', emoji: '☕' },
  { lvl: 5, xp: 850, name: '주린이 졸업반', emoji: '📈' },
  { lvl: 6, xp: 1300, name: '풍자 스탠드업', emoji: '😂' },
  { lvl: 7, xp: 1900, name: '여의도 통역사', emoji: '🏛️' },
  { lvl: 8, xp: 2700, name: '월스트리트 수다왕', emoji: '💹' },
  { lvl: 9, xp: 3800, name: '심야 토크쇼 MC', emoji: '🌙' },
  { lvl: 10, xp: 5200, name: '회화 끝판왕', emoji: '👑' },
];

const ACHIEVEMENTS = [
  { id: 'first_card', name: '첫 발화!', desc: '첫 카드를 복습했어요', emoji: '🎉' },
  { id: 'streak_3', name: '작심삼일 격파', desc: '3일 연속 출석', emoji: '🔥' },
  { id: 'streak_7', name: '일주일 개근', desc: '7일 연속 출석', emoji: '🏅' },
  { id: 'combo_5', name: '콤보 마스터', desc: '한 세션 5연속 정답', emoji: '⚡' },
  { id: 'speak_10', name: '입이 트인다', desc: '따라말하기 10회', emoji: '🗣️' },
  { id: 'all_cats', name: '관심사 정복', desc: '4개 분야 모두 학습', emoji: '🌈' },
  { id: 'xp_1000', name: 'XP 천 돌파', desc: '누적 XP 1000', emoji: '💎' },
];

function loadGame() {
  let g;
  try {
    g = JSON.parse(localStorage.getItem(GAME_KEY));
  } catch {
    g = null;
  }
  return (
    g || {
      xp: 0,
      streak: 0,
      lastStudyDay: null, // 'YYYY-MM-DD'
      totalReviews: 0,
      speakCount: 0,
      catsStudied: [], // category keys
      achievements: [], // unlocked ids
      dailyGoal: 10,
      todayCount: 0,
      todayDay: null,
    }
  );
}

function saveGame(g) {
  localStorage.setItem(GAME_KEY, JSON.stringify(g));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function levelFor(xp) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  const next = LEVELS.find((l) => l.xp > xp) || null;
  const span = next ? next.xp - cur.xp : 1;
  const into = xp - cur.xp;
  return {
    ...cur,
    next,
    progress: next ? Math.min(1, into / span) : 1,
    toNext: next ? next.xp - xp : 0,
  };
}

/** Call once when the app opens to roll the daily streak/goal counters. */
function rollDay(g) {
  const today = todayStr();
  if (g.todayDay !== today) {
    g.todayDay = today;
    g.todayCount = 0;
  }
  return g;
}

/**
 * Register a completed review. grade is the SRS grade string.
 * Returns { gained, newAchievements: [] } for UI feedback.
 */
function registerReview(g, { grade, card, combo, spoke }) {
  const today = todayStr();
  const base = { again: 2, hard: 6, good: 10, easy: 14 }[grade] ?? 8;
  const comboBonus = Math.min(10, Math.max(0, combo - 1) * 2);
  const gained = base + comboBonus;

  g.xp += gained;
  g.totalReviews += 1;
  g.todayCount += 1;
  if (spoke) g.speakCount += 1;
  if (card && !g.catsStudied.includes(card.cat)) g.catsStudied.push(card.cat);

  // Streak: increment only on first study of a new day; reset if a day skipped.
  if (g.lastStudyDay !== today) {
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    g.streak = g.lastStudyDay === yesterday ? g.streak + 1 : 1;
    g.lastStudyDay = today;
  }

  const newAchievements = checkAchievements(g, { combo });
  saveGame(g);
  return { gained, newAchievements };
}

function unlock(g, id, out) {
  if (!g.achievements.includes(id)) {
    g.achievements.push(id);
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a) out.push(a);
  }
}

function checkAchievements(g, { combo }) {
  const out = [];
  if (g.totalReviews >= 1) unlock(g, 'first_card', out);
  if (g.streak >= 3) unlock(g, 'streak_3', out);
  if (g.streak >= 7) unlock(g, 'streak_7', out);
  if (combo >= 5) unlock(g, 'combo_5', out);
  if (g.speakCount >= 10) unlock(g, 'speak_10', out);
  if (g.catsStudied.length >= 4) unlock(g, 'all_cats', out);
  if (g.xp >= 1000) unlock(g, 'xp_1000', out);
  return out;
}

window.Game = {
  loadGame,
  saveGame,
  levelFor,
  rollDay,
  registerReview,
  todayStr,
  LEVELS,
  ACHIEVEMENTS,
};
