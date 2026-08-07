/* Trial persistence: every action checkpoints the full session to disk, so a
 * trial survives server restarts and deploys and the user can resume exactly
 * where they left off. Saves never block the courtroom.
 *
 * Lifecycle policy: mid-trial checkpoints persist until the trial finishes;
 * a COMPLETED (verdict) trial is erased — memory and disk — after a short
 * grace window for downloading the transcript, as if it never existed. */

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'trials');
const MAX_SAVED = 400; // hard backstop; normal cleanup is the verdict purge
const COMPLETED_GRACE_MS = 60 * 60 * 1000; // finished trials linger 1h for transcript download
const STALE_MS = 60 * 24 * 60 * 60 * 1000; // abandoned mid-trial saves expire after 60 days

let storeOk = true;
try {
  fs.mkdirSync(DIR, { recursive: true });
} catch (err) {
  storeOk = false;
  console.error('[store] cannot create data dir — trials will NOT survive restarts', err);
}

export function storeHealthy() {
  return storeOk;
}

// Trial ids are generated internally, but never trust an id as a path.
const fileFor = (id) => (/^[A-Za-z0-9_-]{1,80}$/.test(id) ? path.join(DIR, id + '.json') : null);

/* Writes are serialized per trial and coalesced: while one checkpoint is on
 * its way to disk, newer ones just replace the "next" slot, so the newest
 * state always lands last and two writes can never interleave in one file.
 * Each write goes to a temp file then renames — atomic on POSIX — so a crash
 * mid-write can never leave a truncated, unrecoverable checkpoint. */
const writers = new Map(); // id -> { next: string | null, running: boolean }

function pump(id, file) {
  const w = writers.get(id);
  if (!w || w.running) return;
  const body = w.next;
  if (body == null) {
    writers.delete(id);
    return;
  }
  w.next = null;
  w.running = true;
  const tmp = file + '.tmp';
  fs.writeFile(tmp, body, (err) => {
    if (err) {
      console.error('[store] save', err);
      w.running = false;
      return pump(id, file);
    }
    fs.rename(tmp, file, (err2) => {
      if (err2) console.error('[store] rename', err2);
      w.running = false;
      pump(id, file);
    });
  });
}

let savesSincePrune = 0;

export function saveTrial(session) {
  const id = session?.state?.id || '';
  const file = fileFor(id);
  if (!file) return;
  const body = JSON.stringify({ state: session.state, caseFile: session.caseFile, strategy: session.strategy || null });
  const w = writers.get(id) || { next: null, running: false };
  w.next = body;
  writers.set(id, w);
  pump(id, file);
  if (++savesSincePrune >= 50) {
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

/* Permanent transcript archive: written the moment a verdict lands, never
 * touched by any purge. The trial state may be wiped afterward — the
 * transcript survives. */
const ARCHIVE_DIR = path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'archive');
try { fs.mkdirSync(ARCHIVE_DIR, { recursive: true }); } catch { /* logged via storeOk path */ }

export function archivePath(name) {
  return /^[A-Za-z0-9._-]{1,120}$/.test(name) && !name.includes('..') ? path.join(ARCHIVE_DIR, name) : null;
}

export function saveArchive(name, buffer) {
  const p = archivePath(name);
  if (!p) return;
  fs.writeFile(p, buffer, (err) => { if (err) console.error('[archive] save', err); });
}

export function listArchive() {
  try {
    return fs.readdirSync(ARCHIVE_DIR)
      .filter((n) => n.endsWith('.pdf'))
      .map((n) => { const st = fs.statSync(path.join(ARCHIVE_DIR, n)); return { name: n, size: st.size, mtime: st.mtimeMs }; })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

export function deleteTrial(id) {
  const file = fileFor(String(id || ''));
  if (!file) return;
  writers.delete(id);
  fs.unlink(file, (err) => {
    if (err && err.code !== 'ENOENT') console.error('[store] delete', err);
  });
  fs.unlink(file + '.tmp', () => {});
}

/* Erase finished trials past their grace window, expire abandoned saves, and
 * enforce the hard cap (oldest first) as a last resort. Runs at boot and
 * periodically; reads are cheap at these file counts. */
export function purgeCompleted() {
  try {
    const now = Date.now();
    const entries = [];
    for (const n of fs.readdirSync(DIR)) {
      if (!n.endsWith('.json')) {
        if (n.endsWith('.tmp')) fs.unlink(path.join(DIR, n), () => {});
        continue;
      }
      const p = path.join(DIR, n);
      let mtime = 0;
      try { mtime = fs.statSync(p).mtimeMs; } catch { continue; }
      let done = false;
      try { done = JSON.parse(fs.readFileSync(p, 'utf8'))?.state?.phase === 'verdict'; } catch { done = true; /* unreadable → junk */ }
      if ((done && now - mtime > COMPLETED_GRACE_MS) || now - mtime > STALE_MS) {
        fs.unlinkSync(p);
      } else {
        entries.push({ p, mtime });
      }
    }
    if (entries.length > MAX_SAVED) {
      entries.sort((a, b) => a.mtime - b.mtime);
      for (const { p } of entries.slice(0, entries.length - MAX_SAVED)) fs.unlinkSync(p);
    }
  } catch (err) {
    console.error('[store] purge', err);
  }
}

function prune() {
  purgeCompleted();
}

purgeCompleted();
