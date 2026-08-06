/* Trial persistence: every action checkpoints the full session to disk, so a
 * trial survives server restarts and deploys and the user can resume exactly
 * where they left off. Saves are fire-and-forget; a failed write never blocks
 * the courtroom. */

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'trials');
const MAX_SAVED = 60;

try {
  fs.mkdirSync(DIR, { recursive: true });
} catch (err) {
  console.error('[store] cannot create data dir', err);
}

// Trial ids are generated internally, but never trust an id as a path.
const fileFor = (id) => (/^[A-Za-z0-9_-]{1,80}$/.test(id) ? path.join(DIR, id + '.json') : null);

let savesSincePrune = 0;

export function saveTrial(session) {
  const file = fileFor(session?.state?.id || '');
  if (!file) return;
  const body = JSON.stringify({ state: session.state, caseFile: session.caseFile, strategy: session.strategy || null });
  fs.writeFile(file, body, (err) => {
    if (err) console.error('[store] save', err);
  });
  if (++savesSincePrune >= 25) {
    savesSincePrune = 0;
    prune();
  }
}

export function loadTrial(id) {
  const file = fileFor(String(id || ''));
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function prune() {
  try {
    const names = fs.readdirSync(DIR).filter((n) => n.endsWith('.json'));
    if (names.length <= MAX_SAVED) return;
    const byAge = names
      .map((n) => ({ n, t: fs.statSync(path.join(DIR, n)).mtimeMs }))
      .sort((a, b) => a.t - b.t);
    for (const { n } of byAge.slice(0, names.length - MAX_SAVED)) fs.unlinkSync(path.join(DIR, n));
  } catch (err) {
    console.error('[store] prune', err);
  }
}

prune();
