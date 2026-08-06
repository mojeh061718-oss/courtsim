/**
 * Public-data research module.
 *
 * Uses Grok's Live Search (xAI search_parameters) to verify and refresh a
 * case file against current public reporting — important for ongoing matters
 * like Commonwealth v. Clancy. Returns a fact-check report; it never mutates
 * the case file automatically, and it never feeds real-world outcomes into
 * juror-facing material (jurors only ever see the trial record).
 */
import { chat, hasLiveModel } from '../llm/grokClient.js';

export async function researchCase(caseFile) {
  const report = await chat(
    [
      {
        role: 'system',
        content:
          'You are a meticulous legal researcher preparing a mock-trial case file. Verify facts against current public records and reporting. Cite sources. Flag anything in the provided file that is wrong, outdated, or contested. NEVER include the real-world verdict or sentencing in suggested juror-facing text — outcome material must be clearly separated under a heading "OUTCOME (never show jurors)".',
      },
      {
        role: 'user',
        content: `Research task: ${caseFile.researchHint}\n\nCurrent case-file fact summary to verify:\n${caseFile.factSummary}\n\nWitness roster: ${caseFile.witnesses.map((w) => w.name).join(', ')}\nEvidence list: ${caseFile.evidence.map((e) => e.label).join('; ')}\n\nProduce: (1) corrections/updates with sources; (2) newly reported facts worth adding; (3) OUTCOME (never show jurors) — current real-world status.`,
      },
    ],
    {
      search: true,
      temperature: 0.2,
      mock: () =>
        `Live research requires a GROK_API_KEY (xAI Live Search). Offline summary: the case file for "${caseFile.title}" was authored from the public record as of the app's knowledge date. For ongoing matters (${caseFile.status}), re-run this endpoint with an API key configured to pull current filings and reporting.`,
    }
  );
  return { live: hasLiveModel(), caseId: caseFile.id, report };
}
