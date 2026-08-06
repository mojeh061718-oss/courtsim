/**
 * End-to-end smoke test: plays a full trial through the HTTP API (works in
 * offline demo mode — no API key needed). Run the server first, or let this
 * script boot it on an ephemeral port.
 */
import { spawn } from 'node:child_process';

const PORT = process.env.SMOKE_PORT || 3199;
const BASE = `http://127.0.0.1:${PORT}/api`;

async function api(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

function show(events) {
  for (const e of events || []) console.log(`  [${e.actor}] ${String(e.text).slice(0, 110).replace(/\n/g, ' ')}`);
}

async function main() {
  const server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit',
  });
  await new Promise((r) => setTimeout(r, 900));
  try {
    const health = await api('/health');
    console.log('health:', health);
    const { cases } = await api('/cases');
    console.log('cases:', cases.map((c) => c.id).join(', '));
    if (cases.length !== 4) throw new Error('expected 4 cases');

    // Start: user is defense in the Shirilla case.
    const t = await api('/trial', { caseId: 'shirilla', side: 'defense' });
    const id = t.trialId;
    console.log('\n== created trial', id, 'phase:', t.state.phase);
    show(t.events);
    const act = async (a) => {
      const r = await api(`/trial/${id}/action`, a);
      console.log(`\n-- ${a.type} -> phase=${r.state.phase} pending=${r.state.pending?.type || '-'}`);
      show(r.events);
      return r;
    };

    // Pretrial: user files a motion, then proceeds through AI motions.
    let r = await act({ type: 'file_motion', text: 'The defense moves in limine to exclude all references to alleged prior statements that the defendant would "crash the car," as improper character evidence under Rule 404 and unduly prejudicial under Rule 403.' });
    r = await act({ type: 'proceed' });
    let guard = 0;
    while (r.state.phase === 'pretrial' && guard++ < 10) {
      r = r.state.pending
        ? await act({ type: 'respond', text: 'Your Honor, the defense opposes: the motion sweeps in admissible, probative material and can be handled by objection at trial.' })
        : await act({ type: 'proceed' });
    }
    if (r.state.phase !== 'openings') throw new Error('did not reach openings');

    // Openings: prosecution (AI) then defense (user).
    r = await act({ type: 'proceed' }); // AI prosecution opening
    // user objects to the AI opening, paragraph 0
    const aiOpening = r.events.find((e) => e.actor === 'ai_counsel' && e.kind === 'statement');
    r = await act({ type: 'objection', basis: 'improper_argument', argument: 'Counsel is arguing inferences in opening.', targetEventId: aiOpening?.id, paragraphIndex: 0 });
    // Live models may sustain objections against our statement — rephrase and retry like a real attorney.
    let tries = 0;
    while (r.state.phase === 'openings' && tries++ < 3) {
      r = await act({ type: 'statement', text: 'Members of the jury, the evidence will show a catastrophic accident, not a murder. You will hear that Mackenzie was a 17-year-old girl who nearly died in that car herself, and that the State cannot exclude a tragic loss of control.' + (tries > 1 ? ' I will confine myself to what the witnesses and exhibits will show.' : '') });
      if (r.state.pending?.type === 'objection_response') {
        r = await act({ type: 'respond', text: 'Your Honor, this is a proper preview of the evidence, not argument.' });
      }
    }
    if (r.state.phase !== 'prosecution_case') throw new Error('did not reach prosecution case, got ' + r.state.phase);

    // Prosecution case (AI): step through a few Q/A, object once, then let them rest.
    guard = 0;
    let objected = false;
    while (r.state.phase === 'prosecution_case' && guard++ < 60) {
      if (r.state.pending) {
        r = await act({ type: 'respond', text: 'Your Honor, the question is proper and within the rules.' });
        continue;
      }
      if (r.state.exam && !r.state.exam.examinerIsUser && r.state.exam.awaitingAnswer && !objected) {
        objected = true;
        r = await act({ type: 'objection', basis: 'speculation', argument: 'The question calls for speculation beyond personal knowledge.' });
        continue;
      }
      if (r.state.exam && r.state.exam.examinerIsUser) {
        // our cross of their witness
        r = await act({ type: 'ask', text: 'You cannot tell this jury what was in the driver\'s mind, can you?' });
        if (r.state.pending) r = await act({ type: 'respond', text: 'Proper cross-examination, Your Honor — it goes to the limits of the analysis.' });
        r = await act({ type: 'pass_witness' });
        continue;
      }
      r = await act({ type: 'proceed' });
    }
    if (r.state.phase !== 'defense_case') throw new Error('did not reach defense case, got ' + r.state.phase);

    // Defense case (user): call one witness, direct, pass; AI crosses; excuse; rest.
    r = await act({ type: 'call_witness', witnessId: 'defense_recon' });
    r = await act({ type: 'ask', text: 'Doctor, based on your review, can the EDR data alone tell us why the pedal was depressed?' });
    if (r.state.pending) r = await act({ type: 'respond', text: 'Foundation is established — he reviewed the full record, Your Honor.' });
    r = await act({ type: 'pass_witness' }); // -> AI cross
    guard = 0;
    while (r.state.exam && guard++ < 20) {
      r = await act({ type: 'proceed' });
      if (r.state.pending) r = await act({ type: 'respond', text: 'Your Honor, overruled is the right call here.' });
      if (!r.state.exam) break;
      if (r.state.exam?.examinerIsUser) { r = await act({ type: 'pass_witness' }); break; }
    }
    r = await act({ type: 'rest_case' });
    if (r.state.phase !== 'closings') throw new Error('did not reach closings, got ' + r.state.phase);

    // Closings: prosecution (AI), then defense (user).
    r = await act({ type: 'proceed' });
    tries = 0;
    while (r.state.phase === 'closings' && tries++ < 3) {
      r = await act({ type: 'statement', text: 'The State asks you to turn heartbreak into homicide. The black box tells you what the car did — it cannot tell you why. That gap is reasonable doubt, and reasonable doubt means not guilty.' + (tries > 1 ? ' I argue only from the admitted evidence.' : '') });
      if (r.state.pending?.type === 'objection_response') {
        r = await act({ type: 'respond', text: 'Fair argument on the evidence, Your Honor.' });
      }
    }
    if (r.state.phase !== 'deliberation') throw new Error('did not reach deliberation, got ' + r.state.phase);

    // Deliberation rounds until verdict.
    guard = 0;
    while (r.state.phase === 'deliberation' && guard++ < 6) {
      r = await act({ type: 'deliberate_round' });
    }
    if (r.state.phase !== 'verdict') throw new Error('no verdict, phase ' + r.state.phase);
    console.log('\n== VERDICT:', JSON.stringify(r.state.deliberation.verdict));
    console.log('== score:', JSON.stringify(r.state.score));

    // Transcript endpoints: full court transcript + verdict forms + juror sheet.
    const txtRes = await fetch(`${BASE}/trial/${id}/transcript.txt`);
    if (!txtRes.ok) throw new Error('transcript.txt -> ' + txtRes.status);
    const txt = await txtRes.text();
    for (const marker of ['TRANSCRIPT OF PROCEEDINGS', 'APPEARANCES', 'PROCEEDINGS', 'DIRECT EXAMINATION', 'CROSS-EXAMINATION', 'VERDICT FORM', "REPORTER'S CERTIFICATE", 'JUROR DELIBERATION SHEET', 'BALLOT EVOLUTION']) {
      if (!txt.includes(marker)) throw new Error('transcript missing section: ' + marker);
    }
    const htmlRes = await fetch(`${BASE}/trial/${id}/transcript.html`);
    if (!htmlRes.ok || !(await htmlRes.text()).includes('class="page"')) throw new Error('transcript.html failed');
    const pages = (txt.match(/\f/g) || []).length + 1;
    console.log(`== transcript OK: ${txt.length} chars across ${pages} pages, all sections present`);
    if (process.env.SMOKE_SAVE_TRANSCRIPT) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(process.env.SMOKE_SAVE_TRANSCRIPT, txt);
      console.log('== transcript saved to', process.env.SMOKE_SAVE_TRANSCRIPT);
    }
    console.log('\nSMOKE TEST PASSED');
  } finally {
    server.kill();
  }
}

main().catch((e) => {
  console.error('SMOKE TEST FAILED:', e);
  process.exitCode = 1;
});
