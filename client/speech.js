/**
 * CourtSpeech — natural-voice narration with courtroom pacing and instant
 * interruption. Wraps the browser SpeechSynthesis API.
 *
 * - Speaks events paragraph-by-paragraph at a measured pace (rate ~0.92).
 * - The active event/paragraph is tracked so an OBJECTION lands on exactly
 *   what was being said when the attorney rose.
 * - interrupt() halts speech mid-word (Space or the OBJECTION key).
 */
(function () {
  const synth = window.speechSynthesis;
  let voices = [];
  let muted = false;
  let queue = [];
  let current = null; // { eventId, paragraphIndex, role, onDone }
  let speakingNow = false;

  function loadVoices() {
    voices = synth ? synth.getVoices() : [];
  }
  if (synth) {
    loadVoices();
    synth.onvoiceschanged = loadVoices;
  }

  function pickVoice(role) {
    if (!voices.length) return null;
    const prefer = {
      judge: [/en[-_]US/i],
      ai_counsel: [/en[-_]US/i, /en[-_]GB/i],
      witness: [/en/i],
      juror: [/en/i],
      clerk: [/en/i],
    }[role] || [/en/i];
    const natural = voices.filter((v) => /google|natural|enhanced|premium/i.test(v.name) && /en/i.test(v.lang));
    const pool = natural.length ? natural : voices.filter((v) => /en/i.test(v.lang));
    if (!pool.length) return voices[0];
    // Stable spread of voices across roles so actors sound distinct.
    const idx = { judge: 0, ai_counsel: 1, witness: 2, clerk: 3, juror: 4 }[role] ?? 0;
    for (const re of prefer) {
      const m = pool.filter((v) => re.test(v.lang));
      if (m.length) return m[idx % m.length];
    }
    return pool[idx % pool.length];
  }

  const ROLE_TUNING = {
    judge: { rate: 0.88, pitch: 0.8 },
    ai_counsel: { rate: 0.94, pitch: 1.0 },
    witness: { rate: 0.92, pitch: 1.05 },
    juror: { rate: 0.95, pitch: 1.0 },
    clerk: { rate: 0.9, pitch: 0.95 },
  };

  function speakParagraph(text, role) {
    return new Promise((resolve) => {
      if (!synth || muted || !text.trim()) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const tune = ROLE_TUNING[role] || { rate: 0.92, pitch: 1 };
      u.rate = tune.rate;
      u.pitch = tune.pitch;
      const v = pickVoice(role);
      if (v) u.voice = v;
      // iOS/Chrome occasionally pause long syntheses; nudge them along.
      const watchdog = setInterval(() => {
        if (synth.paused) synth.resume();
      }, 3000);
      const done = () => {
        clearInterval(watchdog);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    });
  }

  /* iOS Safari requires a user gesture before audio may start. Called once
   * from the first touch/click — speaks a silent utterance to unlock. */
  let unlocked = false;
  function unlock() {
    if (unlocked || !synth) return;
    unlocked = true;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
      loadVoices();
    } catch {
      /* no-op */
    }
  }

  async function pump() {
    if (speakingNow) return;
    speakingNow = true;
    while (queue.length) {
      const item = queue.shift();
      current = item;
      for (let i = item.startPara || 0; i < item.paragraphs.length; i++) {
        current.paragraphIndex = i;
        if (item.onParagraph) item.onParagraph(item.eventId, i);
        await speakParagraph(item.paragraphs[i], item.role);
        if (current !== item) break; // interrupted
      }
      if (current === item) {
        current = null;
        if (item.onDone) item.onDone(item.eventId);
      }
    }
    speakingNow = false;
  }

  window.CourtSpeech = {
    /** Unlock audio on iOS — call from the first user gesture. */
    unlock,
    /** Queue an event for narration. paragraphs: string[]. */
    enqueue({ eventId, paragraphs, role, onParagraph, onDone }) {
      queue.push({ eventId, paragraphs, role, onParagraph, onDone });
      pump();
    },
    /** Stop mid-word. Returns {eventId, paragraphIndex} of what was speaking. */
    interrupt() {
      const at = current ? { eventId: current.eventId, paragraphIndex: current.paragraphIndex || 0 } : null;
      queue = [];
      current = null;
      if (synth) synth.cancel();
      speakingNow = false;
      return at;
    },
    /** Where narration currently is (for objections while speech continues). */
    position() {
      return current ? { eventId: current.eventId, paragraphIndex: current.paragraphIndex || 0 } : null;
    },
    isSpeaking() {
      return Boolean(current) || (synth && synth.speaking);
    },
    setMuted(m) {
      muted = m;
      if (m) this.interrupt();
    },
    get muted() {
      return muted;
    },
  };
})();
