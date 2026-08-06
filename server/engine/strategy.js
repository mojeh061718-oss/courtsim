/* War-room strategy sheet: the user's private trial-prep session.
 *
 * This is attorney work product for the HUMAN only. It is generated from the
 * case file, cached on the trial session, and never shown to any AI actor —
 * not the judge, not opposing counsel, not a witness, not a juror. It is never
 * written to the trial record and never appears in the transcript, so it
 * cannot influence the proceedings in any way. */

import { chat } from '../llm/grokClient.js';

const str = (v, max = 600) => String(v == null ? '' : v).trim().slice(0, max);
const arr = (v, max = 12) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, max) : []);
const arr0 = (v) => (Array.isArray(v) ? v : []);

function normalize(rawSheet, caseFile, side) {
  const s = rawSheet && typeof rawSheet === 'object' ? rawSheet : {};
  const byName = new Map(caseFile.witnesses.map((w) => [w.name.toLowerCase(), w]));
  const witnesses = arr0(s.witnesses).map((w) => {
    const known = byName.get(str(w?.name).toLowerCase());
    return {
      name: known ? known.name : str(w?.name, 80),
      side: known ? known.side : (w?.side === 'defense' ? 'defense' : 'prosecution'),
      mine: known ? known.side === side : w?.side === side,
      approach: str(w?.approach, 300),
      goals: arr(w?.goals, 5),
      questions: arr(w?.questions, 7),
      watchOut: str(w?.watchOut, 300),
    };
  }).filter((w) => w.name);
  return {
    side,
    themes: arr(s.themes, 4),
    opening: {
      goals: arr(s.opening?.goals, 5),
      outline: arr(s.opening?.outline, 8),
      avoid: arr(s.opening?.avoid, 5),
    },
    witnesses,
    evidencePlan: arr0(s.evidencePlan).map((e) => ({ label: str(e?.label, 120), use: str(e?.use, 300) })).filter((e) => e.label).slice(0, 20),
    objectionWatch: arr(s.objectionWatch, 8),
    closingSeeds: arr(s.closingSeeds, 6),
    fallback: Boolean(s.__mock),
  };
}

// Deterministic sheet for when no live model is available — honest but basic.
function mockSheet(caseFile, side) {
  const opp = side === 'prosecution' ? 'defense' : 'prosecution';
  return {
    __mock: true,
    themes: [str(caseFile.theories[side], 300)],
    opening: {
      goals: ['Anchor the jury in your theory before the other side frames the case', 'Preview your strongest exhibits by name', 'Inoculate against your weaknesses before opposing counsel exploits them'],
      outline: [str(caseFile.theories[side], 300), 'Walk the jury through what the evidence will show, exhibit by exhibit', 'Tell them plainly what verdict you will ask for and why the law requires it'],
      avoid: (caseFile.hurdles?.[side] || []).map((h) => 'Do not open the door on: ' + str(h, 200)),
    },
    witnesses: caseFile.witnesses.map((w) => ({
      name: w.name,
      side: w.side,
      approach: w.side === side
        ? 'Direct examination — open-ended questions, let the witness tell the story'
        : 'Cross examination — short leading questions, one fact per question, sit down early',
      goals: [str(w.knowledge, 220)],
      questions: w.side === side
        ? ['Please tell the jury who you are and how you are involved in this case.', 'Walk us through what you observed, in your own words.']
        : ['Commit the witness to their strongest claim, then confront it with the exhibits.', 'Establish anything they did NOT see or cannot know firsthand.'],
      watchOut: str(w.demeanor, 200),
    })),
    evidencePlan: caseFile.evidence.slice(0, 10).map((e) => ({ label: e.label, use: (e.offeredBy === side ? 'Yours — build foundation and publish it. ' : 'Theirs — be ready to blunt it. ') + str(e.desc, 180) })),
    objectionWatch: ['Hearsay from any out-of-court statement offered for its truth', 'Foundation before any exhibit is discussed', 'Leading on direct; argumentative or asked-and-answered on cross'],
    closingSeeds: [str(caseFile.theories[side], 300), 'Tie each jury instruction to a specific exhibit or moment of testimony', 'Confront the ' + opp + ' theory head-on: ' + str(caseFile.theories[opp], 240)],
  };
}

function buildPrompt(caseFile, side) {
  const opp = side === 'prosecution' ? 'defense' : 'prosecution';
  const witnessBlock = caseFile.witnesses
    .map((w) => `- ${w.name} (${w.side}) — ${w.description}. Demeanor: ${w.demeanor}. Knows: ${w.knowledge}`)
    .join('\n');
  const evidenceBlock = caseFile.evidence.map((e) => `- ${e.label}: ${e.desc} (offered by ${e.offeredBy})`).join('\n');
  const chargeBlock = caseFile.charges.map((c) => `- ${c.name}: elements — ${c.elements.join('; ')}`).join('\n');
  return [
    {
      role: 'system',
      content:
        `You are the user's own trial team — three seasoned litigators in a prep session the night before trial. The user is arguing for the ${side.toUpperCase()} in ${caseFile.title}. Produce the confidential strategy sheet the team would leave on counsel table. It is private work product: the court will never see it, so be candid about weaknesses. Be concrete and case-specific — every line should name a real witness, exhibit, or fact from the file, never generic advice. Questions must be ready to ask verbatim: open-ended for witnesses on the user's side (direct), short leading questions for the other side's witnesses (cross).\n\n` +
        `Return STRICT JSON only, in exactly this shape:\n` +
        `{"themes":["2-4 one-line case themes to repeat all trial"],` +
        `"opening":{"goals":["3-5 things the opening must accomplish"],"outline":["5-8 beats of the opening, in order"],"avoid":["3-5 traps to avoid — promises you cannot keep, doors you must not open"]},` +
        `"witnesses":[{"name":"exact name from the file","side":"prosecution|defense","approach":"one-line plan for this witness","goals":["2-4 specific facts to establish or destroy"],"questions":["3-6 ready-to-ask questions"],"watchOut":"the single biggest risk this witness poses to the user"}],` +
        `"evidencePlan":[{"label":"exhibit label","use":"how the user should use or blunt this exhibit"}],` +
        `"objectionWatch":["4-6 objections to be ready to make, tied to what THIS opponent will likely try"],` +
        `"closingSeeds":["3-5 lines worth planting now that will pay off in closing"]}\n\n` +
        `Cover EVERY witness in the file. Keep the whole sheet tight enough to scan mid-trial.`,
    },
    {
      role: 'user',
      content:
        `CASE FILE — ${caseFile.title}${caseFile.caseNumber ? ' (' + caseFile.caseNumber + ')' : ''}\n\n` +
        `FACTS:\n${caseFile.factSummary}\n\n` +
        `MY THEORY (${side}): ${caseFile.theories[side]}\n` +
        `OPPOSING THEORY (${opp}): ${caseFile.theories[opp]}\n\n` +
        `MY HURDLES: ${(caseFile.hurdles?.[side] || []).join(' | ')}\n` +
        `THEIR HURDLES (attack here): ${(caseFile.hurdles?.[opp] || []).join(' | ')}\n\n` +
        `CHARGES:\n${chargeBlock}\n\n` +
        `WITNESSES:\n${witnessBlock}\n\n` +
        `EXHIBITS:\n${evidenceBlock}`,
    },
  ];
}

export async function buildStrategySheet(caseFile, side) {
  const raw = await chat(buildPrompt(caseFile, side), {
    json: true,
    temperature: 0.5,
    effort: 'none',
    timeoutMs: 180000,
    hedgeDelayMs: 20000,
    mock: () => mockSheet(caseFile, side),
  });
  return normalize(raw, caseFile, side);
}
