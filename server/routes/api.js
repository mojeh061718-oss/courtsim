import { Router } from 'express';
import { CASES, getCase, caseSummaries } from '../cases/index.js';
import { createTrial, handleAction, publicState } from '../engine/trialEngine.js';
import { OBJECTION_BASES } from '../engine/objections.js';
import { researchCase } from '../research/publicData.js';
import { buildTranscript } from '../engine/transcript.js';
import { generateCase } from '../generator/caseGenerator.js';
import { buildStrategySheet } from '../engine/strategy.js';
import { synthesize } from '../tts/polly.js';
import { chat } from '../llm/grokClient.js';
import { hasLiveModel, providerInfo } from '../llm/grokClient.js';

const router = Router();
const sessions = new Map(); // trialId -> { state, caseFile }

router.get('/health', (_req, res) => {
  res.json({ ok: true, liveModel: hasLiveModel(), llm: providerInfo(), sessions: sessions.size });
});

router.get('/cases', (_req, res) => {
  res.json({ cases: caseSummaries() });
});

router.get('/cases/:id', (req, res) => {
  const c = getCase(req.params.id);
  if (!c) return res.status(404).json({ error: 'unknown case' });
  res.json({
    id: c.id,
    title: c.title,
    jurisdiction: c.jurisdiction,
    blurb: c.blurb,
    status: c.status,
    disclaimer: c.disclaimer,
    parties: c.parties,
    charges: c.charges,
    hurdles: c.hurdles || { prosecution: [], defense: [] },
    witnesses: c.witnesses.map(({ id, name, side, description }) => ({ id, name, side, description })),
    evidence: c.evidence,
    jurorPool: c.jurorPool,
  });
});

// The trial binder: the complete case file for counsel-table reference —
// full facts, theories, charge elements, instructions, and witness knowledge
// (the equivalent of discovery summaries for examination prep).
router.get('/cases/:id/binder', (req, res) => {
  const c = getCase(req.params.id);
  if (!c) return res.status(404).json({ error: 'unknown case' });
  res.json({
    id: c.id,
    title: c.title,
    caseNumber: c.caseNumber,
    parties: c.parties,
    factSummary: c.factSummary,
    theories: c.theories,
    hurdles: c.hurdles || { prosecution: [], defense: [] },
    charges: c.charges,
    juryInstructions: c.juryInstructions,
    witnesses: c.witnesses,
    evidence: c.evidence,
    disclaimer: c.disclaimer,
  });
});

router.get('/objection-bases', (_req, res) => {
  res.json({ bases: OBJECTION_BASES });
});

router.post('/trial', (req, res) => {
  const { caseId, side, difficulty } = req.body || {};
  const caseFile = getCase(caseId);
  if (!caseFile) return res.status(400).json({ error: 'unknown case' });
  if (!['prosecution', 'defense'].includes(side)) return res.status(400).json({ error: 'side must be prosecution or defense' });
  const { state, events } = createTrial(caseFile, side, difficulty);
  sessions.set(state.id, { state, caseFile });
  res.json({ trialId: state.id, events, state: publicState(state, caseFile) });
});

// Dictation repair: fix speech-to-text errors in a courtroom utterance using
// the case's own vocabulary. Meaning and substance are never altered.
router.post('/cleanup', async (req, res) => {
  const { text, caseId } = req.body || {};
  const raw = String(text || '').trim();
  if (!raw) return res.status(400).json({ error: 'no text' });
  const c = getCase(caseId);
  const vocab = c
    ? [c.parties.defendant, ...c.parties.victims, c.parties.judge, c.parties.prosecutor, c.parties.defenseCounsel,
       ...c.witnesses.map((w) => w.name)].join('; ')
    : '';
  try {
    const cleaned = await chat(
      [
        { role: 'system', content: `You repair speech-to-text transcription errors in courtroom utterances spoken by an attorney. Fix ONLY transcription artifacts: homophones ("You're honor" -> "Your Honor"), broken words ("Mis characterizing" -> "mischaracterizing"), wrong articles, missing punctuation, and garbled legal terms (in limine, voir dire, sua sponte, prima facie, Rule 403/404(b)/611/702, foundation, hearsay). Use these case names when the audio clearly meant them: ${vocab}. NEVER change the meaning, add arguments, remove content, or polish style beyond transcription repair. Return ONLY the corrected text, nothing else.` },
        { role: 'user', content: raw },
      ],
      { temperature: 0.1, effort: 'none', timeoutMs: 15000, mock: () => raw }
    );
    const out = typeof cleaned === 'string' && cleaned.trim() ? cleaned.trim() : raw;
    // Guardrail: if the model rewrote rather than repaired, keep the original.
    res.json({ text: out.length > raw.length * 2 || out.length < raw.length * 0.4 ? raw : out });
  } catch {
    res.json({ text: raw });
  }
});

router.post('/tts', async (req, res) => {
  const { text, role, key, voice } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'no text' });
  try {
    const audio = await synthesize({ text: String(text), role: String(role || 'witness'), key, voice: String(voice || '') });
    if (!audio) return res.status(503).json({ error: 'tts unavailable' });
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(audio);
  } catch (err) {
    console.error('[tts]', err);
    res.status(503).json({ error: 'tts failed' });
  }
});

router.post('/generate-case', async (req, res) => {
  const { theme, difficulty } = req.body || {};
  try {
    const caseFile = await generateCase({ theme: String(theme || '').slice(0, 200), difficulty });
    res.json({ id: caseFile.id, title: caseFile.title, difficulty: caseFile.difficulty, status: caseFile.status, fallback: Boolean(caseFile.fallback) });
  } catch (err) {
    console.error('[generate]', err);
    res.status(500).json({ error: err.message });
  }
});

// War-room strategy sheet: confidential work product for the human attorney.
// Cached per trial. Never enters the record, the transcript, or any AI
// actor's context — the court cannot see it and it affects nothing.
router.post('/trial/:id/strategy', async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown trial' });
  if (s.strategy) return res.json({ strategy: s.strategy, cached: true });
  if (s.strategyBusy) return res.status(429).json({ error: 'your team is still drafting the sheet' });
  s.strategyBusy = true;
  try {
    s.strategy = await buildStrategySheet(s.caseFile, s.state.userSide);
    res.json({ strategy: s.strategy, cached: false });
  } catch (err) {
    console.error('[strategy]', err);
    res.status(500).json({ error: err.message });
  } finally {
    s.strategyBusy = false;
  }
});

router.get('/trial/:id', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown trial' });
  res.json({ state: publicState(s.state, s.caseFile), record: s.state.record });
});

router.post('/trial/:id/action', async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown trial' });
  if (s.busy) return res.status(429).json({ error: 'the court is still handling your last action' });
  s.busy = true;
  try {
    const result = await handleAction(s.state, s.caseFile, req.body || {});
    res.json(result);
  } catch (err) {
    console.error('[api]', err);
    res.status(500).json({ error: err.message });
  } finally {
    s.busy = false;
  }
});

router.get('/trial/:id/transcript.txt', async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown trial' });
  try {
    const { text } = await buildTranscript(s.state, s.caseFile);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${s.caseFile.id}-transcript.txt"`);
    res.send(text);
  } catch (err) {
    console.error('[transcript]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/trial/:id/transcript.html', async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown trial' });
  try {
    const { html } = await buildTranscript(s.state, s.caseFile);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[transcript]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/research/:caseId', async (req, res) => {
  const c = getCase(req.params.caseId);
  if (!c) return res.status(404).json({ error: 'unknown case' });
  try {
    res.json(await researchCase(c));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
