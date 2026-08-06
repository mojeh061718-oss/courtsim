/**
 * Minimal .env loader (no dependency): parses KEY=VALUE lines from the
 * project-root .env if present. Real environment variables always win —
 * matching dotenv semantics. Imported FIRST by server/index.js so values are
 * in place before any module reads process.env at load time.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const text = readFileSync(path.join(root, '.env'), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^(["'])(.*)\1$/, '$2');
  }
} catch {
  /* no .env file — fine */
}
