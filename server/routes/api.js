import { Router } from 'express';
import { CASES, getCase, caseSummaries } from '../cases/index.js';
import { createTrial, handleAction, publicState } from '../engine/trialEngine.js';
import { OBJECTION_BASES } from '../engine/objections.js';
import { researchCase } from '../research/publicData.js';
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
    witnesses: c.witnesses.map(({ id, name, side, description }) => ({ id, name, side, description })),
    evidence: c.evidence,
    jurorPool: c.jurorPool,
  });
});

router.get('/objection-bases', (_req, res) => {
  res.json({ bases: OBJECTION_BASES });
});

router.post('/trial', (req, res) => {
  const { caseId, side } = req.body || {};
  const caseFile = getCase(caseId);
  if (!caseFile) return res.status(400).json({ error: 'unknown case' });
  if (!['prosecution', 'defense'].includes(side)) return res.status(400).json({ error: 'side must be prosecution or defense' });
  const { state, events } = createTrial(caseFile, side);
  sessions.set(state.id, { state, caseFile });
  res.json({ trialId: state.id, events, state: publicState(state, caseFile) });
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
