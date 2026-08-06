/**
 * Objection bases available to both sides. The user picks one of these when
 * they hit the OBJECTION key; the AI counsel is restricted to the same list.
 * Descriptions are shown in the UI and given to the judge agent as the
 * governing standard (approximating the Federal Rules of Evidence).
 */
export const OBJECTION_BASES = [
  { id: 'hearsay', label: 'Hearsay', rule: 'FRE 801–807', desc: 'Out-of-court statement offered for the truth of the matter asserted, no exception applies.' },
  { id: 'relevance', label: 'Relevance', rule: 'FRE 401/402', desc: 'Evidence does not make any fact of consequence more or less probable.' },
  { id: 'prejudice', label: 'Unfair prejudice', rule: 'FRE 403', desc: 'Probative value substantially outweighed by unfair prejudice, confusion, or waste of time.' },
  { id: 'leading', label: 'Leading', rule: 'FRE 611(c)', desc: 'Question suggests its own answer — improper on direct examination.' },
  { id: 'speculation', label: 'Calls for speculation', rule: 'FRE 602', desc: 'Asks the witness to guess at facts outside their personal knowledge.' },
  { id: 'foundation', label: 'Lack of foundation', rule: 'FRE 602/901', desc: 'No showing of personal knowledge or authentication for the testimony/exhibit.' },
  { id: 'argumentative', label: 'Argumentative', rule: 'FRE 611(a)', desc: 'Counsel is arguing with the witness rather than eliciting facts.' },
  { id: 'asked_answered', label: 'Asked and answered', rule: 'FRE 403/611', desc: 'The question has already been asked and answered.' },
  { id: 'compound', label: 'Compound', rule: 'FRE 611(a)', desc: 'Two or more questions posed as one.' },
  { id: 'narrative', label: 'Calls for a narrative', rule: 'FRE 611(a)', desc: 'Invites a long uncontrolled account rather than question-and-answer.' },
  { id: 'character', label: 'Improper character evidence', rule: 'FRE 404', desc: 'Prior bad acts or character offered to show propensity.' },
  { id: 'improper_opinion', label: 'Improper lay opinion', rule: 'FRE 701', desc: 'Lay witness offering opinion not rationally based on their perception.' },
  { id: 'expert_qualification', label: 'Unqualified expert / unreliable method', rule: 'FRE 702 (Daubert)', desc: 'Witness not qualified, or methodology not reliable/accepted.' },
  { id: 'beyond_scope', label: 'Beyond the scope', rule: 'FRE 611(b)', desc: 'Cross/redirect exceeds the scope of the prior examination.' },
  { id: 'facts_not_in_evidence', label: 'Assumes facts not in evidence', rule: 'FRE 611', desc: 'Question presumes facts that have not been established.' },
  { id: 'misstates', label: 'Misstates the evidence', rule: 'FRE 611', desc: 'Question or argument mischaracterizes prior testimony or exhibits.' },
  { id: 'cumulative', label: 'Cumulative', rule: 'FRE 403', desc: 'Needlessly repetitive of evidence already admitted.' },
  { id: 'privilege', label: 'Privilege', rule: 'FRE 501', desc: 'Calls for privileged communication (attorney-client, spousal, etc.).' },
  { id: 'best_evidence', label: 'Best evidence', rule: 'FRE 1002', desc: 'Content of a writing/recording proved without producing the original.' },
  { id: 'badgering', label: 'Badgering the witness', rule: 'FRE 611(a)', desc: 'Harassing or intimidating the witness.' },
  { id: 'improper_argument', label: 'Improper argument', rule: 'Openings/closings', desc: 'Arguing in opening, vouching, golden-rule appeal, or commenting on silence.' },
  { id: 'violates_ruling', label: 'Violates a pretrial ruling', rule: 'Motion in limine', desc: 'References matter the court has already excluded.' },
];

export function basisById(id) {
  return OBJECTION_BASES.find((b) => b.id === id) || null;
}

export function basesForPrompt() {
  return OBJECTION_BASES.map((b) => `- ${b.id}: ${b.label} (${b.rule}) — ${b.desc}`).join('\n');
}
