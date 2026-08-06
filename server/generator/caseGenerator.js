/**
 * Fictional murder-case generator. One Grok call produces a complete case
 * file in the same schema as the shipped cases — parties, contested fact
 * pattern, charges with elements and lessers, witnesses with private
 * knowledge, exhibits, pretrial motions, and an original 12-juror pool.
 * The difficulty level shapes how contested the facts themselves are; the
 * same level later calibrates opposing counsel, judge, and jury at trial.
 *
 * Generated cases are fictional by instruction (no real people or real
 * crimes) and live in an in-memory registry alongside the shipped cases.
 */
import { chat } from '../llm/grokClient.js';
import { generationGuidance, clampLevel, difficultyLabel } from '../engine/difficulty.js';
import { nextId, hash01 } from '../engine/util.js';

const registry = new Map(); // id -> caseFile
const MAX_GENERATED = 50;

export function getGeneratedCase(id) {
  return registry.get(id) || null;
}

export function generatedSummaries() {
  return [...registry.values()].map((c) => ({
    id: c.id,
    title: c.title,
    jurisdiction: c.jurisdiction,
    blurb: c.blurb,
    charges: c.charges.map((ch) => ch.name),
    status: c.status,
    generated: true,
    difficulty: c.difficulty,
  }));
}

export async function generateCase({ theme, difficulty }) {
  const level = clampLevel(difficulty);
  const raw = await chat(
    [
      { role: 'system', content: GENERATOR_SYSTEM },
      { role: 'user', content: generatorPrompt(theme, level) },
    ],
    { json: true, temperature: 0.9, mock: () => mockCase(theme, level) }
  );
  const caseFile = normalize(raw, theme, level);
  if (registry.size >= MAX_GENERATED) {
    registry.delete(registry.keys().next().value);
  }
  registry.set(caseFile.id, caseFile);
  return caseFile;
}

const GENERATOR_SYSTEM = `You are a master case-file author for a mock-trial training simulator used by practicing attorneys. You invent ENTIRELY FICTIONAL American murder cases: fictional defendants, victims, witnesses, towns, and dockets. Never base the case on a real crime, real person, or recognizable news story. The file must be internally consistent: every exhibit corroborated by at least one witness's knowledge, every witness's knowledge consistent with the fact summary, and both sides given real material to work with. Write in the professional register of a trial-preparation binder. Respond with ONLY a valid JSON object — no markdown, no commentary.`;

function generatorPrompt(theme, level) {
  return `Create a fictional murder case file. ${theme ? `Requested theme/setting: "${theme}".` : 'Choose a fresh, interesting setting (vary region, milieu, and murder mechanics).'}
Difficulty ${level}/10 (${difficultyLabel(level)}). ${generationGuidance(level)}

Return ONLY this JSON shape (all fields required):
{
  "title": "State of <fictional-appropriate state> v. <Defendant Name>",
  "jurisdiction": "<fictional county> County <court name>, <state>",
  "caseNumber": "Case No. <plausible docket>",
  "blurb": "<2 sentence hook>",
  "factSummary": "<300-450 words: the neutral investigative record — what happened, what was found, what each side contends. This is the factual universe for the whole trial.>",
  "theories": { "prosecution": "<3-4 sentence theory>", "defense": "<3-4 sentence theory>" },
  "parties": {
    "defendant": "<name, age, one-phrase description>",
    "victims": ["<name, age, relationship>"],
    "judge": "<fictional judge full name>",
    "prosecutor": "<fictional prosecutor with title>",
    "defenseCounsel": "<fictional defense counsel>"
  },
  "charges": [
    { "id": "<snake_case>", "name": "Count 1: <charge> — <victim>", "elements": ["<element>", "..."],
      "verdictOptions": ["guilty_of_<top>", "guilty_of_<lesser>", "not_guilty"], "lesserNote": "<one sentence>" }
  ],
  "juryInstructions": "<150-250 words: presumption of innocence, burden, element definitions for top and lesser charges, how to consider counts>",
  "witnesses": [8-10 of: { "id": "<snake_case>", "name": "<name>", "side": "prosecution"|"defense",
      "description": "<role in the case>", "demeanor": "<how they present on the stand>",
      "knowledge": "<80-130 words: EVERYTHING this witness personally knows — their complete testimony universe, including weaknesses and what they must concede on cross>" }],
  "evidence": [14-20 of: { "id": "<snake_case>", "label": "Exhibit N: <name>", "desc": "<one sentence>", "offeredBy": "prosecution"|"defense"|"both" }],
  "aiPretrialMotions": {
    "prosecution": [2 of: { "id": "p1", "title": "<motion in limine title>", "argument": "<2-3 sentence spoken argument>" }],
    "defense": [2-3 of: { "id": "d1", "title": "<title>", "argument": "<2-3 sentences>" }]
  },
  "jurorPool": [12 of: { "seat": 1-12, "name": "<name>", "age": <25-72>, "occupation": "<job>",
      "background": "<one sentence of life experience relevant to how they weigh evidence>",
      "disposition": "<short clause: their deliberation temperament>" }]
}
Include 1-2 charges (a second count only if the facts support it). Make the jurors demographically and temperamentally varied, with occupations that intersect the case's evidence in interesting ways.`;
}

/** Validate + repair whatever the model returned into a trial-ready case file. */
function normalize(raw, theme, level) {
  const c = raw && typeof raw === 'object' ? raw : mockCase(theme, level);
  const id = nextId('gen');
  const str = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
  const arr = (v) => (Array.isArray(v) ? v : []);

  const charges = arr(c.charges)
    .slice(0, 3)
    .map((ch, i) => ({
      id: str(ch?.id, `count_${i + 1}`).replace(/\W/g, '_'),
      name: str(ch?.name, `Count ${i + 1}: Murder`),
      elements: arr(ch?.elements).map((e) => String(e)).slice(0, 6),
      verdictOptions: arr(ch?.verdictOptions).filter((v) => /^[a-z_]+$/.test(String(v))).length
        ? arr(ch.verdictOptions).map((v) => String(v))
        : ['guilty_of_murder', 'guilty_of_manslaughter', 'not_guilty'],
      lesserNote: str(ch?.lesserNote, ''),
    }));
  if (!charges.length) charges.push(...mockCase(theme, level).charges);
  for (const ch of charges) {
    if (!ch.verdictOptions.includes('not_guilty')) ch.verdictOptions.push('not_guilty');
  }

  const witnesses = arr(c.witnesses)
    .slice(0, 20)
    .map((w, i) => ({
      id: str(w?.id, `witness_${i + 1}`).replace(/\W/g, '_'),
      name: str(w?.name, `Witness ${i + 1}`),
      side: w?.side === 'defense' ? 'defense' : 'prosecution',
      description: str(w?.description, 'witness'),
      demeanor: str(w?.demeanor, 'composed'),
      knowledge: str(w?.knowledge, 'Has limited direct knowledge of the events.'),
    }));

  const jurorPool = arr(c.jurorPool)
    .slice(0, 12)
    .map((j, i) => ({
      seat: i + 1,
      name: str(j?.name, `Juror ${i + 1}`),
      age: Number(j?.age) || 40,
      occupation: str(j?.occupation, 'citizen'),
      background: str(j?.background, 'Ordinary life experience.'),
      disposition: str(j?.disposition, 'even-keeled'),
    }));
  while (jurorPool.length < 12) {
    const i = jurorPool.length;
    jurorPool.push({ seat: i + 1, name: `Alternate Juror ${i + 1}`, age: 45, occupation: 'citizen', background: 'Ordinary life experience.', disposition: 'even-keeled' });
  }

  return {
    id,
    generated: true,
    difficulty: level,
    title: str(c.title, 'State v. Doe'),
    jurisdiction: str(c.jurisdiction, 'Simulated County Court'),
    caseNumber: str(c.caseNumber, `Case No. SIM-${id.slice(-6).toUpperCase()}`),
    status: `Fictional generated case — difficulty ${level}/10 (${difficultyLabel(level)})`,
    blurb: str(c.blurb, 'A generated murder trial.'),
    disclaimer: 'Entirely fictional case generated for training. Any resemblance to real persons or events is coincidental.',
    parties: {
      defendant: str(c.parties?.defendant, 'Jordan Doe, 35'),
      victims: arr(c.parties?.victims).map(String).slice(0, 4).length ? arr(c.parties.victims).map(String).slice(0, 4) : ['Alex Roe, 33'],
      judge: str(c.parties?.judge, 'Evelyn Marsh'),
      prosecutor: str(c.parties?.prosecutor, 'Assistant District Attorney Reese Calloway'),
      defenseCounsel: str(c.parties?.defenseCounsel, 'Morgan Slate'),
    },
    factSummary: str(c.factSummary, 'A fictional homicide investigation.'),
    theories: {
      prosecution: str(c.theories?.prosecution, 'The defendant committed the murder.'),
      defense: str(c.theories?.defense, 'The State cannot prove it.'),
    },
    charges,
    juryInstructions: str(c.juryInstructions, 'The defendant is presumed innocent; the State must prove every element beyond a reasonable doubt.'),
    witnesses,
    evidence: arr(c.evidence)
      .slice(0, 20)
      .map((e, i) => ({
        id: str(e?.id, `exhibit_${i + 1}`).replace(/\W/g, '_'),
        label: str(e?.label, `Exhibit ${i + 1}`),
        desc: str(e?.desc, ''),
        offeredBy: ['prosecution', 'defense', 'both'].includes(e?.offeredBy) ? e.offeredBy : 'prosecution',
      })),
    aiPretrialMotions: {
      prosecution: arr(c.aiPretrialMotions?.prosecution).slice(0, 3).map((m, i) => ({ id: `p${i + 1}`, title: str(m?.title, 'Motion in limine'), argument: str(m?.argument, 'The State so moves.') })),
      defense: arr(c.aiPretrialMotions?.defense).slice(0, 3).map((m, i) => ({ id: `d${i + 1}`, title: str(m?.title, 'Motion in limine'), argument: str(m?.argument, 'The defense so moves.') })),
    },
    aliases: [],
    jurorPool,
    researchHint: 'Fictional generated case — no public record exists; live research does not apply.',
  };
}

/* ---------- offline fallback: a compact fictional template ---------- */

function mockCase(theme, level) {
  const variant = Math.floor(hash01(String(theme || '') + level) * 3);
  const towns = ['Harlow County', 'Bell River County', 'Cascade County'][variant];
  const defendant = ['Adrian Voss', 'Renata Cole', 'Marcus Leland'][variant];
  const victim = ['Elias Trent', 'Peter Askew', 'Dana Whitmore'][variant];
  const setting = theme || ['a marina boathouse', 'a family vineyard', 'a late-night pharmacy'][variant];
  return {
    title: `State v. ${defendant}`,
    jurisdiction: `${towns} Superior Court`,
    caseNumber: `Case No. CR-${1000 + variant * 37}`,
    blurb: `A killing at ${setting}. The State says motive and opportunity; the defense says rush to judgment.`,
    factSummary: `${victim} was found dead at ${setting} shortly after midnight, killed by a single blunt-force injury. The defendant, ${defendant}, a business partner of the victim, was seen arguing with ${victim} earlier that evening over money missing from their shared accounts. The defendant's key card accessed the building at 11:41 p.m.; the defendant claims the card had been lost days earlier and that they were home alone. A neighbor heard a vehicle like the defendant's near the scene. A partial shoe impression at the scene is consistent with, but not unique to, shoes the defendant owns. No murder weapon was recovered. The defense points to the victim's undisclosed debts to a third party, an unlocked rear entrance, and a surveillance gap of nine minutes.`,
    theories: {
      prosecution: `${defendant} was about to be exposed for embezzlement and silenced the one person who could prove it. The key card, the argument, the vehicle, and the shoe impression form one straight line.`,
      defense: `The State chose a suspect in the first hour and worked backward. A lost key card, a common shoe, and a money dispute do not outweigh an unlocked door, a nine-minute camera gap, and a victim with dangerous creditors.`,
    },
    parties: {
      defendant: `${defendant}, 41, the victim's business partner`,
      victims: [`${victim}, 44, co-owner of the business`],
      judge: 'Harriet Boland',
      prosecutor: 'Deputy District Attorney Simone Aker',
      defenseCounsel: 'Nathan Pryce',
    },
    charges: [
      {
        id: 'murder_one',
        name: `Count 1: Murder in the first degree — ${victim}`,
        elements: ['The defendant unlawfully killed the victim', 'With malice aforethought', 'Willfully, deliberately, and with premeditation'],
        verdictOptions: ['guilty_of_first_degree_murder', 'guilty_of_second_degree_murder', 'not_guilty'],
        lesserNote: 'Second-degree murder is a lesser included offense.',
      },
    ],
    juryInstructions: 'The defendant is presumed innocent. The State must prove each element beyond a reasonable doubt. First-degree murder requires premeditation; second-degree murder requires malice without premeditation. Circumstantial evidence must exclude every reasonable hypothesis of innocence.',
    witnesses: [
      { id: 'lead_detective', name: 'Det. Paula Reyes', side: 'prosecution', description: 'lead homicide detective', demeanor: 'methodical', knowledge: `Processed the scene at ${setting}. Documented the key-card log showing the defendant's card at 11:41 p.m., the partial shoe impression, and the earlier argument reported by staff. Concedes the rear entrance was found unlocked, no weapon was recovered, and nine minutes of camera coverage are missing due to a recorder fault.` },
      { id: 'accountant', name: 'Gerald Fine', side: 'prosecution', description: 'forensic accountant', demeanor: 'dry, precise', knowledge: `Audited the business. Roughly $180,000 was diverted through vendor accounts controlled by whoever held the defendant's credentials. The diversion stopped the day after the killing. Concedes credentials, not identity, are what the records show.` },
      { id: 'neighbor', name: 'Tess Malloy', side: 'prosecution', description: 'neighbor near the scene', demeanor: 'earnest, uncertain on details', knowledge: `Heard raised voices around 11:30 p.m. and saw a dark SUV like the defendant's parked oddly near the rear entrance. Cannot identify the driver and admits the street is poorly lit.` },
      { id: 'me_gen', name: 'Dr. Lionel Karp', side: 'prosecution', description: 'medical examiner', demeanor: 'clinical', knowledge: `Death was caused by a single blunt-force injury consistent with a heavy cylindrical object, time of death between 11:15 p.m. and 12:15 a.m. Nothing about the wound identifies the assailant's identity, height, or handedness with certainty.` },
      { id: 'partner_friend', name: 'Owen Trent', side: 'prosecution', description: 'the victim\'s brother', demeanor: 'grieving, angry', knowledge: `The victim said two weeks earlier that he had "caught something in the books" and was meeting the defendant to have it out. Concedes the victim also owed money to a private lender and had seemed afraid of someone he would not name.` },
      { id: 'alibi_sister', name: 'Corinne Voss', side: 'defense', description: 'the defendant\'s sister', demeanor: 'protective, steady', knowledge: `Spoke with the defendant by video call from roughly 11:20 to 11:50 p.m.; the defendant appeared to be at home. Concedes the call log shows the call but cannot prove the defendant's location, and she is family.` },
      { id: 'security_expert', name: 'Ray Okafor', side: 'defense', description: 'defense security-systems expert', demeanor: 'technical, confident', knowledge: `The key-card system logs card numbers, not people; the defendant reported the card lost three days earlier in an email to building management. The nine-minute recorder gap covers the exact window of the killing and the rear door showed signs of use. Concedes the loss report was never acknowledged and could have been staged.` },
      { id: 'lender_witness', name: 'Marguerite Sohn', side: 'defense', description: 'bartender who overheard the victim', demeanor: 'streetwise, unshakeable', knowledge: `Two nights before the killing, overheard the victim pleading on the phone for "one more month" and saying "you'll get it all." Cannot say who was on the line; concedes she came forward only after seeing news coverage.` },
    ],
    evidence: [
      { id: 'keycard_log', label: 'Exhibit 1: Key-card access log', desc: 'Defendant\'s card at rear entrance, 11:41 p.m.', offeredBy: 'prosecution' },
      { id: 'shoe_impression', label: 'Exhibit 2: Partial shoe impression', desc: 'Consistent with a common model the defendant owns', offeredBy: 'prosecution' },
      { id: 'audit', label: 'Exhibit 3: Forensic audit', desc: '$180,000 diverted via credentialed vendor accounts', offeredBy: 'prosecution' },
      { id: 'argument_testimony', label: 'Exhibit 4: Staff statements', desc: 'Loud argument between partners that evening', offeredBy: 'prosecution' },
      { id: 'me_report_gen', label: 'Exhibit 5: Autopsy report', desc: 'Single blunt-force injury; window 11:15 p.m.-12:15 a.m.', offeredBy: 'prosecution' },
      { id: 'suv_sighting', label: 'Exhibit 6: Neighbor sighting', desc: 'Dark SUV near rear entrance ~11:30 p.m.', offeredBy: 'prosecution' },
      { id: 'lost_card_email', label: 'Exhibit 7: Lost-card email', desc: 'Defendant reported card lost three days prior', offeredBy: 'defense' },
      { id: 'camera_gap', label: 'Exhibit 8: Surveillance gap analysis', desc: 'Nine missing minutes spanning the killing', offeredBy: 'defense' },
      { id: 'rear_door', label: 'Exhibit 9: Rear-door examination', desc: 'Unlocked, signs of recent use', offeredBy: 'defense' },
      { id: 'call_log', label: 'Exhibit 10: Video-call log', desc: '11:20-11:50 p.m. call with the defendant\'s sister', offeredBy: 'defense' },
      { id: 'victim_debts', label: 'Exhibit 11: Victim\'s debt records', desc: 'Undisclosed private loans in arrears', offeredBy: 'defense' },
      { id: 'no_weapon', label: 'Exhibit 12: Weapon search report', desc: 'No murder weapon recovered despite full searches', offeredBy: 'both' },
    ],
    aiPretrialMotions: {
      prosecution: [
        { id: 'p1', title: 'Motion in limine to exclude vague third-party-culprit evidence', argument: 'Unnamed "dangerous creditors" without a proffered identity or connection to the scene invite pure speculation and should be excluded absent a direct link.' },
        { id: 'p2', title: 'Motion to admit the embezzlement audit as motive', argument: 'The diversion of funds through the defendant\'s credentials, ending the day after the killing, is classic motive evidence inextricable from the charged conduct.' },
      ],
      defense: [
        { id: 'd1', title: 'Motion to exclude the shoe-impression comparison', argument: 'A partial impression of one of the most common soles in America has no meaningful probative value and a devastating prejudicial ring of "match."' },
        { id: 'd2', title: 'Motion to exclude the argument testimony as improper character evidence', argument: 'A business disagreement hours earlier is being dressed up as homicidal rage; its probative value is thin and its prejudice plain.' },
      ],
    },
    jurorPool: [
      { seat: 1, name: 'Douglas Prine', age: 58, occupation: 'building superintendent', background: 'Manages key-card systems daily and knows their limits.', disposition: 'technical, skeptical of "the badge equals the person"' },
      { seat: 2, name: 'Felicia Grant', age: 36, occupation: 'bank fraud analyst', background: 'Traces credential misuse for a living.', disposition: 'follows the money, hard to dazzle' },
      { seat: 3, name: 'Hank Ollery', age: 63, occupation: 'retired patrol sergeant', background: 'Thirty years of scenes; respects and questions police work.', disposition: 'procedure-minded' },
      { seat: 4, name: 'Bianca Ruiz', age: 29, occupation: 'night-shift ER tech', background: 'Knows how unreliable late-night eyewitnesses can be.', disposition: 'gentle on memory, firm on physical proof' },
      { seat: 5, name: 'Tom Weiss', age: 47, occupation: 'small-business co-owner', background: 'Has lived through a partnership dispute over money.', disposition: 'understands partner rage, wary of projecting it' },
      { seat: 6, name: 'Ada Lockhart', age: 70, occupation: 'retired bookkeeper', background: 'Forty years of ledgers; believes numbers rarely lie but people do.', disposition: 'audit-focused' },
      { seat: 7, name: 'Jerome Pike', age: 41, occupation: 'commercial electrician', background: 'Installs camera systems; knows how recorders fail — and how they are made to fail.', disposition: 'fixated on the nine-minute gap' },
      { seat: 8, name: 'Sunita Rao', age: 33, occupation: 'statistics teacher', background: 'Teaches probability; allergic to "consistent with" evidence.', disposition: 'quantifies everything' },
      { seat: 9, name: 'Carl Jablonski', age: 55, occupation: 'bartender', background: 'Has heard a thousand desperate phone calls from barstools.', disposition: 'credits overheard-conversation testimony' },
      { seat: 10, name: 'Molly Everhart', age: 26, occupation: 'delivery driver', background: 'Drives dark streets nightly; knows what you can and cannot see.', disposition: 'hard on the SUV identification' },
      { seat: 11, name: 'Gene Fontaine', age: 49, occupation: 'insurance investigator', background: 'Paid to distinguish staged losses from real ones.', disposition: 'suspicious of convenient timing on all sides' },
      { seat: 12, name: 'Ruth Calder', age: 66, occupation: 'church treasurer', background: 'A life of small-town trust and its betrayals.', disposition: 'moral anchor, deliberate' },
    ],
  };
}
