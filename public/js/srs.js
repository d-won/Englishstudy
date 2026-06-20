/**
 * Tiny spaced-repetition engine (SM-2 "lite"), tuned for micro-learning
 * where we WANT cards to come back several times a day at first.
 *
 * State per card lives in localStorage. A review produces a grade:
 *   'again' (0) → forgot      → reset, show again very soon
 *   'hard'  (1) → shaky       → small interval bump
 *   'good'  (2) → got it      → normal bump
 *   'easy'  (3) → too easy    → big bump
 *
 * Intervals are in MINUTES so the first few reps recur within the same day
 * (10m → 1h → ~6h → 1d → 3d → ...), matching the "hourly nudge" goal.
 */

const SRS_KEY = 'es_srs_v1';

// Early steps (minutes) before graduating to multiplicative scheduling.
const LEARNING_STEPS = [10, 60, 360]; // 10분, 1시간, 6시간

function loadSrs() {
  try {
    return JSON.parse(localStorage.getItem(SRS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSrs(state) {
  localStorage.setItem(SRS_KEY, JSON.stringify(state));
}

function freshCard() {
  return {
    ease: 2.3, // ease factor
    step: 0, // index into LEARNING_STEPS while still "learning"
    interval: 0, // minutes (after graduation)
    due: Date.now(), // due immediately on creation
    reps: 0,
    lapses: 0,
    learned: false, // graduated from learning steps at least once
  };
}

function getCardState(id) {
  const s = loadSrs();
  return s[id] || freshCard();
}

/** Apply a grade to a card and persist. Returns the new state. */
function review(id, grade) {
  const s = loadSrs();
  const c = s[id] || freshCard();
  const MIN = 60 * 1000;

  if (grade === 'again') {
    c.lapses += 1;
    c.step = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.interval = 0;
    c.due = Date.now() + LEARNING_STEPS[0] * MIN;
    c.learned = false;
  } else if (!c.learned && grade !== 'easy') {
    // Still walking through learning steps.
    if (grade === 'hard') {
      // repeat same step a touch later
      c.due = Date.now() + LEARNING_STEPS[c.step] * MIN;
    } else {
      // 'good' → advance a step
      c.step += 1;
      if (c.step >= LEARNING_STEPS.length) {
        c.learned = true;
        c.interval = 24 * 60; // graduate to 1 day
        c.due = Date.now() + c.interval * MIN;
      } else {
        c.due = Date.now() + LEARNING_STEPS[c.step] * MIN;
      }
    }
  } else {
    // Graduated (or 'easy' shortcut): multiplicative intervals.
    c.learned = true;
    if (c.interval === 0) c.interval = 24 * 60;
    const mult =
      grade === 'easy' ? c.ease + 0.15 : grade === 'hard' ? 1.2 : c.ease;
    if (grade === 'easy') c.ease += 0.05;
    if (grade === 'hard') c.ease = Math.max(1.3, c.ease - 0.15);
    c.interval = Math.round(c.interval * mult);
    c.due = Date.now() + c.interval * MIN;
  }

  c.reps += 1;
  s[id] = c;
  saveSrs(s);
  return c;
}

/** Cards whose due time has passed, soonest-first. */
function getDueCards(deck) {
  const now = Date.now();
  return deck
    .map((card) => ({ card, state: getCardState(card.id) }))
    .filter((x) => x.state.due <= now)
    .sort((a, b) => a.state.due - b.state.due);
}

/** Cards never reviewed yet (brand new). */
function getNewCards(deck) {
  const s = loadSrs();
  return deck.filter((card) => !s[card.id]);
}

/** When is the next card due? null if none scheduled. */
function nextDueAt(deck) {
  const s = loadSrs();
  const times = deck.map((c) => (s[c.id] ? s[c.id].due : Date.now()));
  if (!times.length) return null;
  return Math.min(...times);
}

window.SRS = {
  getCardState,
  review,
  getDueCards,
  getNewCards,
  nextDueAt,
  loadSrs,
};
