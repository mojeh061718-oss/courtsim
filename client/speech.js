/**
 * CourtSpeech — natural courtroom voices with instant interruption.
 *
 * Primary path: server-side Amazon Polly neural/generative speech via
 * POST /api/tts, played through a single (iOS-unlocked) audio element with
 * paragraph prefetch so delivery flows without gaps. Each courtroom role has
 * a distinct voice; jurors rotate through an ensemble by seat.
 *
 * Fallback path: the browser's speechSynthesis at natural rate (no slowed
 * rate, no pitch manipulation — those are what make it sound robotic).
 *
 * The active event/paragraph is tracked so an OBJECTION lands on exactly what
 * was being said, and interrupt() halts speech mid-word.
 */
(function () {
  const synth = window.speechSynthesis;
  let voices = [];
  let muted = false;
  let queue = [];
  let current = null; // { eventId, paragraphIndex, role, ... }
  let pumping = false;
  let unlocked = false;

  const audioEl = new Audio();
  audioEl.preload = 'auto';

  const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

  function loadVoices() {
    voices = synth ? synth.getVoices() : [];
  }
  if (synth) {
    loadVoices();
    synth.onvoiceschanged = loadVoices;
  }

  /* ---------- Polly path ---------- */

  function settings() {
    return window.CourtSettings || {};
  }

  function resolveVoice(role, gender) {
    const s = settings();
    if (role === 'judge') return s.judge;
    if (role === 'ai_counsel') return s.counsel;
    if (role === 'clerk') return s.clerk;
    if (role === 'witness') return gender === 'f' ? s.witnessF : gender === 'm' ? s.witnessM : s.witnessF;
    return undefined; // jurors keep the server-side ensemble
  }

  async function fetchAudio(text, role, key, gender) {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, role, key, voice: resolveVoice(role, gender) }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return blob.size > 200 ? blob : null;
    } catch {
      return null;
    }
  }

  function playBlob(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const done = () => {
        audioEl.removeEventListener('ended', done);
        audioEl.removeEventListener('error', done);
        URL.revokeObjectURL(url);
        resolve();
      };
      audioEl.addEventListener('ended', done);
      audioEl.addEventListener('error', done);
      audioEl.src = url;
      const rate = Number(settings().speed) || 1;
      audioEl.defaultPlaybackRate = rate;
      audioEl.playbackRate = rate;
      audioEl.play().then(() => { audioEl.playbackRate = rate; }).catch(done);
    });
  }

  /* ---------- browser fallback (kept natural) ---------- */

  function pickVoice(role) {
    if (!voices.length) return null;
    const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
    const premium = en.filter((v) => /premium|enhanced|natural|siri|google/i.test(v.name));
    const pool = premium.length ? premium : en.length ? en : voices;
    const idx = { judge: 0, ai_counsel: 1, witness: 2, clerk: 3, juror: 4 }[role] ?? 0;
    return pool[idx % pool.length];
  }

  function speakFallback(text, role) {
    return new Promise((resolve) => {
      if (!synth || !text.trim()) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = Number(settings().speed) || 1.0; // natural pace — slowing it is what sounds "underwater"
      const v = pickVoice(role);
      if (v) u.voice = v;
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

  /* ---------- queue pump with prefetch ---------- */

  async function pump() {
    if (pumping) return;
    pumping = true;
    while (queue.length) {
      const item = queue.shift();
      current = item;
      // Prefetch: fire the first two paragraph requests immediately.
      item.blobs = item.paragraphs.map(() => null);
      const prefetch = (i) => {
        if (i < item.paragraphs.length && !item.blobs[i]) {
          item.blobs[i] = fetchAudio(item.paragraphs[i], item.role, item.key, item.gender);
        }
      };
      prefetch(0);
      prefetch(1);

      for (let i = 0; i < item.paragraphs.length; i++) {
        if (current !== item) break; // interrupted
        current.paragraphIndex = i;
        if (item.onParagraph) item.onParagraph(item.eventId, i);
        prefetch(i + 1); // keep the pipeline one paragraph ahead
        if (queue[0]) {
          queue[0].blobs = queue[0].blobs || queue[0].paragraphs.map(() => null);
          if (!queue[0].blobs[0]) queue[0].blobs[0] = fetchAudio(queue[0].paragraphs[0], queue[0].role, queue[0].key, queue[0].gender);
        }
        if (muted) continue;
        const blob = await item.blobs[i];
        if (current !== item) break;
        if (blob) await playBlob(blob);
        else await speakFallback(item.paragraphs[i], item.role);
      }
      if (current === item) {
        current = null;
        if (item.onDone) item.onDone(item.eventId);
      }
    }
    pumping = false;
  }

  window.CourtSpeech = {
    /** Unlock audio on iOS — call from the first user gesture. */
    unlock() {
      if (unlocked) return;
      unlocked = true;
      try {
        audioEl.src = SILENT_WAV;
        audioEl.play().catch(() => {});
        if (synth) {
          const u = new SpeechSynthesisUtterance(' ');
          u.volume = 0;
          synth.speak(u);
          loadVoices();
        }
      } catch {
        /* no-op */
      }
    },

    /** Queue an event for narration. paragraphs: string[]; key varies juror voices. */
    enqueue({ eventId, paragraphs, role, key, gender, onParagraph, onDone }) {
      queue.push({ eventId, paragraphs, role, key: key ?? 0, gender: gender || null, onParagraph, onDone });
      pump();
    },

    /** Play a short sample of a specific voice (settings menu preview). */
    async preview(voiceId) {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'May it please the court. We are ready to proceed.', role: 'witness', voice: voiceId }),
        });
        if (!res.ok) return;
        const blob = await res.blob();
        this.interrupt();
        await playBlob(blob);
      } catch { /* no-op */ }
    },

    /** Stop mid-word. Returns {eventId, paragraphIndex} of what was speaking. */
    interrupt() {
      const at = current ? { eventId: current.eventId, paragraphIndex: current.paragraphIndex || 0 } : null;
      queue = [];
      current = null;
      try {
        audioEl.pause();
        audioEl.removeAttribute('src');
      } catch {
        /* no-op */
      }
      if (synth) synth.cancel();
      pumping = false;
      return at;
    },

    /** Where narration currently is (for objections while speech continues). */
    position() {
      return current ? { eventId: current.eventId, paragraphIndex: current.paragraphIndex || 0 } : null;
    },

    isSpeaking() {
      return Boolean(current) || (!audioEl.paused && !audioEl.ended) || (synth && synth.speaking);
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
