/**
 * The jury: 12 individually-prompted juror agents who never interact until
 * deliberation. Each juror sees ONLY the admitted, unstricken, juror-facing
 * record (optionally alias-blinded) plus the court's instructions — never the
 * real-world outcome, and never counsel's stricken material.
 */
import { chat } from '../llm/grokClient.js';
import { jurorSystem, jurorDeliberationTask } from '../agents/prompts.js';
import { hash01, CONFIG } from './util.js';

export function seatJury(caseFile) {
  return caseFile.jurorPool.slice(0, CONFIG.jurySize).map((j) => ({ ...j }));
}

/**
 * Run one full round of deliberation: every juror speaks once (in seat order,
 * hearing everyone who spoke before them) and privately updates their votes.
 * Returns { messages, tally, unanimous, verdict } for the round.
 */
export async function runDeliberationRound(state, caseFile, jurorFacingRecord) {
  const delib = state.deliberation;
  delib.round += 1;
  const roundNo = delib.round;
  const isFirst = roundNo === 1;
  const aliasNote = CONFIG.jurorAliasing
    ? '\n- Party names have been partially anonymized in your record; this is normal, ignore it.'
    : '';

  const messages = [];
  for (const juror of state.jury) {
    const priorTalk = delib.log
      .map((m) => `Juror ${m.seat} (${m.name}): ${m.statement}`)
      .join('\n');
    const sys = jurorSystem({ caseFile, juror, aliasNote });
    const task = jurorDeliberationTask({ charges: caseFile.charges, roundNo, isFirst });
    const user = `THE TRIAL RECORD (everything you are permitted to consider):\n${jurorFacingRecord}\n\nTHE COURT'S INSTRUCTIONS:\n${caseFile.juryInstructions}\n\nDELIBERATION SO FAR:\n${priorTalk || '(You are the first to speak.)'}\n\n${task}`;

    const out = await chat(
      [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      {
        json: true,
        temperature: 0.85,
        mock: () => mockJurorTurn(juror, caseFile, delib, jurorFacingRecord),
      }
    );
    const entry = normalizeJurorTurn(out, juror, caseFile, delib, jurorFacingRecord);
    delib.log.push(entry);
    delib.votes[juror.seat] = entry.votes;
    messages.push(entry);
  }

  const { tally, unanimous, verdict } = tallyVotes(state, caseFile);
  if (unanimous) {
    delib.verdict = verdict;
  } else if (delib.round >= CONFIG.maxDelibRounds) {
    // Final round without unanimity: charges without unanimity are hung.
    delib.verdict = verdict; // per-charge; non-unanimous charges marked 'hung'
    delib.hung = true;
  }
  return { messages, tally, unanimous, done: Boolean(delib.verdict) };
}

function normalizeJurorTurn(out, juror, caseFile, delib, record) {
  const fallback = () => mockJurorTurn(juror, caseFile, delib, record);
  if (!out || typeof out !== 'object' || !out.statement || !out.votes) out = fallback();
  const votes = {};
  for (const ch of caseFile.charges) {
    const v = out.votes?.[ch.id];
    votes[ch.id] = ch.verdictOptions.includes(v) || v === 'undecided' ? v : 'undecided';
  }
  return { seat: juror.seat, name: juror.name, statement: String(out.statement).slice(0, 1200), votes };
}

export function tallyVotes(state, caseFile) {
  const tally = {};
  const verdict = {};
  let unanimousAll = true;
  for (const ch of caseFile.charges) {
    const counts = {};
    for (const juror of state.jury) {
      const v = state.deliberation.votes[juror.seat]?.[ch.id] || 'undecided';
      counts[v] = (counts[v] || 0) + 1;
    }
    tally[ch.id] = counts;
    const entries = Object.entries(counts);
    const [topOption, topCount] = entries.sort((a, b) => b[1] - a[1])[0];
    if (topCount === state.jury.length && topOption !== 'undecided') {
      verdict[ch.id] = topOption;
    } else {
      verdict[ch.id] = 'hung';
      unanimousAll = false;
    }
  }
  return { tally, unanimous: unanimousAll, verdict };
}

/* ---------- offline mock juror ---------- */

function mockJurorTurn(juror, caseFile, delib, record) {
  // Each juror gets a stable initial leaning from their profile; over rounds
  // they drift toward the room's majority, simulating genuine convergence.
  const votes = {};
  const roomVotes = Object.values(delib.votes);
  for (const ch of caseFile.charges) {
    const opts = ch.verdictOptions;
    const lean = hash01(juror.name + ch.id + caseFile.id);
    let pick = opts[Math.floor(lean * opts.length)];
    if (roomVotes.length >= 3) {
      const counts = {};
      for (const v of roomVotes) counts[v[ch.id]] = (counts[v[ch.id]] || 0) + 1;
      const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      const drift = 0.25 * delib.round + hash01(juror.name + delib.round) * 0.4;
      if (majority && majority !== 'undecided' && drift > 0.5) pick = majority;
    }
    votes[ch.id] = pick;
  }
  const themes = [
    `I keep coming back to the exhibits — ${caseFile.evidence[Math.floor(hash01(juror.name) * 5)].label.replace(/Exhibit \d+: /, '')} in particular.`,
    `Speaking as ${juror.occupation ? 'a ' + juror.occupation : 'myself'}, the testimony either holds together or it doesn't, and I want us to walk each element.`,
    `The burden is on the prosecution — I need to be sure beyond a reasonable doubt, not just suspicious.`,
    `Something in the timeline bothers me and I'd like to hear what the rest of you make of it.`,
  ];
  const statement = themes[Math.floor(hash01(juror.name + delib.round) * themes.length)];
  return { statement, votes };
}
