/* CourtSim client — courtroom UI, flow control, objection hotkey. */
(function () {
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

  async function api(path, opts) {
    const res = await fetch('/api' + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || res.statusText);
    }
    return res.json();
  }

  async function boot() {
    const [{ cases }, { bases }] = await Promise.all([api('/cases'), api('/objection-bases')]);
    S.cases = cases;
    S.bases = bases;
    renderCaseList();
    fillBasisSelect();
  }

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
      card.onclick = () => showSidePicker(c.id);
      grid.appendChild(card);
    }
  }

  async function showSidePicker(caseId) {
    const detail = await api('/cases/' + caseId);
    S.selectedCase = detail;
    $('#case-list').classList.add('hidden');
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
  }

  $('#btn-back').onclick = () => {
    $('#side-picker').classList.add('hidden');
    $('#case-list').classList.remove('hidden');
  };
  $('#btn-prosecution').onclick = () => startTrial('prosecution');
  $('#btn-defense').onclick = () => startTrial('defense');

  async function startTrial(side) {
    const r = await api('/trial', { method: 'POST', body: JSON.stringify({ caseId: S.selectedCase.id, side }) });
    S.trialId = r.trialId;
    S.state = r.state;
    S.pretrialDone = false;
    $('#screen-select').classList.add('hidden');
    $('#screen-court').classList.remove('hidden');
    $('#hdr-case').textContent = S.selectedCase.title;
    renderJury();
    renderDockets();
    ingestEvents(r.events);
    renderControls();
  }

  /* ================= transcript & speech ================= */

  const ROLE_CLASS = { judge: 'judge', ai_counsel: 'counsel', witness: 'witness', juror: 'juror', clerk: 'system', system: 'system', user: 'user' };

  function ingestEvents(events) {
    for (const ev of events) {
      if (ev.meta?.strikeTargetId) applyStrike(ev.meta.strikeTargetId, ev.meta.strikeParagraph);
      renderEvent(ev);
      if (ev.speak && !CourtSpeech.muted) {
        const paragraphs = ev.paragraphList && ev.paragraphList.length ? ev.paragraphList : [ev.text];
        CourtSpeech.enqueue({
          eventId: ev.id,
          paragraphs,
          role: ev.actor,
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
    };
  });

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
    $('#hdr-side').textContent = `You: ${st.userSide}`;
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
        banner.textContent = `Opposing counsel has moved: "${st.pending.motionTitle}". The judge wants YOUR response before ruling. Argue it below and Send.`;
        input.placeholder = 'Your Honor, we oppose the motion because…';
        hint.textContent = 'Respond to the motion, then the court will rule.';
      } else {
        banner.textContent = `OBJECTION against your submission — basis: ${st.pending.basis || 'stated'}. "${st.pending.argument || ''}" Respond before the court rules; if sustained, the jury never hears what you wrote.`;
        input.placeholder = 'Your Honor, the objection should be overruled because…';
        hint.textContent = 'Argue against the objection, then the court rules.';
      }
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
        addBtn(`Deliberate — round ${(st.deliberation.round || 0) + 1}`, () => send({ type: 'deliberate_round' }), 'btn primary');
        input.placeholder = 'The jury is out. They deliberate alone — you can only listen.';
        hint.textContent = 'Each round, all twelve jurors speak (for the first time in the whole trial) and vote in private.';
        break;
      case 'verdict':
        input.placeholder = 'The trial has concluded.';
        hint.textContent = 'Review the verdict and the judge\'s performance review of your advocacy.';
        showVerdict();
        break;
    }
    refreshWitnessCallability();
    renderMotions();
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
    const close = el('button', 'btn ghost small', 'Dismiss');
    close.onclick = () => banner.classList.add('hidden');
    banner.appendChild(close);
    banner.classList.remove('hidden');
  }

  /* ================= actions ================= */

  async function send(action) {
    if (S.busy) return;
    S.busy = true;
    $('#btn-send').disabled = true;
    try {
      const r = await api(`/trial/${S.trialId}/action`, { method: 'POST', body: JSON.stringify(action) });
      S.state = r.state;
      ingestEvents(r.events);
      renderControls();
    } catch (err) {
      alert(err.message);
    } finally {
      S.busy = false;
      $('#btn-send').disabled = false;
    }
  }

  function sendText() {
    const input = $('#input-text');
    const text = input.value.trim();
    if (!text) return;
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
    if (!action) return alert('The court is not waiting on text from you right now.');
    input.value = '';
    send(action);
  }

  $('#btn-send').onclick = sendText;
  $('#input-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendText();
  });

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

  function maybeAutoAdvance() {
    if (!S.autoAdvance) return;
    clearTimeout(S._autoTimer);
    S._autoTimer = setTimeout(() => {
      if (!S.autoAdvance || S.busy || !aiHasNext()) return;
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
    // Freeze the room: stop speech exactly where it is.
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
  $('#btn-objection-cancel').onclick = () => $('#objection-modal').classList.add('hidden');
  $('#btn-objection-submit').onclick = () => {
    const basis = $('#objection-basis').value;
    const argument = $('#objection-argument').value.trim();
    $('#objection-modal').classList.add('hidden');
    send({
      type: 'objection',
      basis,
      argument,
      targetEventId: S.objectionTarget?.eventId,
      paragraphIndex: S.objectionTarget?.paragraphIndex,
    });
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
    if (e.key === 'Escape') $('#objection-modal').classList.add('hidden');
  });

  $('#btn-mute').onclick = () => {
    CourtSpeech.setMuted(!CourtSpeech.muted);
    $('#btn-mute').textContent = CourtSpeech.muted ? '🔇 Voice off' : '🔊 Voice on';
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
