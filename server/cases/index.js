import shirilla from './shirilla.js';
import caseyAnthony from './caseyAnthony.js';
import clancy from './clancy.js';
import ojSimpson from './ojSimpson.js';

export const CASES = [shirilla, caseyAnthony, clancy, ojSimpson];

export function getCase(id) {
  return CASES.find((c) => c.id === id) || null;
}

export function caseSummaries() {
  return CASES.map((c) => ({
    id: c.id,
    title: c.title,
    jurisdiction: c.jurisdiction,
    blurb: c.blurb,
    charges: c.charges.map((ch) => ch.name),
    status: c.status,
  }));
}
