/** Small shared helpers for the engine. */

import { randomBytes } from 'node:crypto';

// Ids carry a random component so they can never collide across processes or
// restarts — trials are keyed by id on disk, so a collision would let one
// trial's checkpoint overwrite another's.
let idCounter = 0;
export function nextId(prefix = 'ev') {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(4).toString('hex')}_${(idCounter++).toString(36)}`;
}

/** Deterministic pseudo-random in [0,1) from a string — used by offline mock mode. */
export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function clampTail(text, maxChars) {
  if (text.length <= maxChars) return text;
  return '[…earlier proceedings omitted for length…]\n' + text.slice(text.length - maxChars);
}

export function sentences(text) {
  return (text.match(/[^.!?]+[.!?]+/g) || [text]).map((s) => s.trim()).filter(Boolean);
}

export const CONFIG = {
  maxAiWitnesses: Number(process.env.MAX_AI_WITNESSES || 6),
  maxAiQuestions: Number(process.env.MAX_AI_QUESTIONS || 14),
  jurySize: Number(process.env.JURY_SIZE || 12),
  maxDelibRounds: Number(process.env.MAX_DELIB_ROUNDS || 4),
  jurorAliasing: process.env.JUROR_ALIASING !== '0',
  jurorRecordMaxChars: Number(process.env.JUROR_RECORD_MAX_CHARS || 24000),
  transcriptMaxChars: Number(process.env.TRANSCRIPT_MAX_CHARS || 9000),
};
