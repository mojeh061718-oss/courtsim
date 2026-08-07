/**
 * Difficulty calibration (1-10). One number shapes three actors:
 *  - opposing counsel: objection discipline, cross-examination skill, mercy
 *  - the judge: strictness, patience, sua sponte intervention
 *  - the jurors: how exacting they are about burden, elements, and advocacy
 * It also scales how long the AI's examinations run. Case GENERATION uses the
 * same number to set how contested the fact pattern itself is.
 */

export function clampLevel(n) {
  const x = Math.round(Number(n));
  return Number.isFinite(x) ? Math.min(10, Math.max(1, x)) : 5;
}

export function difficultyLabel(level) {
  const l = clampLevel(level);
  if (l <= 2) return 'Training wheels';
  if (l <= 4) return 'Competent opponent';
  if (l <= 6) return 'Seasoned litigator';
  if (l <= 8) return 'Veteran first chair';
  return 'Dream Team';
}

export function profile(level) {
  const l = clampLevel(level);
  const label = difficultyLabel(l);

  let counsel, judge, juror;
  if (l <= 2) {
    counsel = 'You are a junior attorney trying your first cases. Object rarely and only to the clearest violations — miss some you should catch. Your questions are occasionally clumsy (a leading question on direct, a compound question). Concede gracefully when opposing counsel scores. Never throw the case, but leave openings a student can find.';
    judge = 'Run a patient teaching courtroom. Explain rulings in a sentence more than usual, forgive first offenses with gentle guidance, and intervene sua sponte only for flagrant problems.';
    juror = 'Be forgiving of clumsy advocacy — weigh the evidence generously toward whichever side presents an honest, understandable story, and do not punish technical stumbles.';
  } else if (l <= 4) {
    counsel = 'You are a competent working attorney. Object when it matters but let borderline material pass. Your examinations are workmanlike; you occasionally miss an impeachment opening.';
    judge = 'Run a standard courtroom: fair, brisk, occasional guidance for counsel who stray.';
    juror = 'Weigh the evidence like an ordinary conscientious citizen; imperfect advocacy is fine if the substance is there.';
  } else if (l <= 6) {
    counsel = 'You are a seasoned litigator. Object whenever there is a genuine basis and the harm matters; conduct disciplined, purposeful examinations; exploit clear mistakes by opposing counsel.';
    judge = 'Run a firm, efficient courtroom. Hold both sides to the rules; admonish repeat offenders.';
    juror = 'Be rigorous: demand that each element be tied to actual evidence, and notice when counsel overreaches.';
  } else if (l <= 8) {
    counsel = 'You are a veteran first chair with hundreds of trials. Object to every meaningful violation the moment it occurs, phrase objections precisely, and argue them well. On cross, control witnesses with short leading questions, impeach instantly from the record, and punish every open door opposing counsel leaves. Give nothing away.';
    judge = 'Run a strict courtroom. Little patience for sloppiness; intervene sua sponte readily; escalate admonishments quickly; keep counsel strictly within scope and pretrial rulings.';
    juror = 'Be exacting: presume innocence fiercely, require the proponent to close every element with admitted evidence, discount rhetoric entirely, and voice specific doubts about any evidentiary gap.';
  } else {
    counsel = 'You are an elite, famous trial lawyer at the absolute top of the profession — the opponent nobody wants. Anticipate opposing counsel\'s strategy and cut it off before it lands. Object to every objectionable submission without exception and argue each with devastating precision. Your examinations are surgical: every question serves the theory, every answer is controlled, every mistake by opposing counsel is converted into a theme. In openings and closings, weave the record into an argument that feels inevitable.';
    judge = 'Run the tightest courtroom in the state. Zero tolerance: rule instantly and strictly, intervene sua sponte at the first hint of impropriety, enforce pretrial rulings to the letter, and formally admonish — then threaten contempt — for repeated violations.';
    juror = 'Be the hardest honest jury in America: scrutinize every inference, demand airtight chains from exhibit to element, treat any unexplained gap as reasonable doubt material, and be unmovable by style, emotion, or repetition — only admitted evidence and the instructions.';
  }

  return { level: l, label, counsel, judge, juror };
}

/** Ceiling on AI questions per examination — a backstop, not a target: the
 * examining counsel is instructed to run a complete direct and pass only when
 * the witness's material knowledge is fully elicited. */
export function maxQuestionsFor(level, base) {
  return Math.max(8, Math.min(20, base + (clampLevel(level) - 5)));
}

/** Label for how contested the FACTS of a generated case are (1-10). */
export function complexityLabel(level) {
  const l = clampLevel(level);
  if (l <= 2) return 'Open-and-shut';
  if (l <= 4) return 'Strong but not airtight';
  if (l <= 6) return 'Genuinely contested';
  if (l <= 8) return 'Two believable stories';
  return 'Nation-splitting';
}

/** Guidance injected into the CASE GENERATOR: how contested the facts are.
 * Low = the record points firmly one way (the sport is taking the uphill
 * side); high = the kind of case that splits the public for years. */
export function generationGuidance(level) {
  const l = clampLevel(level);
  if (l <= 2) {
    return 'Complexity: OPEN-AND-SHUT. The evidence overwhelmingly favors one side — clean forensics, consistent witnesses, a coherent timeline — and any fair reading of the record points to one verdict. But build honest handholds for the underdog side: one procedural soft spot, one witness who overreaches, one inference the favored side treats as more certain than the record supports. The case is only interesting if you take the losing side — make that a real, if steep, climb.';
  }
  if (l <= 4) {
    return 'Complexity: STRONG BUT NOT AIRTIGHT. One side is clearly favored, but give the record genuine soft spots: a key witness with credibility baggage, one exhibit with a foundation wobble, one alternative reading of the physical evidence that a diligent advocate can develop.';
  }
  if (l <= 6) {
    return 'Complexity: GENUINELY CONTESTED. Each side has real evidence and real weaknesses; two or three legitimate evidentiary fights (a hearsay problem, a foundation gap, one expert dispute); at least one witness with credibility baggage on each side.';
  }
  if (l <= 8) {
    return 'Complexity: TWO BELIEVABLE STORIES. Deeply ambiguous facts where both theories are plausible; forensic evidence that cuts both ways with dueling experts; layered evidentiary landmines (hearsay within hearsay, Daubert-vulnerable science, prior-acts fights, chain-of-custody gaps); witnesses whose credibility is genuinely uncertain.';
  }
  return 'Complexity: NATION-SPLITTING — the register of the true-crime documentary cases that divide the public for years. EVERY pillar of the prosecution case must have a genuine counter-narrative (possible contamination, an investigator with a plausible bias allegation, a timeline hole, a confession or statement obtained under questionable circumstances), and there must be a fully-formed alternative account of the death (another suspect with motive and opportunity, or a credible accident/suicide theory) that the defense can build a whole case around. Both narratives must survive scrutiny of the complete record; reasonable jurors should be able to end on opposite verdicts, and a hung jury is a legitimate outcome. No strawmen on either side.';
}
