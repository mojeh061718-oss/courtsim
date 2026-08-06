/* CourtSim client — courtroom UI, flow control, objection hotkey. */
(function () {
  // One-time fresh start for this release: wipe all locally stored state
  // (old trial pointers, old settings) so the app opens like a first install.
  const SCHEMA = 'courtsim-2026-08-06-v18';
  try {
    if (localStorage.getItem('courtsim-schema') !== SCHEMA) {
      localStorage.clear();
      localStorage.setItem('courtsim-schema', SCHEMA);
    }
  } catch { /* storage unavailable — nothing to wipe */ }

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const S = {
    cases: [],
    bases: [],
    selectedCase: null, // full case detail
    trialId: null,
    state: null,
    pretrialDone: false,
    autoAdvance: true,
    busy: false,
    lastSpokenTarget: null,
  };

  /* ================= boot ================= */

  async function api(path, opts = {}) {
    // Hard client-side timeout so a stalled call can never wedge the UI.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 300000);
    try {
      const res = await fetch('/api' + path, {
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        ...opts,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || res.statusText);
      }
      return res.json();
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('The court took too long to respond — tap to try again.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function showError(msg) {
    const line = $('#error-line');
    if (!line) return alert(msg);
    line.textContent = '⚠️ ' + msg;
    line.classList.remove('hidden');
    clearTimeout(S._errTimer);
    S._errTimer = setTimeout(() => line.classList.add('hidden'), 8000);
  }

  async function boot() {
    const [{ cases }, { bases }] = await Promise.all([api('/cases'), api('/objection-bases')]);
    S.cases = cases;
    S.bases = bases;
    renderCaseList();
    fillBasisSelect();
    await tryResume();
  }

  /* ================= auto save / resume ================= */
  // The server checkpoints the trial after every action; the client only needs
  // to remember WHICH trial is active. On open, we rejoin it at the exact spot.

  const ACTIVE_KEY = 'courtsim-active';

  function saveActive() {
    if (!S.trialId || !S.state) return;
    if (S.state.phase === 'verdict') return localStorage.removeItem(ACTIVE_KEY);
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify({ trialId: S.trialId, caseId: S.selectedCase.id, title: S.selectedCase.title, ts: Date.now() }));
    } catch { /* storage full/blocked — resume just won't be available */ }
  }

  function readActive() {
    try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); } catch { return null; }
  }

  async function tryResume() {
    const ptr = readActive();
    if (!ptr || !ptr.trialId) return;
    // A deliberate Exit pauses the trial: land on the home screen with a
    // resume card, not back in the courtroom. Only an app killed mid-trial
    // auto-resumes straight to the exact point.
    if (ptr.paused) return renderResumeCard(ptr);
    await restoreTrial(ptr);
  }

  async function restoreTrial(ptr) {
    let r;
    try {
      r = await api('/trial/' + ptr.trialId, { timeoutMs: 20000 });
    } catch {
      localStorage.removeItem(ACTIVE_KEY); // trial no longer on the server
      $('#resume-card').classList.add('hidden');
      return;
    }
    if (!r || !r.state || r.state.phase === 'verdict') return localStorage.removeItem(ACTIVE_KEY);
    try {
      S.selectedCase = await api('/cases/' + ptr.caseId);
      S.gen = (S.gen || 0) + 1;
      S.trialId = ptr.trialId;
      S.state = r.state;
      S.pretrialDone = r.state.phase !== 'pretrial';
      S.strategy = null;
      S.strategyLoading = false;
      $('#strategy-content').innerHTML = '';
      $('#screen-select').classList.add('hidden');
      $('#screen-court').classList.remove('hidden');
      $('#hdr-case').textContent = S.selectedCase.title;
      renderJury();
      renderDockets();
      loadBinder();
      // Replay the record silently — rebuild every line, speak none of it.
      $('#transcript').innerHTML = '';
      for (const ev of r.record || []) {
        if (ev.meta?.strikeTargetId) applyStrike(ev.meta.strikeTargetId, ev.meta.strikeParagraph);
        renderEvent(ev);
        if (ev.speak && ['ai_counsel', 'witness'].includes(ev.actor)) S.lastSpokenTarget = { eventId: ev.id };
      }
      S.objectionHold = false;
      S.queuedObjection = null;
      renderControls();
      maybeAutoAdvance();
      $('#resume-card').classList.add('hidden');
      try { localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...ptr, paused: false, ts: Date.now() })); } catch { /* fine */ }
    } catch (err) {
      // Never leave a half-restored courtroom: back to a clean case list.
      localStorage.removeItem(ACTIVE_KEY);
      S.trialId = null;
      S.state = null;
      $('#screen-court').classList.add('hidden');
      $('#screen-select').classList.remove('hidden');
      console.warn('resume failed', err);
    }
  }

  /* ============ pause / exit ============ */
  // The trial is turn-based and the server checkpoints every action, so
  // "pause" simply means: stop the room, keep the save, go home.

  function renderResumeCard(ptr) {
    const card = $('#resume-card');
    card.innerHTML = '';
    card.appendChild(el('div', 'rc-title', `⏸ Trial in progress — ${ptr.title || 'your case'}`));
    card.appendChild(el('div', 'rc-sub', 'Paused exactly where you left it. The full record is saved.'));
    const row = el('div', 'rc-actions');
    const resume = el('button', 'btn primary', 'Resume the trial');
    resume.onclick = () => restoreTrial(ptr);
    const discard = el('button', 'btn ghost', 'Close it for good');
    discard.onclick = async () => {
      if (!confirm('Close this trial permanently? The record will be deleted as if it never happened.')) return;
      try { await api('/trial/' + ptr.trialId, { method: 'DELETE', timeoutMs: 15000 }); } catch { /* server may already have purged it */ }
      localStorage.removeItem(ACTIVE_KEY);
      card.classList.add('hidden');
    };
    row.appendChild(resume);
    row.appendChild(discard);
    card.appendChild(row);
    card.classList.remove('hidden');
  }

  function exitTrial() {
    if (!S.trialId) return;
    const finished = S.state?.phase === 'verdict';
    CourtSpeech.interrupt();
    clearTimeout(S._autoTimer);
    S.gen = (S.gen || 0) + 1; // discard any in-flight responses
    S.objectionHold = false;
    S.queuedObjection = null;
    const ptr = { trialId: S.trialId, caseId: S.selectedCase.id, title: S.selectedCase.title, ts: Date.now(), paused: true };
    S.trialId = null;
    S.state = null;
    $('#screen-court').classList.add('hidden');
    $('#verdict-banner').classList.add('hidden');
    $('#screen-select').classList.remove('hidden');
    if (finished) {
      localStorage.removeItem(ACTIVE_KEY);
    } else {
      try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(ptr)); } catch { /* fine */ }
      renderResumeCard(ptr);
    }
  }

  $('#btn-exit').onclick = exitTrial;

  /* ================= case selection ================= */

  function renderCaseList() {
    const grid = $('#case-list');
    grid.innerHTML = '';
    for (const c of S.cases) {
      const card = el('div', 'case-card');
      card.appendChild(el('h3', null, c.title));
      card.appendChild(el('div', 'jur', `${c.jurisdiction} · ${c.status}`));
      card.appendChild(el('p', null, c.blurb));
      card.appendChild(el('div', 'charges', c.charges.join(' · ')));
      card.appendChild(el('div', 'cta', 'Take this case →'));
      card.onclick = () => showSidePicker(c.id);
      grid.appendChild(card);
    }
  }

  async function showSidePicker(caseId) {
    const detail = await api('/cases/' + caseId);
    S.selectedCase = detail;
    $('#case-list').classList.add('hidden');
    $('#generator').classList.add('hidden');
    $('#side-picker').classList.remove('hidden');
    $('#side-case-title').textContent = detail.title;
    $('#side-case-blurb').textContent = detail.blurb;
    $('#case-disclaimer').textContent = detail.disclaimer;
    const d = $('#case-detail');
    d.innerHTML = '';
    d.appendChild(el('p', null, `Presiding: Hon. ${detail.parties.judge} · Prosecution: ${detail.parties.prosecutor} · Defense: ${detail.parties.defenseCounsel}`));
    const roster = el('div', 'roster');
    for (const w of detail.witnesses) roster.appendChild(el('div', null, `• ${w.name} (${w.side})`));
    d.appendChild(el('p', null, `Witness roster (${detail.witnesses.length}):`));
    d.appendChild(roster);
    d.appendChild(el('p', null, `Exhibit list: ${detail.evidence.length} items of top relevance.`));

    // What each side must overcome — review BEFORE choosing.
    const hw = $('#case-hurdles');
    hw.innerHTML = '';
    const h = detail.hurdles || {};
    if ((h.prosecution || []).length || (h.defense || []).length) {
      hw.appendChild(el('h3', 'hurdles-title', '⚔️ What each side must overcome'));
      for (const side of ['prosecution', 'defense']) {
        const card = el('div', `hurdle-card ${side}`);
        card.appendChild(el('h4', null, side === 'prosecution' ? 'If you take the PROSECUTION' : 'If you take the DEFENSE'));
        const ul = el('ul');
        for (const item of h[side] || []) ul.appendChild(el('li', null, item));
        card.appendChild(ul);
        hw.appendChild(card);
      }
    }
  }

  $('#btn-back').onclick = () => {
    $('#side-picker').classList.add('hidden');
    $('#case-list').classList.remove('hidden');
    $('#generator').classList.remove('hidden');
  };
  $('#btn-prosecution').onclick = () => startTrial('prosecution');
  $('#btn-defense').onclick = () => startTrial('defense');

  /* ================= difficulty & case generator ================= */

  function diffLabel(l) {
    if (l <= 2) return 'Training wheels';
    if (l <= 4) return 'Competent opponent';
    if (l <= 6) return 'Seasoned litigator';
    if (l <= 8) return 'Veteran first chair';
    return 'Dream Team';
  }

  // The generator slider measures the CASE, not the opponents: how contested
  // the truth itself is, from open-and-shut to nation-splitting.
  function complexityLabel(l) {
    if (l <= 2) return 'Open-and-shut';
    if (l <= 4) return 'Strong but not airtight';
    if (l <= 6) return 'Genuinely contested';
    if (l <= 8) return 'Two believable stories';
    return 'Nation-splitting';
  }
  function complexityDesc(l) {
    if (l <= 2) return 'The record points firmly one way — clean evidence, consistent witnesses. The challenge is choosing the uphill side and finding the honest angles anyway.';
    if (l <= 4) return 'One side is clearly favored, but there are real soft spots: a witness with baggage, an exhibit that needs shoring up.';
    if (l <= 6) return 'Both sides hold real evidence and real problems. Two or three legitimate evidentiary fights will decide it.';
    if (l <= 8) return 'Dueling experts, disputed forensics, a credible alternative account. Either theory survives first contact.';
    return 'A case the public would argue about for years — every pillar of the State\'s case has a counter-narrative, and honest jurors can land on opposite verdicts.';
  }
  function bindSlider(rangeSel, valSel, labelSel) {
    const r = $(rangeSel);
    const update = () => {
      $(valSel).textContent = r.value;
      $(labelSel).textContent = diffLabel(Number(r.value));
    };
    r.oninput = update;
    update();
    return r;
  }
  // Generator slider speaks complexity; the pre-trial slider speaks opponent skill.
  {
    const r = $('#gen-difficulty');
    const update = () => {
      const l = Number(r.value);
      $('#gen-diff-val').textContent = r.value;
      $('#gen-diff-label').textContent = complexityLabel(l);
      $('#gen-diff-desc').textContent = complexityDesc(l);
    };
    r.oninput = update;
    update();
  }
  bindSlider('#side-difficulty', '#side-diff-val', '#side-diff-label');

  $('#btn-generate').onclick = async () => {
    const btn = $('#btn-generate');
    const status = $('#gen-status');
    btn.disabled = true;
    const t0 = Date.now();
    status.textContent = 'Drafting the case file — witnesses, exhibits, jurors… (usually 30–90 seconds)';
    const ticker = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      status.textContent = `Drafting the case file — witnesses, exhibits, jurors… ${s}s (usually 30–90 seconds${s > 90 ? '; still working, hang tight' : ''})`;
    }, 1000);
    try {
      const r = await api('/generate-case', {
        method: 'POST',
        body: JSON.stringify({ theme: $('#gen-theme').value.trim(), difficulty: Number($('#gen-difficulty').value) }),
      });
      const { cases } = await api('/cases');
      S.cases = cases;
      renderCaseList();
      await showSidePicker(r.id);
      $('#side-difficulty').value = String(r.difficulty);
      $('#side-difficulty').dispatchEvent(new Event('input'));
      clearInterval(ticker);
      status.textContent = r.fallback
        ? '⚠️ Live generation was unavailable — you received a stock training case. Try again in a minute for a fresh one.'
        : '';
    } catch (err) {
      status.textContent = 'Generation failed: ' + err.message + ' — try again.';
    } finally {
      clearInterval(ticker);
      btn.disabled = false;
    }
  };

  async function startTrial(side) {
    // New generation: any response still in flight for the previous trial
    // (auto-advance, strategy fetch) is discarded when it lands.
    S.gen = (S.gen || 0) + 1;
    const r = await api('/trial', {
      method: 'POST',
      body: JSON.stringify({ caseId: S.selectedCase.id, side, difficulty: Number($('#side-difficulty').value) }),
    });
    S.trialId = r.trialId;
    S.state = r.state;
    S.pretrialDone = false;
    S.strategy = null;
    S.strategyLoading = false;
    S.lastSpokenTarget = null;
    S.objectionTarget = null;
    S.objectionHold = false;
    S.queuedObjection = null;
    $('#strategy-content').innerHTML = '';
    // Fresh courtroom whether this is a first trial or a restart.
    CourtSpeech.interrupt();
    $('#transcript').innerHTML = '';
    $('#verdict-banner').classList.add('hidden');
    $('#screen-select').classList.add('hidden');
    $('#screen-court').classList.remove('hidden');
    $('#hdr-case').textContent = S.selectedCase.title;
    saveActive();
    renderJury();
    renderDockets();
    loadBinder();
    ingestEvents(r.events);
    renderControls();
  }

  /* ================= transcript & speech ================= */

  const ROLE_CLASS = { judge: 'judge', ai_counsel: 'counsel', witness: 'witness', juror: 'juror', clerk: 'system', system: 'system', user: 'user' };

  function ingestEvents(events) {
    for (const ev of events) {
      if (ev.meta?.strikeTargetId) applyStrike(ev.meta.strikeTargetId, ev.meta.strikeParagraph);
      renderEvent(ev);
      if (ev.speak && !CourtSpeech.muted && !S.objectionHold) {
        const paragraphs = ev.paragraphList && ev.paragraphList.length ? ev.paragraphList : [ev.text];
        const seat = ev.actor === 'juror' ? Number((ev.name.match(/Juror (\d+)/) || [])[1] || 0) : 0;
        CourtSpeech.enqueue({
          eventId: ev.id,
          paragraphs,
          role: ev.actor,
          key: seat,
          gender: ev.meta?.gender || null,
          onParagraph: highlightParagraph,
          onDone: clearHighlight,
        });
      }
      // Track the last *objectionable* speaker (counsel/witness) so an
      // objection raised after speech ends lands on their words, not the
      // judge's procedural lines.
      if (ev.speak && ['ai_counsel', 'witness'].includes(ev.actor)) {
        S.lastSpokenTarget = { eventId: ev.id };
      }
      if (ev.actor === 'juror') flashJuror(ev.name);
    }
    maybeAutoAdvance();
  }

  function renderEvent(ev) {
    const t = $('#transcript');
    const wrap = el('div', `ev ${ROLE_CLASS[ev.actor] || ''} ${ev.kind === 'objection' ? 'objection' : ''}`);
    wrap.dataset.eventId = ev.id;
    const who = el('div', 'who', ev.name + (ev.kind === 'ruling' ? ' — RULING' : ev.kind === 'objection' ? ' — OBJECTION' : ''));
    const bubble = el('div', 'bubble');
    if (ev.paragraphList && ev.paragraphList.length > 1) {
      ev.paragraphList.forEach((p, i) => {
        const para = el('p', 'para', p);
        para.dataset.para = i;
        bubble.appendChild(para);
      });
    } else {
      bubble.textContent = ev.text;
    }
    wrap.appendChild(who);
    wrap.appendChild(bubble);
    t.appendChild(wrap);
    t.scrollTop = t.scrollHeight;
  }

  function highlightParagraph(eventId, i) {
    document.querySelectorAll('.para.speaking-now').forEach((n) => n.classList.remove('speaking-now'));
    const node = document.querySelector(`[data-event-id="${eventId}"] [data-para="${i}"]`);
    if (node) node.classList.add('speaking-now');
  }
  function clearHighlight() {
    document.querySelectorAll('.para.speaking-now').forEach((n) => n.classList.remove('speaking-now'));
  }

  function applyStrike(eventId, paragraphIndex) {
    const wrap = document.querySelector(`[data-event-id="${eventId}"]`);
    if (!wrap) return;
    if (typeof paragraphIndex === 'number') {
      const p = wrap.querySelector(`[data-para="${paragraphIndex}"]`);
      if (p) p.classList.add('stricken');
    } else {
      wrap.classList.add('stricken');
    }
    if (!wrap.querySelector('.stricken-tag')) {
      wrap.querySelector('.who').appendChild(el('span', 'stricken-tag', 'STRICKEN'));
    }
  }

  function flashJuror(name) {
    const seat = (name.match(/Juror (\d+)/) || [])[1];
    if (!seat) return;
    const node = document.querySelector(`.juror[data-seat="${seat}"]`);
    if (node) {
      node.classList.add('speaking');
      setTimeout(() => node.classList.remove('speaking'), 4000);
    }
  }

  /* ================= panels ================= */

  function renderJury() {
    const box = $('#jury-box');
    box.innerHTML = '';
    for (const j of S.state.jury) {
      const n = el('div', 'juror');
      n.dataset.seat = j.seat;
      n.appendChild(el('span', 'seat', String(j.seat)));
      n.appendChild(document.createTextNode(j.name.split(' ')[0] + ' · ' + j.occupation.split(' ').slice(0, 2).join(' ')));
      n.title = `${j.name} — ${j.occupation}`;
      box.appendChild(n);
    }
  }

  /* ================= trial binder (counsel-table case notes) ================= */

  async function loadBinder() {
    try {
      S.binder = await api(`/cases/${S.selectedCase.id}/binder`);
      renderBinder();
    } catch (err) {
      $('#binder-content').textContent = 'Could not load the case binder: ' + err.message;
    }
  }

  function renderBinder() {
    const b = S.binder;
    const root = $('#binder-content');
    root.innerHTML = '';
    if (!b) return;

    const section = (title, open = false) => {
      const d = el('details', 'binder-section');
      if (open) d.open = true;
      d.appendChild(el('summary', null, title));
      root.appendChild(d);
      return d;
    };
    const item = (parent, head, body) => {
      const n = el('div', 'binder-item');
      if (head) n.appendChild(el('div', 'bi-head', head));
      if (body) n.appendChild(el('div', 'bi-body', body));
      parent.appendChild(n);
      return n;
    };

    const mySide = S.state?.userSide || 'prosecution';
    const oppSide = mySide === 'prosecution' ? 'defense' : 'prosecution';

    const facts = section('Facts of the case', true);
    for (const para of String(b.factSummary).split(/(?<=\.)\s+(?=[A-Z])/g).reduce((acc, s) => {
      // group sentences into readable chunks of ~2-3
      const last = acc[acc.length - 1];
      if (last && last.count < 3 && (last.text + s).length < 420) { last.text += ' ' + s; last.count++; }
      else acc.push({ text: s, count: 1 });
      return acc;
    }, [])) {
      item(facts, null, para.text);
    }

    const theory = section('Theory of the case');
    item(theory, `YOUR theory (${mySide})`, b.theories[mySide]);
    item(theory, `Opposing theory (${oppSide})`, b.theories[oppSide]);

    if (b.hurdles && ((b.hurdles[mySide] || []).length || (b.hurdles[oppSide] || []).length)) {
      const hurdles = section('Things to overcome');
      item(hurdles, `YOUR hurdles (${mySide})`, (b.hurdles[mySide] || []).map((x) => '• ' + x).join('\n'));
      item(hurdles, `Their hurdles (${oppSide}) — attack here`, (b.hurdles[oppSide] || []).map((x) => '• ' + x).join('\n'));
    }

    const charges = section('Charges & elements');
    for (const ch of b.charges) {
      item(charges, ch.name, `Elements: ${ch.elements.join(' • ')}\nVerdict options: ${ch.verdictOptions.map((v) => v.replace(/_/g, ' ')).join(' / ')}${ch.lesserNote ? '\n' + ch.lesserNote : ''}`);
    }

    const wit = section('Witness notes (what each witness knows)');
    for (const w of b.witnesses) {
      item(wit, `${w.name} — ${w.side}`, `${w.description}\nDemeanor: ${w.demeanor}\nKNOWS: ${w.knowledge}`);
    }

    const ex = section('Exhibits');
    for (const e of b.evidence) {
      item(ex, e.label, `${e.desc} — offered by ${e.offeredBy}`);
    }

    const instr = section('Jury instructions (the law they will apply)');
    item(instr, null, b.juryInstructions);

    const parties = section('Parties & court');
    item(parties, null, `${b.title}${b.caseNumber ? ' — ' + b.caseNumber : ''}\nPresiding: Hon. ${b.parties.judge}\nDefendant: ${b.parties.defendant}\nVictim(s): ${b.parties.victims.join('; ')}\nProsecution: ${b.parties.prosecutor}\nDefense: ${b.parties.defenseCounsel}`);
  }

  $('#binder-search').addEventListener('input', () => {
    const q = $('#binder-search').value.trim().toLowerCase();
    document.querySelectorAll('#binder-content .binder-section').forEach((sec) => {
      let visible = 0;
      sec.querySelectorAll('.binder-item').forEach((it) => {
        const hit = !q || it.textContent.toLowerCase().includes(q);
        it.classList.toggle('hidden', !hit);
        if (hit) visible++;
      });
      sec.classList.toggle('hidden', q && visible === 0);
      if (q && visible) sec.open = true;
    });
  });

  function renderDockets() {
    const w = $('#tab-witnesses');
    w.innerHTML = '';
    for (const wit of S.selectedCase.witnesses) {
      const item = el('div', 'docket-item');
      const t = el('div', 't', wit.name);
      t.appendChild(el('span', 'side-tag', wit.side));
      item.appendChild(t);
      item.appendChild(el('div', 'd', wit.description));
      item.dataset.witnessId = wit.id;
      w.appendChild(item);
    }
    const e = $('#tab-evidence');
    e.innerHTML = '';
    for (const ex of S.selectedCase.evidence) {
      const item = el('div', 'docket-item');
      item.appendChild(el('div', 't', ex.label));
      item.appendChild(el('div', 'd', `${ex.desc} — offered by ${ex.offeredBy}`));
      e.appendChild(item);
    }
    renderMotions();
    refreshWitnessCallability();
  }

  function renderMotions() {
    const m = $('#tab-motions');
    m.innerHTML = '';
    const motions = S.state?.motions || [];
    if (!motions.length) m.appendChild(el('div', 'docket-item', 'No motions ruled on yet.'));
    for (const mo of motions) {
      const item = el('div', 'docket-item');
      item.appendChild(el('div', 't', `[${mo.ruling.toUpperCase().replace(/_/g, ' ')}] ${mo.by}`));
      item.appendChild(el('div', 'd', `${String(mo.text).slice(0, 140)} — ${mo.reasoning || ''}`));
      m.appendChild(item);
    }
    const ex = S.state?.exclusions || [];
    if (ex.length) {
      const item = el('div', 'docket-item');
      item.appendChild(el('div', 't', 'STANDING EXCLUSIONS'));
      item.appendChild(el('div', 'd', ex.join(' · ')));
      m.appendChild(item);
    }
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-body').forEach((b) => b.classList.add('hidden'));
      $('#tab-' + tab.dataset.tab).classList.remove('hidden');
      if (tab.dataset.tab === 'strategy') loadStrategy();
    };
  });

  /* ============ War room — private strategy sheet ============ */
  // Work product for the user only: the server never shows it to any AI actor
  // and it never enters the record. Generated once per trial, then cached.

  async function loadStrategy() {
    if (S.strategy || S.strategyLoading || !S.trialId) return;
    S.strategyLoading = true;
    const gen = S.gen || 0; // a restart mid-fetch discards this response
    const root = $('#strategy-content');
    root.innerHTML = '';
    const status = el('div', 'strategy-status', 'Your team is around the table…');
    root.appendChild(status);
    const lines = ['Your team is around the table…', 'Arguing over the case themes…', 'Going witness by witness…', 'Drafting your direct and cross questions…', 'Flagging the exhibits that matter…', 'Almost done — tightening the sheet…'];
    let i = 0;
    const ticker = setInterval(() => { status.textContent = lines[Math.min(++i, lines.length - 1)]; }, 9000);
    try {
      const r = await api(`/trial/${S.trialId}/strategy`, { method: 'POST', body: '{}', timeoutMs: 200000 });
      if ((S.gen || 0) !== gen) return; // stale — a new trial owns the tab now
      S.strategy = r.strategy;
      renderStrategy();
    } catch (err) {
      if ((S.gen || 0) !== gen) return;
      root.innerHTML = '';
      const retry = el('button', 'btn ghost', 'Prep session failed — tap to try again');
      retry.onclick = () => { S.strategyLoading = false; loadStrategy(); };
      root.appendChild(retry);
      showError('Could not build the strategy sheet: ' + err.message);
      return;
    } finally {
      clearInterval(ticker);
      S.strategyLoading = false;
    }
  }

  function renderStrategy() {
    const st = S.strategy;
    const root = $('#strategy-content');
    root.innerHTML = '';
    if (!st) return;

    const section = (title, open = false) => {
      const d = el('details', 'binder-section');
      if (open) d.open = true;
      d.appendChild(el('summary', null, title));
      root.appendChild(d);
      return d;
    };
    const item = (parent, head, body) => {
      const n = el('div', 'binder-item');
      if (head) n.appendChild(el('div', 'bi-head', head));
      if (body) n.appendChild(el('div', 'bi-body', body));
      parent.appendChild(n);
      return n;
    };
    const bullets = (xs) => (xs || []).map((x) => '• ' + x).join('\n');
    const numbered = (xs) => (xs || []).map((x, n) => `${n + 1}. ${x}`).join('\n');

    if (st.fallback) root.appendChild(el('div', 'strategy-status', '⚠️ LIVE PREP UNAVAILABLE — this is a basic sheet built from the case file only.'));

    if ((st.themes || []).length) {
      const t = section('Case themes — repeat these all trial', true);
      item(t, null, bullets(st.themes));
    }

    const op = section('Opening statement plan', true);
    if ((st.opening?.goals || []).length) item(op, 'What the opening must accomplish', bullets(st.opening.goals));
    if ((st.opening?.outline || []).length) item(op, 'Beat-by-beat outline', numbered(st.opening.outline));
    if ((st.opening?.avoid || []).length) item(op, '⚠️ Do NOT', bullets(st.opening.avoid));

    const mine = (st.witnesses || []).filter((w) => w.mine);
    const theirs = (st.witnesses || []).filter((w) => !w.mine);
    const witBody = (w) =>
      `${w.approach}${(w.goals || []).length ? '\nGOALS:\n' + bullets(w.goals) : ''}${(w.questions || []).length ? '\nASK:\n' + numbered(w.questions) : ''}${w.watchOut ? '\n⚠️ ' + w.watchOut : ''}`;
    if (mine.length) {
      const d = section(`Your witnesses — direct (${mine.length})`);
      for (const w of mine) item(d, w.name, witBody(w));
    }
    if (theirs.length) {
      const c = section(`Their witnesses — cross (${theirs.length})`);
      for (const w of theirs) item(c, w.name, witBody(w));
    }

    if ((st.evidencePlan || []).length) {
      const ev = section('Exhibit plan');
      for (const e of st.evidencePlan) item(ev, e.label, e.use);
    }
    if ((st.objectionWatch || []).length) {
      const ob = section('Objections to have loaded');
      item(ob, null, bullets(st.objectionWatch));
    }
    if ((st.closingSeeds || []).length) {
      const cl = section('Plant now, harvest in closing');
      item(cl, null, bullets(st.closingSeeds));
    }
  }

  function refreshWitnessCallability() {
    const st = S.state;
    const callable =
      st &&
      ((st.phase === 'prosecution_case' && st.userSide === 'prosecution') || (st.phase === 'defense_case' && st.userSide === 'defense')) &&
      !st.exam;
    document.querySelectorAll('#tab-witnesses .docket-item').forEach((item) => {
      const wit = S.selectedCase.witnesses.find((x) => x.id === item.dataset.witnessId);
      const mine = wit && wit.side === st.userSide;
      item.classList.toggle('callable', Boolean(callable && mine));
      item.onclick = callable && mine
        ? () => {
            document.body.classList.remove('drawer-open');
            send({ type: 'call_witness', witnessId: wit.id });
          }
        : null;
      item.title = callable && mine ? 'Click to call this witness' : '';
    });
  }

  /* ================= controls ================= */

  function caseSideOfPhase(phase) {
    return phase === 'prosecution_case' ? 'prosecution' : phase === 'defense_case' ? 'defense' : null;
  }

  function renderControls() {
    const st = S.state;
    if (!st) return;
    $('#hdr-phase').textContent = st.phase.replace(/_/g, ' ');
    $('#hdr-side').textContent = `You: ${st.userSide} · D${st.difficulty} ${st.difficultyLabel || ''}`;
    const sc = st.score;
    $('#hdr-score').textContent = `Obj ${sc.userObjections.sustained}✓/${sc.userObjections.overruled}✗ · Against you ${sc.aiObjections.sustained} · Admonished ${sc.admonishments}`;

    const row = $('#action-buttons');
    row.innerHTML = '';
    const hint = $('#control-hint');
    const input = $('#input-text');
    const banner = $('#pending-banner');
    banner.classList.add('hidden');

    const addBtn = (label, fn, cls = 'btn') => {
      const b = el('button', cls, label);
      b.onclick = fn;
      row.appendChild(b);
      return b;
    };
    const autoLabel = () => `Auto-advance: ${S.autoAdvance ? 'on' : 'off'}`;
    const autoBtn = addBtn(autoLabel(), () => {
      S.autoAdvance = !S.autoAdvance;
      autoBtn.textContent = autoLabel();
      maybeAutoAdvance();
    }, 'btn small ghost');

    if (st.pending) {
      banner.classList.remove('hidden');
      if (st.pending.type === 'motion_response') {
        banner.innerHTML = '';
        banner.appendChild(el('div', 'pb-main', `Opposing counsel has moved: "${st.pending.motionTitle}". The judge wants YOUR response before ruling. Argue it below and Send.`));
        if (st.pending.motionBackground) {
          // Bench memo: the facts behind the motion, so the user never argues blind.
          const d = el('details', 'pending-bg');
          d.appendChild(el('summary', null, '📋 Background — what this motion is really about'));
          d.appendChild(el('div', 'pending-bg-body', st.pending.motionBackground));
          d.open = true;
          banner.appendChild(d);
        }
        input.placeholder = 'Your Honor, we oppose the motion because…';
        hint.textContent = 'Respond to the motion, then the court will rule.';
      } else {
        banner.textContent = `OBJECTION against your submission — basis: ${st.pending.basis || 'stated'}. "${st.pending.argument || ''}" Respond before the court rules; if sustained, the jury never hears what you wrote.`;
        input.placeholder = 'Your Honor, the objection should be overruled because…';
        hint.textContent = 'Argue against the objection, then the court rules.';
      }
      syncWarDock(); // the dock must show the pending matter too
      return;
    }

    switch (st.phase) {
      case 'pretrial':
        input.placeholder = 'File a motion in limine (e.g., "Defense moves to exclude…") and Send — or declare no further motions.';
        addBtn(S.pretrialDone ? 'Continue pretrial' : 'No further motions — proceed', () => {
          S.pretrialDone = true;
          send({ type: 'proceed' });
        }, 'btn primary');
        hint.textContent = 'Pretrial: file exclusionary motions now. Rulings here bind everyone for the rest of the trial.';
        break;
      case 'openings':
      case 'closings': {
        const turn = st.phase === 'openings' ? st.openingTurn : st.closingTurn;
        if (turn === st.userSide) {
          input.placeholder = st.phase === 'openings' ? 'Deliver your opening statement… (opposing counsel may object before the jury hears it)' : 'Deliver your closing argument…';
          hint.textContent = 'Type your full address to the jury, then Send. Opposing counsel reviews it BEFORE it reaches the jurors\' ears.';
        } else {
          addBtn('Let opposing counsel proceed', () => send({ type: 'proceed' }), 'btn primary');
          input.placeholder = 'Opposing counsel has the floor. Press OBJECTION (O) at any point while they speak.';
          hint.textContent = 'You can interrupt their speech at any moment with Space, or object with O.';
        }
        break;
      }
      case 'prosecution_case':
      case 'defense_case': {
        const cs = caseSideOfPhase(st.phase);
        if (st.exam) {
          if (st.exam.examinerIsUser) {
            input.placeholder = `Question ${st.exam.witness} (${st.exam.stage})…`;
            addBtn('Pass the witness', () => send({ type: 'pass_witness' }), 'btn');
            if (cs === st.userSide) addBtn('Rest your case', () => send({ type: 'rest_case' }), 'btn ghost');
            hint.textContent = `${st.exam.stage === 'direct' ? 'Direct' : 'Cross'}-examination of ${st.exam.witness}. Opposing counsel may object to each question before the witness answers.`;
          } else {
            addBtn(st.exam.awaitingAnswer ? 'Let the witness answer' : 'Continue examination', () => send({ type: 'proceed' }), 'btn primary');
            input.placeholder = `${st.exam.witness} is being examined by opposing counsel. Object (O) before the answer if the question is improper.`;
            hint.textContent = st.exam.awaitingAnswer
              ? 'The question is pending — this is your objection window before the answer reaches the jury.'
              : 'Opposing counsel is examining. Advance, and object when warranted.';
          }
        } else if (cs === st.userSide) {
          input.placeholder = 'Your case-in-chief: click a witness in the Witnesses panel to call them.';
          addBtn('Rest your case', () => send({ type: 'rest_case' }), 'btn');
          hint.textContent = 'Call witnesses from your side\'s roster (left panel), or rest.';
        } else {
          addBtn('Let opposing counsel proceed', () => send({ type: 'proceed' }), 'btn primary');
          input.placeholder = 'Opposing counsel\'s case-in-chief. You will cross-examine each witness they pass to you.';
          hint.textContent = 'Advance their case; you get cross after each direct.';
        }
        break;
      }
      case 'deliberation':
        addBtn('Send the jury out', () => send({ type: 'deliberate_round' }), 'btn primary');
        input.placeholder = 'The jury deliberates in private and returns only with a verdict.';
        hint.textContent = 'Deliberations are secret — you\'ll get the full round-by-round juror sheet in your transcript after the verdict. This can take a minute or two.';
        break;
      case 'verdict':
        input.placeholder = 'The trial has concluded.';
        hint.textContent = 'Review the verdict and the judge\'s performance review of your advocacy.';
        showVerdict();
        break;
    }
    refreshWitnessCallability();
    renderMotions();
    syncWarDock();
  }

  function showVerdict() {
    const v = S.state?.deliberation?.verdict;
    if (!v) return;
    const banner = $('#verdict-banner');
    banner.innerHTML = '';
    banner.appendChild(el('h3', null, S.state.deliberation.hung ? 'Verdict (with hung counts)' : 'Verdict'));
    for (const ch of S.selectedCase.charges) {
      const line = v[ch.id] === 'hung' ? 'HUNG JURY — no unanimous verdict' : String(v[ch.id]).replace(/_/g, ' ').toUpperCase();
      banner.appendChild(el('div', null, `${ch.name}: ${line}`));
    }
    const row = el('div', 'verdict-actions');
    const view = el('button', 'btn primary small', '📄 Transcript & juror sheet (PDF)');
    view.onclick = () => window.open(`/api/trial/${S.trialId}/transcript.pdf`, '_blank');
    const dl = el('a', 'btn small', '.txt');
    dl.href = `/api/trial/${S.trialId}/transcript.txt`;
    dl.setAttribute('download', '');
    const close = el('button', 'btn ghost small', 'Dismiss');
    close.onclick = () => banner.classList.add('hidden');
    row.appendChild(view);
    row.appendChild(dl);
    row.appendChild(close);
    banner.appendChild(row);
    banner.classList.remove('hidden');
  }

  /* ================= actions ================= */

  async function send(action) {
    if (S.busy) return;
    // While an objection is before the court, nothing else may address it.
    if (S.objectionHold && action.type !== 'objection') return;
    S.busy = true;
    const gen = S.gen || 0; // discard the response if the trial is restarted mid-flight
    $('#btn-send').disabled = true;
    $('#btn-war-send').disabled = true;
    // Visible heartbeat while the court works — no more silent waits.
    const hint = $('#control-hint');
    const t0 = Date.now();
    clearInterval(S._workTimer);
    S._workTimer = setInterval(() => {
      hint.textContent = `⚖️ The court is working… ${Math.round((Date.now() - t0) / 1000)}s`;
      if (!$('#war-dock').classList.contains('hidden')) $('#war-hint').textContent = hint.textContent;
    }, 1000);
    try {
      const r = await api(`/trial/${S.trialId}/action`, { method: 'POST', body: JSON.stringify(action) });
      if ((S.gen || 0) !== gen) return; // trial was restarted while this was in flight
      if (action.type === 'objection') {
        // The ruling is in — lift the freeze so the ruling itself is spoken.
        S.objectionHold = false;
        S.objectionTarget = null;
      }
      S.state = r.state;
      saveActive();
      ingestEvents(r.events);
      renderControls();
    } catch (err) {
      if ((S.gen || 0) === gen) {
        if (action.type === 'objection') S.objectionHold = false; // let them re-object
        showError(err.message);
      }
    } finally {
      clearInterval(S._workTimer);
      S.busy = false;
      $('#btn-send').disabled = false;
      $('#btn-war-send').disabled = false;
      renderControls();
      // A queued objection preempts everything the moment the line is free.
      if (S.queuedObjection && !S.busy && (S.gen || 0) === gen) {
        const q = S.queuedObjection;
        S.queuedObjection = null;
        send(q);
      }
    }
  }

  async function cleanDictation(text) {
    if (window.CourtSettings.cleanup === false || text.length < 12) return text;
    try {
      const r = await api('/cleanup', {
        method: 'POST',
        timeoutMs: 15000,
        body: JSON.stringify({ text, caseId: S.selectedCase?.id }),
      });
      return r.text || text;
    } catch {
      return text;
    }
  }

  // srcInput lets the war-room dock feed the exact same pipeline as the
  // main court box — cleanup, routing, and pending-response handling included.
  async function sendText(srcInput) {
    if (S.busy || S.sending) return showError('The court is still handling your last action.');
    if (modalOpen()) return; // never submit behind an open modal
    const input = srcInput || $('#input-text');
    const rawText = input.value.trim();
    if (!rawText) return;
    S.sending = true;
    input.value = ''; // clear NOW so edits during cleanup can't be destroyed
    $('#btn-send').disabled = true;
    $('#btn-war-send').disabled = true;
    const hint = $('#control-hint');
    try {
      if (window.CourtSettings.cleanup !== false && rawText.length >= 12) hint.textContent = '✍️ Cleaning up your dictation…';
      const text = await cleanDictation(rawText);
      const st = S.state;
      let action = null;
      if (st.pending) action = { type: 'respond', text };
      else if (st.phase === 'pretrial') action = { type: 'file_motion', text };
      else if (st.phase === 'openings' || st.phase === 'closings') {
        const turn = st.phase === 'openings' ? st.openingTurn : st.closingTurn;
        if (turn === st.userSide) action = { type: 'statement', text };
      } else if ((st.phase === 'prosecution_case' || st.phase === 'defense_case') && st.exam?.examinerIsUser) {
        action = { type: 'ask', text };
      }
      if (!action) {
        input.value = rawText; // give their words back
        return showError('The court is not waiting on text from you right now.');
      }
      await send(action);
    } finally {
      S.sending = false;
      if (!S.busy) {
        $('#btn-send').disabled = false;
        $('#btn-war-send').disabled = false;
      }
    }
  }

  $('#btn-send').onclick = () => sendText();
  $('#input-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendText();
  });

  /* ============ war-room court dock ============ */
  // Lets the user address the court while reading their strategy sheet,
  // mirroring the main controls' hint, placeholder, and the court's last word.

  function syncWarDock() {
    if ($('#war-dock').classList.contains('hidden')) return;
    // While something is pending (an objection against you, a motion needing
    // response), the banner text is the critical context — mirror it too.
    const banner = $('#pending-banner');
    let bannerText = '';
    if (!banner.classList.contains('hidden')) {
      const main = banner.querySelector('.pb-main')?.textContent || banner.textContent;
      const bg = banner.querySelector('.pending-bg-body')?.textContent;
      bannerText = bg ? `${main}\n📋 ${bg}` : main;
    }
    $('#war-hint').textContent = bannerText ? `⚠️ ${bannerText}` : $('#control-hint').textContent;
    $('#war-input').placeholder = $('#input-text').placeholder;
    const evs = document.querySelectorAll('#transcript .ev');
    const last = evs[evs.length - 1];
    const box = $('#war-last');
    if (last) {
      const who = last.querySelector('.who')?.textContent || '';
      const paras = [...last.querySelectorAll('.bubble p')].map((p) => p.textContent);
      const bubble = paras.length ? paras.join(' ') : (last.querySelector('.bubble')?.textContent || last.textContent || '');
      box.textContent = (who ? who + ' — ' : '') + bubble.trim();
      box.classList.remove('hidden');
    } else {
      box.classList.add('hidden');
    }
  }

  function initWarDock() {
    const cb = $('#war-speak');
    const dock = $('#war-dock');
    cb.checked = window.CourtSettings.warSpeak === true;
    dock.classList.toggle('hidden', !cb.checked);
    cb.onchange = () => {
      window.CourtSettings.warSpeak = cb.checked;
      saveSettings();
      dock.classList.toggle('hidden', !cb.checked);
      syncWarDock();
    };
    $('#btn-war-send').onclick = () => sendText($('#war-input'));
    $('#war-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendText($('#war-input'));
    });
  }

  /* ================= auto-advance ================= */

  function aiHasNext() {
    const st = S.state;
    if (!st || st.pending || S.busy) return false;
    if (st.phase === 'pretrial') return S.pretrialDone;
    if (st.phase === 'openings') return st.openingTurn !== st.userSide;
    if (st.phase === 'closings') return st.closingTurn !== st.userSide;
    if (st.phase === 'prosecution_case' || st.phase === 'defense_case') {
      const cs = caseSideOfPhase(st.phase);
      if (st.exam) return !st.exam.examinerIsUser;
      return cs !== st.userSide;
    }
    if (st.phase === 'deliberation') return !st.deliberation.verdict;
    return false;
  }

  function modalOpen() {
    return !$('#objection-modal').classList.contains('hidden') || !$('#settings-modal').classList.contains('hidden');
  }

  function maybeAutoAdvance() {
    if (!S.autoAdvance || S.objectionHold || S.queuedObjection) return;
    clearTimeout(S._autoTimer);
    S._autoTimer = setTimeout(() => {
      if (!S.autoAdvance || S.busy || !aiHasNext()) return;
      if (S.objectionHold || S.queuedObjection) return; // an objection owns the floor
      if (modalOpen()) return; // the room waits while counsel is on their feet
      if (CourtSpeech.isSpeaking()) return maybeAutoAdvance();
      // Objection window: give the attorney a beat before the next step lands.
      const st = S.state;
      const action = st.phase === 'deliberation' ? { type: 'deliberate_round' } : { type: 'proceed' };
      send(action);
    }, 1600);
  }

  /* ================= objections ================= */

  function openObjectionModal() {
    const st = S.state;
    if (!st || st.phase === 'pretrial' || st.phase === 'verdict') return;
    // HARD INTERRUPT: freeze the room the instant O is pressed. Speech stops,
    // the auto-advance clock stops, no other action may go out, and anything
    // already in flight will neither be spoken nor advance the courtroom —
    // the objection is heard first, pinned to what was on screen right now.
    S.objectionHold = true;
    clearTimeout(S._autoTimer);
    const at = CourtSpeech.interrupt() || S.lastSpokenTarget;
    S.objectionTarget = at;
    const targetEv = at && document.querySelector(`[data-event-id="${at.eventId}"]`);
    $('#objection-target-preview').textContent = targetEv
      ? `Objecting to: "${(targetEv.querySelector('.bubble').textContent || '').slice(0, 180)}…"`
      : 'Objecting to the last statement.';
    $('#objection-argument').value = '';
    $('#objection-modal').classList.remove('hidden');
    $('#objection-basis').focus();
  }

  function fillBasisSelect() {
    const sel = $('#objection-basis');
    sel.innerHTML = '';
    for (const b of S.bases) {
      const o = el('option', null, `${b.label} (${b.rule})`);
      o.value = b.id;
      sel.appendChild(o);
    }
    sel.onchange = () => {
      const b = S.bases.find((x) => x.id === sel.value);
      $('#objection-basis-desc').textContent = b ? b.desc : '';
    };
    sel.onchange();
  }

  $('#btn-objection').onclick = openObjectionModal;
  $('#btn-objection-cancel').onclick = () => {
    $('#objection-modal').classList.add('hidden');
    S.objectionHold = false;
    S.queuedObjection = null;
    maybeAutoAdvance();
  };
  $('#btn-objection-submit').onclick = () => {
    const basis = $('#objection-basis').value;
    const argument = $('#objection-argument').value.trim();
    $('#objection-modal').classList.add('hidden');
    const action = {
      type: 'objection',
      basis,
      argument,
      targetEventId: S.objectionTarget?.eventId,
      paragraphIndex: S.objectionTarget?.paragraphIndex,
    };
    if (S.busy) {
      // The court is mid-action: the objection preempts — it fires the moment
      // the in-flight request returns, before anything else can happen.
      S.queuedObjection = action;
      $('#control-hint').textContent = '✋ Objection noted — the court will hear it before anything else.';
    } else {
      send(action);
    }
  };

  document.addEventListener('keydown', (e) => {
    const typing = ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName);
    if (e.key === ' ' && !typing && CourtSpeech.isSpeaking()) {
      e.preventDefault();
      CourtSpeech.interrupt();
    }
    if ((e.key === 'o' || e.key === 'O') && !typing && S.trialId && $('#objection-modal').classList.contains('hidden')) {
      e.preventDefault();
      openObjectionModal();
    }
    if (e.key === 'Escape') {
      if (!$('#objection-modal').classList.contains('hidden')) {
        S.objectionHold = false; // withdrawing the objection releases the room
        S.queuedObjection = null;
      }
      $('#objection-modal').classList.add('hidden');
      $('#settings-modal').classList.add('hidden');
      maybeAutoAdvance();
    }
  });

  // One-tap binder: opens the Court file (drawer on phones) directly on the
  // Binder tab — the courtroom equivalent of flipping open your notes.
  $('#btn-binder-quick').onclick = () => {
    document.body.classList.add('drawer-open');
    document.querySelector('.tab[data-tab="binder"]')?.click();
  };

  $('#btn-transcript').onclick = () => {
    if (S.trialId) window.open(`/api/trial/${S.trialId}/transcript.pdf`, '_blank');
  };

  $('#btn-mute').onclick = () => {
    CourtSpeech.setMuted(!CourtSpeech.muted);
    $('#btn-mute').textContent = CourtSpeech.muted ? '🔇 Voice off' : '🔊 Voice on';
  };

  /* ================= voice settings ================= */

  const VOICES = [
    { id: 'Matthew', label: 'Matthew — deep, deliberate (M)' },
    { id: 'Stephen', label: 'Stephen — crisp, professional (M)' },
    { id: 'Gregory', label: 'Gregory — warm, measured (M)' },
    { id: 'Joey', label: 'Joey — younger, direct (M)' },
    { id: 'Joanna', label: 'Joanna — clear, composed (F)' },
    { id: 'Ruth', label: 'Ruth — natural, expressive (F)' },
    { id: 'Danielle', label: 'Danielle — smooth, steady (F)' },
    { id: 'Kendra', label: 'Kendra — calm, precise (F)' },
    { id: 'Kimberly', label: 'Kimberly — bright, engaged (F)' },
    { id: 'Salli', label: 'Salli — light, quick (F)' },
  ];
  const DEFAULT_SETTINGS = { speed: 1, judge: 'Matthew', counsel: 'Stephen', clerk: 'Joanna', witnessM: 'Gregory', witnessF: 'Ruth', cleanup: true, warSpeak: false };

  function loadSettings() {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('courtsim-voices') || '{}') };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  function saveSettings() {
    localStorage.setItem('courtsim-voices', JSON.stringify(window.CourtSettings));
  }
  window.CourtSettings = loadSettings();

  const SETTING_FIELDS = [
    ['set-judge', 'judge'],
    ['set-counsel', 'counsel'],
    ['set-witnessM', 'witnessM'],
    ['set-witnessF', 'witnessF'],
    ['set-clerk', 'clerk'],
  ];
  function initSettingsUI() {
    for (const [selId, keyName] of SETTING_FIELDS) {
      const sel = document.getElementById(selId);
      sel.innerHTML = '';
      for (const v of VOICES) {
        const o = el('option', null, v.label);
        o.value = v.id;
        sel.appendChild(o);
      }
      sel.value = window.CourtSettings[keyName];
      sel.onchange = () => {
        window.CourtSettings[keyName] = sel.value;
        saveSettings();
        CourtSpeech.preview(sel.value);
      };
    }
    const cb = $('#set-cleanup');
    cb.checked = window.CourtSettings.cleanup !== false;
    cb.onchange = () => {
      window.CourtSettings.cleanup = cb.checked;
      saveSettings();
    };
    const speed = $('#set-speed');
    speed.value = String(window.CourtSettings.speed);
    const paint = () => { $('#speed-val').textContent = Number(speed.value).toFixed(2).replace(/0$/, '') + '×'; };
    paint();
    speed.oninput = () => {
      window.CourtSettings.speed = Number(speed.value);
      saveSettings();
      paint();
    };
  }
  initSettingsUI();
  initWarDock();

  $('#btn-restart').onclick = () => {
    if (!S.selectedCase || !S.state) return;
    if (!confirm('Restart this trial from the beginning? The current record will be discarded.')) return;
    clearTimeout(S._autoTimer);
    startTrial(S.state.userSide).catch((err) => showError('Could not restart: ' + err.message));
  };

  $('#btn-settings').onclick = () => {
    clearTimeout(S._autoTimer);
    $('#settings-modal').classList.remove('hidden');
  };
  $('#btn-settings-close').onclick = () => {
    $('#settings-modal').classList.add('hidden');
    maybeAutoAdvance();
  };
  $('#btn-settings-reset').onclick = () => {
    window.CourtSettings = { ...DEFAULT_SETTINGS };
    saveSettings();
    initSettingsUI();
  };

  /* ================= PWA / mobile ================= */

  // iOS requires a user gesture before speech may play — unlock on first touch.
  const unlockOnce = () => {
    CourtSpeech.unlock();
    document.removeEventListener('touchend', unlockOnce);
    document.removeEventListener('click', unlockOnce);
  };
  document.addEventListener('touchend', unlockOnce, { once: false });
  document.addEventListener('click', unlockOnce, { once: false });

  // Court-file drawer (bottom sheet on phones).
  const toggleDrawer = (open) => {
    document.body.classList.toggle('drawer-open', open ?? !document.body.classList.contains('drawer-open'));
  };
  $('#btn-drawer').onclick = () => toggleDrawer();
  $('#drawer-handle').onclick = () => toggleDrawer(false);
  $('#drawer-backdrop').onclick = () => toggleDrawer(false);

  // Installable app shell.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  boot().catch((e) => alert('Failed to load CourtSim: ' + e.message));
})();
