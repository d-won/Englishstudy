/**
 * Browser speech: Text-to-Speech (listen) + Speech-to-Text (shadowing).
 * Uses the Web Speech API. Best support on Chrome (Android) and Safari (iOS).
 * Everything degrades gracefully when unsupported.
 */

// ---------------------------- TTS (듣기) ----------------------------
function speak(text, { rate = 0.95, lang = 'en-US' } = {}) {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  // Prefer a natural English voice if available.
  const voices = window.speechSynthesis.getVoices();
  const en = voices.find((v) => /en[-_]US/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang));
  if (en) u.voice = en;
  window.speechSynthesis.speak(u);
  return true;
}

// Voices load async on some browsers; warm them up.
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () =>
    window.speechSynthesis.getVoices();
}

// ---------------------------- STT (따라말하기) ----------------------------
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

function sttSupported() {
  return !!SpeechRecognition;
}

/**
 * Listen once and resolve with the transcript.
 * onState(state) gets 'listening' | 'processing' | 'done' | 'error'.
 */
function listenOnce(onState) {
  return new Promise((resolve, reject) => {
    if (!SpeechRecognition) return reject(new Error('STT unsupported'));
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    let finished = false;
    rec.onstart = () => onState && onState('listening');
    rec.onresult = (e) => {
      finished = true;
      onState && onState('processing');
      resolve(e.results[0][0].transcript);
    };
    rec.onerror = (e) => {
      onState && onState('error');
      reject(new Error(e.error || 'stt_error'));
    };
    rec.onend = () => {
      if (!finished) {
        onState && onState('done');
        reject(new Error('no_speech'));
      }
    };
    rec.start();
  });
}

/** Normalize for fair comparison: lowercase, strip punctuation, collapse space. */
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score how close the spoken transcript is to the target (0–100),
 * using word-level overlap (token F1-ish). Forgiving by design — this is
 * practice, not an exam.
 */
function scorePronunciation(target, spoken) {
  const t = normalize(target).split(' ').filter(Boolean);
  const s = normalize(spoken).split(' ').filter(Boolean);
  if (!t.length || !s.length) return 0;

  const sCount = {};
  s.forEach((w) => (sCount[w] = (sCount[w] || 0) + 1));
  let matched = 0;
  t.forEach((w) => {
    if (sCount[w] > 0) {
      matched += 1;
      sCount[w] -= 1;
    }
  });
  const recall = matched / t.length;
  const precision = matched / s.length;
  const f1 = (2 * precision * recall) / (precision + recall || 1);
  return Math.round(f1 * 100);
}

window.Speech = { speak, sttSupported, listenOnce, scorePronunciation, normalize };
