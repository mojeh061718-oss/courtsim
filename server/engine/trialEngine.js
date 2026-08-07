/**
 * The trial engine — a phase state machine that drives the whole simulation:
 *
 *   pretrial → openings → prosecution_case → defense_case → closings
 *            → deliberation → verdict
 *
 * The human attorney drives their side; every other actor (judge, opposing
 * counsel, witnesses, jurors) is an independently-prompted Grok agent. Every
 * user submission passes through opposing-counsel review (they may object
 * BEFORE the jury hears it) and judicial screening (sua sponte control).
 */
import { chat } from '../llm/grokClient.js';
import {
  counselSystem,
  counselReviewSystem,
  judgeSystem,
  judgeRulingTask,
  judgeMotionTask,
  judgeScreenTask,
  witnessSystem,
  performanceReviewTask,
  counselName,
} from '../agents/prompts.js';
import { basisById } from './objections.js';
import { seatJury, runDeliberationRound, tallyVotes } from './jury.js';
import { nextId, hash01, clampTail, sentences, CONFIG } from './util.js';
import { profile, maxQuestionsFor, clampLevel, difficultyLabel } from './difficulty.js';

/* ============================== state ============================== */

export function createTrial(caseFile, userSide, difficulty) {
  const aiSide = userSide === 'prosecution' ? 'defense' : 'prosecution';
  const state = {
    id: nextId('trial'),
    caseId: caseFile.id,
    userSide,
    aiSide,
    difficulty: clampLevel(difficulty ?? caseFile.difficulty ?? 5),
    phase: 'pretrial',
    openingTurn: 'prosecution',
    closingTurn: 'prosecution',
    record: [],
    exclusions: [], // matters excluded by pretrial rulings — enforced all trial
    motions: [],
    aiMotionIdx: 0,
    userPretrialDone: false,
    exam: null, // { witnessId, calledBy, stage, pendingQuestion, qCount, crossQCount }
    aiWitnessesCalled: [],
    userWitnessesCalled: [],
    restedProsecution: false,
    restedDefense: false,
    pending: null, // interaction the user must answer: {type, ...}
    score: {
      userObjections: { sustained: 0, overruled: 0 },
      aiObjections: { sustained: 0, overruled: 0 },
      admonishments: 0,
      stricken: 0,
    },
    jury: seatJury(caseFile),
    deliberation: { round: 0, log: [], votes: {}, verdict: null, hung: false },
  };

  const events = [];
  push(events, state, sys('clerk', `All rise. The ${courtName(caseFile)} is now in session, the Honorable ${caseFile.parties.judge} presiding. Calling ${caseFile.title}.`));
  push(events, state, judgeEv(caseFile, `Be seated. We are on the record in ${caseFile.title}. Counsel, we will take up pretrial motions before we bring in the jury panel. ${sideTitle(userSide)} — you may file any motions in limine now, or indicate you have none. Opposing counsel will also be heard on its own motions.`, { phase: true }));
  return { state, events };
}

/* ============================== actions ============================== */

export async function handleAction(state, caseFile, action) {
  const events = [];
  try {
    switch (action.type) {
      case 'proceed': await advance(state, caseFile, events); break;
      case 'file_motion': await userFilesMotion(state, caseFile, events, action.text); break;
      case 'respond': await userResponds(state, caseFile, events, action.text); break;
      case 'statement': await userStatement(state, caseFile, events, action.text); break;
      case 'auto_statement': await userAutoStatement(state, caseFile, events); break;
      case 'call_witness': await userCallsWitness(state, caseFile, events, action.witnessId); break;
      case 'ask': await userAsks(state, caseFile, events, action.text); break;
      case 'objection': await userObjects(state, caseFile, events, action); break;
      case 'pass_witness': await passWitness(state, caseFile, events); break;
      case 'rest_case': await restCase(state, caseFile, events); break;
      case 'deliberate_round': await deliberate(state, caseFile, events); break;
      default:
        push(events, state, sys('system', `Unknown action: ${action.type}`, { speak: false }));
    }
  } catch (err) {
    console.error('[engine]', err);
    push(events, state, sys('system', `The court reporter lost that one (${err.message}). Please try again.`, { speak: false }));
  }
  return { events, state: publicState(state, caseFile) };
}

function diff(state) {
  return profile(state.difficulty);
}

/* ============================== pretrial ============================== */

async function userFilesMotion(state, caseFile, events, text) {
  requirePhase(state, 'pretrial');
  if (!text?.trim()) return;
  // Opposing counsel responds, then the judge rules.
  const response = await counselFreeText(state, caseFile, state.aiSide, `Opposing counsel has filed this pretrial motion:\n"${text}"\n\nGive your spoken response opposing or qualifying the motion (2-5 sentences).`,
    () => `Your Honor, the ${state.aiSide} opposes. The motion is overbroad and the evidence it targets is plainly probative; counsel can protect the record with objections at trial.`);
  push(events, state, counselEv(state, caseFile, response));
  const ruling = await judgeMotionRuling(state, caseFile, { movant: state.userSide, text, response });
  applyMotionRuling(state, events, caseFile, { by: state.userSide, text }, ruling);
}

async function userResponds(state, caseFile, events, text) {
  const pending = state.pending;
  if (!pending) {
    push(events, state, sys('system', 'Nothing is pending a response.', { speak: false }));
    return;
  }
  if (!text?.trim()) {
    push(events, state, sys('system', 'Say something on the record before the court rules.', { speak: false }));
    return; // pending stays live
  }
  state.pending = null;
  if (pending.type === 'motion_response') {
    push(events, state, userEv(state, caseFile, text, 'argument'));
    const ruling = await judgeMotionRuling(state, caseFile, { movant: state.aiSide, text: pending.motion.argument, response: text });
    applyMotionRuling(state, events, caseFile, { by: state.aiSide, text: pending.motion.title }, ruling);
    state.aiMotionIdx += 1;
    if (state.aiMotionIdx >= aiMotions(state, caseFile).length) {
      concludePretrial(state, caseFile, events);
    } else {
      push(events, state, judgeEv(caseFile, `Very well. ${counselName(caseFile, state.aiSide)}, your next motion.`, { speak: true }));
      presentNextAiMotion(state, caseFile, events);
    }
  } else if (pending.type === 'objection_response') {
    push(events, state, userEv(state, caseFile, text, 'argument'));
    await ruleOnAiObjection(state, caseFile, events, pending, text);
  }
}

function aiMotions(state, caseFile) {
  return caseFile.aiPretrialMotions[state.aiSide] || [];
}

function presentNextAiMotion(state, caseFile, events) {
  const motion = aiMotions(state, caseFile)[state.aiMotionIdx];
  push(events, state, counselEv(state, caseFile, `Your Honor, the ${state.aiSide} moves as follows — ${motion.title}. ${motion.argument}`, 'motion'));
  push(events, state, judgeEv(caseFile, `${sideTitle(state.userSide)}, your response to the motion.`));
  state.pending = { type: 'motion_response', motion };
}

function concludePretrial(state, caseFile, events) {
  state.phase = 'openings';
  push(events, state, judgeEv(caseFile, `That concludes pretrial matters. My rulings in limine are binding on both sides — violate them at your peril. Bailiff, bring in the jury.`, {}));
  push(events, state, sys('clerk', `The jury of twelve is seated and sworn: ${state.jury.map((j) => `Juror ${j.seat}, ${occupationBlurb(j)}`).join('; ')}.`, { speak: false }));
  push(events, state, judgeEv(caseFile, `Members of the jury, you will decide this case solely on the evidence admitted in this courtroom and the law as I give it to you. We begin with opening statements. ${sideTitle('prosecution')}, you may open.`, {}));
}

async function judgeMotionRuling(state, caseFile, { movant, text, response }) {
  const transcript = transcriptText(state);
  return await chat(
    [
      { role: 'system', content: judgeSystem({ caseFile, difficulty: diff(state).judge }) },
      { role: 'user', content: `RECORD SO FAR:\n${transcript}\n\nPENDING MOTION by the ${movant}:\n"${text}"\n\nOPPOSITION/RESPONSE:\n"${response}"\n\n${judgeMotionTask()}` },
    ],
    {
      json: true,
      temperature: 0.4,
      effort: 'low', hedgeDelayMs: 3500,
      provider: 'xai',
      mock: () => {
        const grant = hash01(text) > 0.5;
        return grant
          ? { ruling: 'granted', reasoning: 'The risk of unfair prejudice substantially outweighs probative value on this record. The motion is granted.', exclusions: [`the matter targeted by the ${movant}'s motion: ${String(text).slice(0, 100)}`] }
          : { ruling: 'denied', reasoning: 'The evidence is probative and any prejudice can be handled with a limiting instruction. The motion is denied.', exclusions: [] };
      },
    }
  );
}

function applyMotionRuling(state, events, caseFile, motion, ruling) {
  const r = ruling || { ruling: 'denied', reasoning: 'The court is not persuaded.', exclusions: [] };
  state.motions.push({ by: motion.by, text: motion.text, ruling: r.ruling, reasoning: r.reasoning });
  if ((r.ruling === 'granted' || r.ruling === 'granted_in_part') && Array.isArray(r.exclusions)) {
    state.exclusions.push(...r.exclusions.filter(Boolean));
  }
  push(events, state, judgeEv(caseFile, `On the motion: ${r.ruling.replace(/_/g, ' ')}. ${r.reasoning}`, { kind: 'ruling' }));
}

/* ============================== openings & closings ============================== */

async function userStatement(state, caseFile, events, text) {
  if (state.pending) {
    push(events, state, sys('system', 'Respond to the pending matter first.', { speak: false }));
    return;
  }
  if (state.phase !== 'openings' && state.phase !== 'closings') {
    push(events, state, sys('system', 'Statements are for openings and closings. Use the witness controls during the evidentiary phases.', { speak: false }));
    return;
  }
  const turn = state.phase === 'openings' ? state.openingTurn : state.closingTurn;
  if (turn !== state.userSide) {
    push(events, state, sys('system', 'It is not your turn to address the jury.', { speak: false }));
    return;
  }
  if (!text?.trim()) return;
  // 1. Opposing counsel may object BEFORE the jury hears it. The judge's
  // screen runs in parallel with the review to halve the wait.
  const screenP = judgeScreen(state, caseFile, text);
  screenP.catch(() => {});
  const review = await counselReview(state, caseFile, text, `${state.phase === 'openings' ? 'opening statement' : 'closing argument'}`);
  if (review?.object) {
    const sEv = userEv(state, caseFile, text, 'statement');
    push(events, state, sEv);
    const basis = basisById(review.basis);
    push(events, state, counselEv(state, caseFile, `Objection, Your Honor — ${basis ? basis.label.toLowerCase() : review.basis}. ${review.argument || ''}`, 'objection'));
    push(events, state, judgeEv(caseFile, `Counsel, your response to the objection?`));
    state.pending = { type: 'objection_response', submission: { kind: 'statement', text, eventId: sEv.id }, review };
    return;
  }
  await admitUserSubmission(state, caseFile, events, { kind: 'statement', text }, { screenP });
}

async function admitUserSubmission(state, caseFile, events, submission, pre = {}) {
  // The submission may already be on the record (it was pushed when an
  // objection was raised against it) — never push it twice.
  const already = submission.eventId ? state.record.find((e) => e.id === submission.eventId) : null;
  // 2. Judicial screening — sua sponte control even with no objection.
  const screen = await (pre.screenP || judgeScreen(state, caseFile, submission.text));
  if (screen?.intervene) {
    push(events, state, judgeEv(caseFile, screen.statement || 'Counsel, approach. That will not continue in my courtroom.', { kind: 'admonishment' }));
    state.score.admonishments += 1;
    if (screen.block) {
      state.score.stricken += 1;
      if (already) already.stricken = true;
      push(events, state, sys('system', 'Your submission was blocked before reaching the jury. Rephrase and resubmit.', { speak: false, strikeTargetId: already?.id }));
      return;
    }
  }
  if (submission.kind === 'statement') {
    if (!already) push(events, state, userEv(state, caseFile, submission.text, 'statement'));
    advanceAfterStatement(state, caseFile, events);
  } else if (submission.kind === 'question') {
    if (!already) push(events, state, userEv(state, caseFile, submission.text, 'question'));
    await witnessAnswers(state, caseFile, events, submission.text, pre.answerP);
  }
}

function advanceAfterStatement(state, caseFile, events) {
  if (state.phase === 'openings') {
    if (state.openingTurn === 'prosecution') {
      state.openingTurn = 'defense';
      push(events, state, judgeEv(caseFile, `Thank you. ${sideTitle('defense')}, your opening.`));
      } else {
      startProsecutionCase(state, caseFile, events);
    }
  } else {
    if (state.closingTurn === 'prosecution') {
      state.closingTurn = 'defense';
      push(events, state, judgeEv(caseFile, `${sideTitle('defense')}, your closing argument.`));
    } else {
      startDeliberation(state, caseFile, events);
    }
  }
}

function startProsecutionCase(state, caseFile, events) {
  state.phase = 'prosecution_case';
  push(events, state, judgeEv(caseFile, `Openings are concluded. The prosecution may call its first witness.`, { phase: true }));
}

function startDeliberation(state, caseFile, events) {
  state.phase = 'deliberation';
  push(events, state, judgeEv(caseFile, `Members of the jury, that concludes the arguments. I now instruct you on the law. ${caseFile.juryInstructions} You will now retire to deliberate. You have not discussed this case with each other until this moment; speak freely, and return a verdict that is yours alone.`, { phase: true, kind: 'instructions' }));
}

/* ============================== examination ============================== */

function caseSideOf(state) {
  return state.phase === 'prosecution_case' ? 'prosecution' : 'defense';
}

function examinerIsUser(state) {
  if (!state.exam) return caseSideOf(state) === state.userSide;
  const { calledBy, stage } = state.exam;
  const direct = stage === 'direct' || stage === 'redirect';
  const examiner = direct ? calledBy : otherSide(calledBy);
  return examiner === state.userSide;
}

async function userCallsWitness(state, caseFile, events, witnessId) {
  requireEvidencePhase(state);
  if (caseSideOf(state) !== state.userSide) { push(events, state, sys('system', 'It is not your case-in-chief. You may cross-examine when a witness is passed to you.', { speak: false })); return; }
  if (state.exam) { push(events, state, sys('system', 'A witness is already on the stand. Pass or excuse them first.', { speak: false })); return; }
  const w = caseFile.witnesses.find((x) => x.id === witnessId);
  if (!w) { push(events, state, sys('system', 'Unknown witness.', { speak: false })); return; }
  state.exam = { witnessId: w.id, calledBy: state.userSide, stage: 'direct', pendingQuestion: null, qCount: 0, startIdx: state.record.length };
  state.userWitnessesCalled.push(w.id);
  push(events, state, sys('clerk', `${w.name} is called, sworn, and takes the stand.`, { speak: true }));
}

async function userAsks(state, caseFile, events, text) {
  requireEvidencePhase(state);
  if (state.pending) { push(events, state, sys('system', 'Respond to the pending objection before asking another question.', { speak: false })); return; }
  if (!state.exam) { push(events, state, sys('system', 'No witness is on the stand.', { speak: false })); return; }
  if (!examinerIsUser(state)) { push(events, state, sys('system', 'You are not the examining attorney right now.', { speak: false })); return; }
  if (!text?.trim()) return;
  // Latency: run the objection review, the judge's screen, and the witness's
  // draft answer IN PARALLEL. The answer is speculative — if an objection or
  // judicial block lands, it is discarded unheard, so record discipline holds.
  const answerP = fetchWitnessAnswer(state, caseFile, text);
  answerP.catch(() => {});
  const screenP = judgeScreen(state, caseFile, text);
  screenP.catch(() => {});
  const review = await counselReview(state, caseFile, text, `question on ${state.exam.stage} examination of ${witnessOf(state, caseFile).name}`);
  if (review?.object) {
    // The challenged question goes ON THE RECORD before the objection — the
    // court (and the user) must be able to see exactly what was objected to.
    const qEv = userEv(state, caseFile, text, 'question');
    push(events, state, qEv);
    const basis = basisById(review.basis);
    push(events, state, counselEv(state, caseFile, `Objection — ${basis ? basis.label.toLowerCase() : review.basis}. ${review.argument || ''}`, 'objection'));
    push(events, state, judgeEv(caseFile, `Response, counsel?`));
    state.pending = { type: 'objection_response', submission: { kind: 'question', text, eventId: qEv.id }, review };
    return;
  }
  await admitUserSubmission(state, caseFile, events, { kind: 'question', text }, { screenP, answerP });
}

function fetchWitnessAnswer(state, caseFile, question) {
  const w = witnessOf(state, caseFile);
  const examTranscript = examinationText(state, caseFile);
  return chat(
    [
      { role: 'system', content: witnessSystem({ caseFile, witness: w }) },
      { role: 'user', content: `You are on the stand under ${state.exam.stage} examination.\nTESTIMONY SO FAR THIS EXAMINATION:\n${examTranscript || '(none yet)'}\n\nCOUNSEL ASKS: "${question}"\n\nAnswer as ${w.name} would, per your rules.` },
    ],
    {
      temperature: 0.7,
      effort: 'none',
      hedgeDelayMs: 3500,
      mock: () => {
        const s = sentences(w.knowledge);
        const i = Math.floor(hash01(question + w.id) * s.length);
        return s[i] || 'I don\'t recall.';
      },
    }
  );
}

async function witnessAnswers(state, caseFile, events, question, preAnswer) {
  const answer = await (preAnswer || fetchWitnessAnswer(state, caseFile, question));
  push(events, state, witnessEv(state, caseFile, answer));
  state.exam.qCount += 1;
}

async function passWitness(state, caseFile, events) {
  requireEvidencePhase(state);
  if (!state.exam) { push(events, state, sys('system', 'No witness is on the stand.', { speak: false })); return; }
  if (state.pending) { push(events, state, sys('system', 'Respond to the pending objection before passing the witness.', { speak: false })); return; }
  if (!examinerIsUser(state)) { push(events, state, sys('system', 'You cannot pass a witness you are not examining.', { speak: false })); return; }
  const exam = state.exam;
  const w = witnessOf(state, caseFile);
  if (exam.stage === 'direct') {
    exam.stage = 'cross';
    exam.pendingQuestion = null;
    exam.qCount = 0;
    const crossExaminer = otherSide(exam.calledBy);
    push(events, state, judgeEv(caseFile, `Cross-examination, ${counselTitle(state, caseFile, crossExaminer)}?`));
    if (crossExaminer !== state.userSide) {
      // AI will cross — user drives it forward with "proceed".
    }
  } else {
    // cross complete → witness excused
    push(events, state, judgeEv(caseFile, `Thank you, ${w.name}. You may step down.`));
    state.exam = null;
    const cs = caseSideOf(state);
    if (cs === state.userSide) {
      push(events, state, judgeEv(caseFile, `${sideTitle(cs)}, call your next witness or rest.`));
    }
  }
}

async function restCase(state, caseFile, events) {
  requireEvidencePhase(state);
  if (caseSideOf(state) !== state.userSide) { push(events, state, sys('system', 'It is not your case to rest.', { speak: false })); return; }
  if (state.pending) { push(events, state, sys('system', 'Respond to the pending objection before resting.', { speak: false })); return; }
  if (state.exam) { state.exam = null; }
  push(events, state, userEv(state, caseFile, `Your Honor, the ${state.userSide} rests.`, 'statement'));
  concludeCasePhase(state, caseFile, events);
}

function concludeCasePhase(state, caseFile, events) {
  if (state.phase === 'prosecution_case') {
    state.restedProsecution = true;
    state.phase = 'defense_case';
    push(events, state, judgeEv(caseFile, `The prosecution rests. The defense may present its case or rest.`, { phase: true }));
  } else {
    state.restedDefense = true;
    state.phase = 'closings';
    state.closingTurn = 'prosecution';
    push(events, state, judgeEv(caseFile, `The evidence is closed. We proceed to closing arguments. ${sideTitle('prosecution')}, you may close.`, { phase: true }));
  }
}

/* ============================== AI turns (proceed) ============================== */

async function advance(state, caseFile, events) {
  if (state.pending) {
    push(events, state, sys('system', 'The court is waiting on your response first.', { speak: false }));
    return;
  }
  switch (state.phase) {
    case 'pretrial': {
      if (!state.userPretrialDone) {
        state.userPretrialDone = true;
        push(events, state, userEv(state, caseFile, `Your Honor, the ${state.userSide} has no further pretrial motions.`, 'statement'));
      }
      if (state.aiMotionIdx < aiMotions(state, caseFile).length) {
        presentNextAiMotion(state, caseFile, events);
      } else {
        concludePretrial(state, caseFile, events);
      }
      return;
    }
    case 'openings': {
      const turn = state.openingTurn;
      if (turn === state.userSide) {
        push(events, state, judgeEv(caseFile, `${sideTitle(turn)}, the jury is waiting. Your opening, counsel.`));
        return;
      }
      const text = await aiStatement(state, caseFile, 'opening statement');
      push(events, state, counselEv(state, caseFile, text, 'statement', { paragraphs: true }));
      advanceAfterStatement(state, caseFile, events);
      return;
    }
    case 'closings': {
      const turn = state.closingTurn;
      if (turn === state.userSide) {
        push(events, state, judgeEv(caseFile, `${sideTitle(turn)}, your closing argument, counsel.`));
        return;
      }
      const text = await aiStatement(state, caseFile, 'closing argument');
      push(events, state, counselEv(state, caseFile, text, 'statement', { paragraphs: true }));
      advanceAfterStatement(state, caseFile, events);
      return;
    }
    case 'prosecution_case':
    case 'defense_case': {
      await advanceEvidence(state, caseFile, events);
      return;
    }
    case 'deliberation': {
      await deliberate(state, caseFile, events);
      return;
    }
    default:
      push(events, state, sys('system', 'The trial has concluded.', { speak: false }));
  }
}

async function advanceEvidence(state, caseFile, events) {
  const cs = caseSideOf(state);
  const exam = state.exam;

  // A witness is up and the AI is examining (its direct, or cross of a user witness).
  if (exam && !examinerIsUser(state)) {
    const w = witnessOf(state, caseFile);
    if (exam.pendingQuestion) {
      // The question survived the objection window — the witness now answers.
      const q = exam.pendingQuestion;
      exam.pendingQuestion = null;
      await witnessAnswers(state, caseFile, events, q);
      return;
    }
    const out = await aiNextQuestion(state, caseFile, w);
    if (out.pass || exam.qCount >= maxQuestionsFor(state.difficulty, CONFIG.maxAiQuestions)) {
      if (exam.stage === 'direct') {
        exam.stage = 'cross';
        exam.qCount = 0;
        push(events, state, counselEv(state, caseFile, `Nothing further, Your Honor. Pass the witness.`, 'statement'));
        push(events, state, judgeEv(caseFile, `Cross-examination, ${counselTitle(state, caseFile, state.userSide)}?`));
      } else {
        push(events, state, counselEv(state, caseFile, `Nothing further.`, 'statement'));
        push(events, state, judgeEv(caseFile, `Thank you, ${w.name}. You may step down.`));
        state.exam = null;
      }
      return;
    }
    exam.pendingQuestion = out.question;
    exam.qCount += 1;
    push(events, state, counselEv(state, caseFile, out.question, 'question', { awaitingAnswer: true }));
    return;
  }

  // Witness on the stand, user examining — nudge.
  if (exam && examinerIsUser(state)) {
    push(events, state, judgeEv(caseFile, `Counsel, your witness. Put your question or pass.`));
    return;
  }

  // No witness up. If it's the AI's case-in-chief: call next or rest.
  if (cs === state.aiSide) {
    const roster = caseFile.witnesses.filter((w) => w.side === state.aiSide && !state.aiWitnessesCalled.includes(w.id));
    if (state.aiWitnessesCalled.length >= CONFIG.maxAiWitnesses || roster.length === 0) {
      push(events, state, counselEv(state, caseFile, `Your Honor, the ${state.aiSide} rests.`, 'statement'));
      concludeCasePhase(state, caseFile, events);
      return;
    }
    // Strategic order of proof: the AI chooses its next witness (or rests)
    // from what the record still needs, not from case-file order.
    const pick = await chat(
      [
        { role: 'system', content: counselSystem({ caseFile, side: state.aiSide, phaseLabel: 'planning the order of proof in your case-in-chief', difficulty: diff(state).counsel }) },
        { role: 'user', content: `RECORD SO FAR:\n${transcriptText(state)}\n\nWitnesses you have already called: ${state.aiWitnessesCalled.length ? state.aiWitnessesCalled.join(', ') : '(none)'}\nYou may call up to ${CONFIG.maxAiWitnesses} witnesses total.\n\nREMAINING ROSTER:\n${roster.map((r) => `- id "${r.id}": ${r.name} — ${r.description}`).join('\n')}\n\nChoose your next witness for maximum persuasive effect given what the jury has heard, or rest if your remaining witnesses add nothing your case still needs.\nRespond with ONLY JSON: {"witnessId": "<id from the roster>"} or {"rest": true}` },
      ],
      { json: true, temperature: 0.4, effort: 'none', hedgeDelayMs: 3500, mock: () => ({ witnessId: roster[0].id }) }
    ).catch(() => ({ witnessId: roster[0].id }));
    if (pick?.rest && state.aiWitnessesCalled.length > 0) {
      push(events, state, counselEv(state, caseFile, `Your Honor, the ${state.aiSide} rests.`, 'statement'));
      concludeCasePhase(state, caseFile, events);
      return;
    }
    const w = roster.find((r) => r.id === pick?.witnessId) || roster[0];
    state.aiWitnessesCalled.push(w.id);
    state.exam = { witnessId: w.id, calledBy: state.aiSide, stage: 'direct', pendingQuestion: null, qCount: 0, startIdx: state.record.length };
    push(events, state, counselEv(state, caseFile, `The ${state.aiSide} calls ${w.name}.`, 'statement'));
    push(events, state, sys('clerk', `${w.name} is sworn and takes the stand.`, { speak: true }));
    return;
  }

  // User's case-in-chief with no witness up — nudge.
  push(events, state, judgeEv(caseFile, `${sideTitle(cs)}, call your next witness or rest your case.`));
}

async function aiNextQuestion(state, caseFile, w) {
  const isDirect = state.exam.stage === 'direct';
  const examTranscript = examinationText(state, caseFile);
  return await chat(
    [
      { role: 'system', content: counselSystem({ caseFile, side: state.aiSide, phaseLabel: `${state.exam.stage} examination of ${w.name}`, difficulty: diff(state).counsel }) },
      { role: 'user', content: `WITNESS: ${w.name} — ${w.description}.\nWhat this witness can speak to (from the case file): ${w.knowledge}\n\nEXAMINATION SO FAR (${state.exam.qCount} question${state.exam.qCount === 1 ? '' : 's'} asked):\n${examTranscript || '(none yet)'}\n\nYou are conducting ${isDirect
        ? 'DIRECT examination (open-ended, no leading). Run a COMPLETE, true-to-life direct: establish who the witness is and their role, lay foundation, then walk them through their knowledge in logical sequence — scene, observations, times, exhibits, and the specifics a real jury needs. One question per turn, each building on the last answer. Do NOT pass while material areas of this witness\'s knowledge remain unexplored; pass ONLY when their story is fully before the jury and further questions would merely repeat.'
        : 'CROSS examination (short, leading, one fact per question). Be purposeful: attack what damaged you, extract the concessions this witness must give, then stop — a pointed cross beats a long one. Pass when your objectives are met.'}\nAsk your single next question.\nRespond with ONLY JSON: {"question": "<the question>"} or {"pass": true}` },
    ],
    {
      json: true,
      temperature: 0.7,
      effort: 'none', hedgeDelayMs: 3500,
      mock: () => {
        const n = state.exam.qCount;
        if (n >= 8) return { pass: true };
        const s = sentences(w.knowledge);
        const topic = s[n % s.length] || w.description;
        return isDirect
          ? { question: `Let me direct your attention to the events at issue. Can you tell the jury, in your own words, about this: ${topic.replace(/\.$/, '')}?` }
          : { question: `Isn't it true that ${topic.replace(/\.$/, '').toLowerCase()}?` };
      },
    }
  );
}

/* Auto-draft the USER's opening on request. Openings preview the evidence
 * rather than argue, so drafting one reveals no strategy — the generated
 * text is submitted through the exact same pipeline as a typed statement:
 * opposing counsel may object, the judge screens it, and it enters the
 * record as the user's own opening. */
async function userAutoStatement(state, caseFile, events) {
  if (state.phase !== 'openings') {
    push(events, state, sys('system', 'Auto-drafting is available for opening statements only.', { speak: false }));
    return;
  }
  if (state.openingTurn !== state.userSide) {
    push(events, state, sys('system', 'It is not your turn to address the jury.', { speak: false }));
    return;
  }
  const text = await aiStatement(state, caseFile, 'opening statement', state.userSide);
  await userStatement(state, caseFile, events, text);
}

async function aiStatement(state, caseFile, kindLabel, side = state.aiSide) {
  const transcript = transcriptText(state);
  return await chat(
    [
      { role: 'system', content: counselSystem({ caseFile, side, phaseLabel: kindLabel, difficulty: diff(state).counsel }) },
      { role: 'user', content: `RECORD SO FAR:\n${transcript}\n\nStanding exclusions you must honor:\n${state.exclusions.map((e) => `- ${e}`).join('\n') || '- none'}\n\nDeliver your ${kindLabel} to the jury now. 4-7 short paragraphs, spoken prose, separated by blank lines. ${kindLabel === 'opening statement' ? 'Preview the evidence; do not argue.' : 'Argue the evidence against the elements; end with a clear ask.'}` },
    ],
    {
      temperature: 0.75,
      effort: 'low', hedgeDelayMs: 3500,
      provider: 'xai',
      mock: () => {
        const theory = caseFile.theories[side];
        const ev = caseFile.evidence.filter((e) => e.offeredBy === side || e.offeredBy === 'both').slice(0, 3).map((e) => e.label.replace(/Exhibit \d+: /, ''));
        return `May it please the court. Members of the jury, ${theory}\n\nThe evidence will speak plainly: ${ev.join('; ')}.\n\n${kindLabel === 'opening statement' ? 'Listen closely to each witness — the story they tell together is the only one that fits.' : `When you apply the law to this record, only one verdict is faithful to your oath. We ask you to return it.`}`;
      },
    }
  );
}

/* ============================== objections ============================== */

async function userObjects(state, caseFile, events, action) {
  if (['pretrial', 'deliberation', 'verdict'].includes(state.phase)) {
    push(events, state, sys('system', 'There is no objectionable matter before the court in this phase.', { speak: false }));
    return;
  }
  if (state.pending) {
    push(events, state, sys('system', 'A matter is already pending — respond to it first.', { speak: false }));
    return;
  }
  const basis = basisById(action.basis);
  if (!basis) { push(events, state, sys('system', 'Pick a recognized basis for your objection.', { speak: false })); return; }
  // Objections lie against counsel and witnesses — never the court itself.
  const target = state.record.find((e) => e.id === action.targetEventId && ['ai_counsel', 'witness'].includes(e.actor) && !e.stricken)
    || lastSpeakable(state);
  if (!target) { push(events, state, sys('system', 'Nothing to object to yet.', { speak: false })); return; }

  push(events, state, userEv(state, caseFile, `Objection, Your Honor — ${basis.label.toLowerCase()}. ${action.argument || ''}`, 'objection'));

  // Opposing counsel gets a brief reply, then the judge rules.
  const reply = await counselFreeText(state, caseFile, state.aiSide,
    `The ${state.userSide} has objected to your last submission ("${excerpt(target.text, 240)}") on the basis of ${basis.label} (${basis.desc}). Their argument: "${action.argument || '(none)'}". Respond to the objection in 1-3 spoken sentences.`,
    () => `Your Honor, the ${state.aiSide} submits the material is proper: it is probative, within the rules, and counsel's concern goes to weight, not admissibility.`);
  push(events, state, counselEv(state, caseFile, reply, 'argument'));

  const ruling = await judgeObjectionRuling(state, caseFile, {
    objector: state.userSide,
    basis,
    argument: action.argument,
    reply,
    targetText: target.text,
  });
  applyObjectionRuling(state, caseFile, events, { ruling, objector: 'user', target, paragraphIndex: action.paragraphIndex });
}

async function ruleOnAiObjection(state, caseFile, events, pending, userResponse) {
  const basis = basisById(pending.review.basis);
  const ruling = await judgeObjectionRuling(state, caseFile, {
    objector: state.aiSide,
    basis: basis || { label: pending.review.basis, desc: '' },
    argument: pending.review.argument,
    reply: userResponse,
    targetText: pending.submission.text,
  });
  const r = ruling || fallbackRuling();
  const challenged = pending.submission.eventId ? state.record.find((e) => e.id === pending.submission.eventId) : null;
  if (r.ruling === 'sustained') {
    state.score.aiObjections.sustained += 1;
    state.score.stricken += 1;
    if (challenged) challenged.stricken = true; // the blocked words stay visible, struck through
    push(events, state, judgeEv(caseFile, `Sustained. ${r.reasoning || ''}${r.admonishment ? ' ' + r.admonishment : ''}`, { kind: 'ruling', strikeTargetId: challenged?.id }));
    if (r.admonishment) state.score.admonishments += 1;
    push(events, state, sys('system', pending.submission.kind === 'question' ? 'Your question was blocked before the witness could answer. Rephrase it.' : 'Your statement was blocked before reaching the jury. Rephrase and resubmit.', { speak: false }));
  } else {
    state.score.aiObjections.overruled += 1;
    push(events, state, judgeEv(caseFile, `Overruled. ${r.reasoning || ''} You may proceed, counsel.`, { kind: 'ruling' }));
    await admitUserSubmission(state, caseFile, events, pending.submission);
  }
}

async function judgeObjectionRuling(state, caseFile, { objector, basis, argument, reply, targetText }) {
  const transcript = transcriptText(state);
  return await chat(
    [
      { role: 'system', content: judgeSystem({ caseFile, difficulty: diff(state).judge }) },
      { role: 'user', content: `RECORD (recent):\n${transcript}\n\nTHE CHALLENGED MATERIAL (offered by the ${otherSideName(state, objector)}): "${targetText}"\nOBJECTION by the ${objector}: ${basis.label} — ${basis.desc}\nObjector's argument: "${argument || '(none)'}"\nProponent's reply: "${reply || '(none)'}"\n\n${judgeRulingTask({ pretrialExclusions: state.exclusions })}` },
    ],
    {
      json: true,
      temperature: 0.3,
      effort: 'low', hedgeDelayMs: 3500,
      provider: 'xai',
      mock: () => fallbackRuling(targetText + basis.label),
    }
  );
}

// When the live judge is unavailable, doubt goes to the proponent.
function fallbackRuling() {
  return { ruling: 'overruled', reasoning: 'The court is not persuaded the objection is well taken on this record.', admonishment: null, instruct_disregard: false };
}

function applyObjectionRuling(state, caseFile, events, { ruling, target, paragraphIndex }) {
  const r = ruling || fallbackRuling(target.text);
  if (r.ruling === 'sustained') {
    state.score.userObjections.sustained += 1;
    if (typeof paragraphIndex === 'number' && Array.isArray(target.paragraphList)) {
      target.strickenParas = target.strickenParas || [];
      target.strickenParas.push(paragraphIndex);
    } else {
      target.stricken = true;
    }
    if (target.kind === 'question' && state.exam?.pendingQuestion === target.text) {
      state.exam.pendingQuestion = null; // question withdrawn before any answer
    }
    push(events, state, judgeEv(caseFile, `Sustained. ${r.reasoning || ''}${r.instruct_disregard ? ' The jury will disregard the last remarks entirely; they are stricken and are not evidence.' : ''}${r.admonishment ? ' ' + r.admonishment : ''}`, { kind: 'ruling', strikeTargetId: target.id, strikeParagraph: paragraphIndex }));
    // Hard-interrupt semantics: if the objection was to a question and an
    // answer already slipped onto the record before the ruling (the user
    // objected mid-flight), the answer falls with the question.
    if (target.kind === 'question') {
      const idx = state.record.indexOf(target);
      for (let i = idx + 1; i >= 0 && i < state.record.length; i++) {
        const e = state.record[i];
        if (e.kind === 'question') break; // a later question starts a new chain
        if (e.actor === 'witness' && e.kind === 'answer' && !e.stricken) {
          e.stricken = true;
          push(events, state, sys('system', 'The answer given to the stricken question is likewise stricken.', { speak: false, strikeTargetId: e.id }));
          break;
        }
      }
    }
    if (r.admonishment) state.score.admonishments += 1;
  } else {
    state.score.userObjections.overruled += 1;
    push(events, state, judgeEv(caseFile, `Overruled. ${r.reasoning || ''}`, { kind: 'ruling' }));
  }
}

/* ============================== review & screening ============================== */

async function counselReview(state, caseFile, text, contextLabel) {
  const transcript = transcriptText(state);
  return await chat(
    [
      { role: 'system', content: counselReviewSystem({ caseFile, side: state.aiSide, difficulty: diff(state).counsel }) },
      { role: 'user', content: `RECORD (recent):\n${transcript}\n\nStanding exclusions ordered by the court:\n${state.exclusions.map((e) => `- ${e}`).join('\n') || '- none'}\n\nOpposing counsel's submission (${contextLabel}), which the jury has NOT yet heard:\n"${text}"\n\nDecide per your task instructions.` },
    ],
    {
      json: true,
      temperature: 0.4,
      effort: 'none', hedgeDelayMs: 3500,
      mock: () => {
        const t = text.toLowerCase();
        if (/(didn't you|isn't it true|wouldn't you agree)/.test(t) && state.exam?.stage === 'direct' && examinerIsUser(state))
          return { object: true, basis: 'leading', argument: 'Counsel is leading their own witness on direct examination.' };
        if (/(told me|told him|told her|she said|he said|they said)/.test(t) && state.exam)
          return { object: true, basis: 'hearsay', argument: 'The question calls for an out-of-court statement offered for its truth.' };
        if (hash01(text) > 0.85)
          return { object: true, basis: 'relevance', argument: 'This has no tendency to prove any fact of consequence.' };
        return { object: false, basis: null, argument: null };
      },
    }
  );
}

async function judgeScreen(state, caseFile, text) {
  // Cheap path: nothing excluded and no red-flag phrasing → skip the call.
  if (state.exclusions.length === 0 && !/(golden rule|put yourself|i personally|i guarantee|my opinion is)/i.test(text)) {
    return { intervene: false };
  }
  return await chat(
    [
      { role: 'system', content: judgeSystem({ caseFile, difficulty: diff(state).judge }) },
      { role: 'user', content: `A party is about to present this to the jury:\n"${text}"\n\n${judgeScreenTask({ pretrialExclusions: state.exclusions })}` },
    ],
    {
      json: true,
      temperature: 0.2,
      effort: 'none', hedgeDelayMs: 3500,
      mock: () => {
        // Offline heuristic: flag only when the submission shares 2+ distinctive
        // content words with an exclusion (common legal vocabulary ignored).
        const STOP = new Set(['defense', 'prosecution', 'motion', 'motions', 'moves', 'limine', 'exclude', 'excluded', 'excludes', 'references', 'reference', 'alleged', 'allegations', 'statements', 'statement', 'defendant', 'victims', 'victim', 'evidence', 'character', 'prejudicial', 'prejudice', 'matter', 'targeted', 'improper', 'unduly', 'probative', 'court', 'jury']);
        const hit = state.exclusions.find((e) => {
          const words = [...new Set(e.toLowerCase().split(/\W+/).filter((w) => w.length >= 6 && !STOP.has(w)))];
          const hits = words.filter((w) => text.toLowerCase().includes(w));
          return hits.length >= 2;
        });
        return hit
          ? { intervene: true, statement: `Counsel, stop right there. That subject is covered by my pretrial ruling and you know it. The jury will not hear it. Consider yourself admonished.`, block: true }
          : { intervene: false, statement: null, block: false };
      },
    }
  );
}

async function counselFreeText(state, caseFile, side, task, mock) {
  return await chat(
    [
      { role: 'system', content: counselSystem({ caseFile, side, phaseLabel: state.phase, difficulty: diff(state).counsel }) },
      { role: 'user', content: `RECORD (recent):\n${transcriptText(state)}\n\n${task}` },
    ],
    { temperature: 0.6, effort: 'none', hedgeDelayMs: 3500, mock }
  );
}

/* ============================== deliberation & verdict ============================== */

/* The jury retires and deliberates IN PRIVATE — round after round — and the
 * courtroom hears nothing until they return with a verdict (or hang). The
 * full round-by-round discussion and ballots live only in the deliberation
 * log, which surfaces after the verdict as the transcript's juror sheet —
 * expressly outside the official record, exactly like real life except the
 * user gets to peek afterward. */
async function deliberate(state, caseFile, events) {
  if (state.phase !== 'deliberation') { push(events, state, sys('system', 'The jury is not out.', { speak: false })); return; }
  push(events, state, sys('clerk', `The jury retires to the jury room to deliberate. The courtroom stands at ease.`, { speak: true }));
  const record = jurorFacingRecord(state, caseFile);
  while (!state.deliberation.verdict) {
    const round = await runDeliberationRound(state, caseFile, record);
    if (!round.done && state.deliberation.round === CONFIG.maxDelibRounds - 1) {
      // The panel reports it is struggling; the court gives the Allen charge.
      push(events, state, sys('clerk', `The jury sends a note: they are having difficulty reaching unanimity. The court brings them in.`, { speak: false }));
      push(events, state, judgeEv(caseFile, `Members of the jury, I urge you to continue deliberating with open minds and to re-examine your own views — but no juror should surrender an honest conviction merely to return a verdict. Please resume your deliberations.`, { kind: 'instructions' }));
    }
  }
  push(events, state, sys('system', `The jury deliberated for ${state.deliberation.round} round${state.deliberation.round === 1 ? '' : 's'}. Their discussion is sealed from the courtroom — the full round-by-round deliberation sheet and ballots are appended to your transcript.`, { speak: false }));
  await deliverVerdict(state, caseFile, events);
}

async function deliverVerdict(state, caseFile, events) {
  state.phase = 'verdict';
  const v = state.deliberation.verdict || tallyVotes(state, caseFile).verdict;
  const foreperson = state.jury[0];
  push(events, state, sys('clerk', 'All rise. The jury has reached its conclusion.', { speak: true }));
  const lines = caseFile.charges.map((ch) => {
    const opt = v[ch.id];
    const label = opt === 'hung' ? 'the jury is unable to reach a unanimous verdict' : `we the jury find the defendant ${humanVerdict(opt)}`;
    return `On ${ch.name}: ${label}.`;
  });
  push(events, state, { id: nextId(), actor: 'juror', name: `Foreperson — Juror ${foreperson.seat}, ${foreperson.name}`, side: null, text: lines.join(' '), kind: 'verdict', speak: true });
  push(events, state, judgeEv(caseFile, `The verdict is recorded. Members of the jury, thank you for your service; you are discharged. We are adjourned.`, {}));

  // Win/loss is computed objectively from the verdict, per count, for the
  // USER's side; the judge's debrief supplies grade, best arguments, and the
  // turning points that decided it.
  const counts = { won: 0, lost: 0, hung: 0 };
  for (const ch of caseFile.charges) {
    const opt = v[ch.id];
    if (opt === 'hung') counts.hung += 1;
    else if (String(opt).startsWith('guilty') === (state.userSide === 'prosecution')) counts.won += 1;
    else counts.lost += 1;
  }
  const outcome = counts.lost === 0 && counts.won > 0 && counts.hung === 0 ? 'won'
    : counts.won === 0 && counts.lost > 0 && counts.hung === 0 ? 'lost'
    : counts.won === 0 && counts.lost === 0 ? 'hung' : 'mixed';

  const delibTail = state.deliberation.log.slice(-12).map((m) => `[R${m.round}] Juror ${m.seat}: ${m.statement}`).join('\n');
  const debrief = await chat(
    [
      { role: 'system', content: judgeSystem({ caseFile, difficulty: diff(state).judge }) },
      { role: 'user', content: `FULL RECORD:\n${transcriptText(state, 14000)}\n\nVERDICT: ${JSON.stringify(v)} (the ${state.userSide} — the human attorney — ${outcome.toUpperCase()} on this verdict: ${counts.won} count(s) won, ${counts.lost} lost, ${counts.hung} hung)\n\nFROM THE JURY ROOM (sealed deliberations, final rounds):\n${delibTail || '(none)'}\n\n${performanceReviewTask({ side: state.userSide, score: state.score })}` },
    ],
    {
      json: true,
      temperature: 0.6,
      provider: 'xai',
      mock: () => {
        const s = state.score;
        const grade = s.admonishments > 2 ? 'C-' : s.userObjections.sustained >= s.userObjections.overruled ? 'B+' : 'B-';
        return {
          grade,
          review: `Counsel, a word from the bench now that the jury is gone. Overall grade: ${grade}. You raised ${s.userObjections.sustained + s.userObjections.overruled} objections (${s.userObjections.sustained} sustained). Opposing counsel blocked ${s.aiObjections.sustained} of your submissions, and the bench admonished you ${s.admonishments} time(s). Sharpen your case theory into a single sentence and make every witness serve it. Dismissed.`,
          bestArguments: ['Your strongest material tracked your case theory', 'Objections you won protected the record at the right moments'],
          turningPoints: ['The exhibits the jurors repeated by name in deliberation decided the close counts'],
          improvement: ['Tie every examination to an element of a charge', 'Spend objections only where the harm is real'],
        };
      },
    }
  );
  const d = debrief && typeof debrief === 'object' ? debrief : {};
  const arr = (x, n) => (Array.isArray(x) ? x.map((i) => String(i)).slice(0, n) : []);
  state.caseSummary = {
    outcome,
    counts,
    verdict: v,
    grade: String(d.grade || '—').slice(0, 3),
    bestArguments: arr(d.bestArguments, 5),
    turningPoints: arr(d.turningPoints, 5),
    improvement: arr(d.improvement, 3),
  };
  push(events, state, judgeEv(caseFile, String(d.review || 'Counsel, see your written debrief.'), { kind: 'performance_review' }));
}

function humanVerdict(opt) {
  return String(opt).replace(/_/g, ' ');
}

function formatTally(tally, caseFile) {
  return caseFile.charges
    .map((ch) => `${ch.id}: ` + Object.entries(tally[ch.id]).map(([k, v]) => `${humanVerdict(k)} ${v}`).join(', '))
    .join(' | ');
}

/* ============================== record & views ============================== */

function push(events, state, ev) {
  ev.phase = state.phase;
  ev.ts = Date.now();
  if (ev.text && ev.meta?.paragraphs) {
    ev.paragraphList = String(ev.text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }
  state.record.push(ev);
  events.push(ev);
}

function sys(actor, text, opts = {}) {
  return { id: nextId(), actor, name: actor === 'clerk' ? 'Clerk of the Court' : 'System', side: null, text, kind: opts.kind || 'system', speak: opts.speak !== false, meta: opts };
}

function judgeEv(caseFile, text, opts = {}) {
  return { id: nextId(), actor: 'judge', name: `Judge ${caseFile.parties.judge}`, side: null, text, kind: opts.kind || 'statement', speak: true, meta: opts };
}

function counselEv(state, caseFile, text, kind = 'statement', meta = {}) {
  return { id: nextId(), actor: 'ai_counsel', name: counselName(caseFile, state.aiSide), side: state.aiSide, text, kind, speak: true, meta };
}

function userEv(state, caseFile, text, kind) {
  return { id: nextId(), actor: 'user', name: counselName(caseFile, state.userSide) + ' (you)', side: state.userSide, text, kind, speak: false, meta: {} };
}

function witnessEv(state, caseFile, text) {
  const w = witnessOf(state, caseFile);
  return { id: nextId(), actor: 'witness', name: w.name, side: null, text, kind: 'answer', speak: true, meta: { gender: w.gender || null } };
}

function witnessOf(state, caseFile) {
  return caseFile.witnesses.find((w) => w.id === state.exam?.witnessId);
}

function lastSpeakable(state) {
  for (let i = state.record.length - 1; i >= 0; i--) {
    const e = state.record[i];
    if (['ai_counsel', 'witness'].includes(e.actor) && !e.stricken) return e;
  }
  return null;
}

/** Q/A transcript of the current examination only (unstricken material). */
function examinationText(state) {
  if (!state.exam) return '';
  return state.record
    .slice(state.exam.startIdx || 0)
    .filter((e) => ['question', 'answer', 'objection', 'ruling'].includes(e.kind) && !e.stricken)
    .map((e) => `${e.name}: ${e.text}`)
    .join('\n');
}

function transcriptText(state, maxChars = CONFIG.transcriptMaxChars) {
  const lines = state.record
    .filter((e) => e.kind !== 'system')
    .map((e) => `${e.name}${e.stricken ? ' [STRICKEN]' : ''}: ${e.text}`);
  return clampTail(lines.join('\n'), maxChars);
}

/**
 * What the jury is allowed to consider: admitted, unstricken, non-pretrial
 * material — with stricken paragraphs of long statements removed and (in
 * blinding mode) real-world names aliased.
 */
export function jurorFacingRecord(state, caseFile) {
  const lines = [];
  for (const e of state.record) {
    if (e.phase === 'pretrial') continue; // motions argued outside the jury
    if (e.stricken || e.kind === 'system' || e.jurorOnly) continue;
    if (!['statement', 'question', 'answer', 'ruling', 'instructions', 'verdict'].includes(e.kind)) continue;
    let text = e.text;
    if (Array.isArray(e.paragraphList) && Array.isArray(e.strickenParas)) {
      text = e.paragraphList.filter((_, i) => !e.strickenParas.includes(i)).join('\n');
    }
    lines.push(`${e.name.replace(' (you)', '')} [${e.actor}${e.side ? ', ' + e.side : ''}]: ${text}`);
  }
  let out = lines.join('\n');
  if (CONFIG.jurorAliasing && Array.isArray(caseFile.aliases)) {
    for (const [from, to] of caseFile.aliases) {
      out = out.split(from).join(to);
    }
  }
  return clampTail(out, CONFIG.jurorRecordMaxChars);
}

export function publicState(state, caseFile) {
  return {
    id: state.id,
    caseId: state.caseId,
    userSide: state.userSide,
    aiSide: state.aiSide,
    difficulty: state.difficulty,
    difficultyLabel: difficultyLabel(state.difficulty),
    phase: state.phase,
    openingTurn: state.openingTurn,
    closingTurn: state.closingTurn,
    pending: state.pending ? { type: state.pending.type, motionTitle: state.pending.motion?.title, motionBackground: state.pending.motion?.background || null, basis: state.pending.review?.basis, argument: state.pending.review?.argument } : null,
    exam: state.exam
      ? { witness: witnessOf(state, caseFile)?.name, witnessId: state.exam.witnessId, stage: state.exam.stage, examinerIsUser: examinerIsUser(state), awaitingAnswer: Boolean(state.exam.pendingQuestion) }
      : null,
    exclusions: state.exclusions,
    motions: state.motions,
    score: state.score,
    caseSummary: state.caseSummary || null,
    deliberation: { round: state.deliberation.round, verdict: state.deliberation.verdict, hung: state.deliberation.hung },
    jury: state.jury.map((j) => ({ seat: j.seat, name: j.name, occupation: j.occupation })),
  };
}

/* ============================== misc ============================== */

function otherSide(side) {
  return side === 'prosecution' ? 'defense' : 'prosecution';
}
function otherSideName(state, objector) {
  return otherSide(objector);
}
function sideTitle(side) {
  return side === 'prosecution' ? 'The prosecution' : 'The defense';
}
function counselTitle(state, caseFile, side) {
  return side === state.userSide ? 'counsel' : counselName(caseFile, side);
}
function courtName(caseFile) {
  return caseFile.jurisdiction.split(',')[0];
}
function occupationBlurb(j) {
  return j.occupation;
}
function excerpt(text, n) {
  return String(text).length > n ? String(text).slice(0, n) + '…' : String(text);
}
function requirePhase(state, phase) {
  if (state.phase !== phase) throw new Error(`That action belongs to the ${phase} phase (current: ${state.phase}).`);
}
function requireEvidencePhase(state) {
  if (state.phase !== 'prosecution_case' && state.phase !== 'defense_case') {
    throw new Error(`No witness examination in the ${state.phase} phase.`);
  }
}
