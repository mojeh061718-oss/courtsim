/**
 * Public-data research module.
 *
 * Uses Grok's Live Search (xAI search_parameters) to verify and refresh a
 * case file against current public reporting — important for ongoing matters
 * like Commonwealth v. Clancy. Returns a fact-check report; it never mutates
 * the case file automatically, and it never feeds real-world outcomes into
 * juror-facing material (jurors only ever see the trial record).
 */
import { chat, providerInfo } from '../llm/grokClient.js';

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
        `Live research requires an API key. Offline summary: the case file for "${caseFile.title}" was authored from the public record as of the app's knowledge date. For ongoing matters (${caseFile.status}), re-run this endpoint with a key configured to pull current filings and reporting.`,
    }
  );
  const info = providerInfo();
  return {
    live: info.live,
    liveSearch: info.liveSearch,
    provider: info.provider,
    note: info.live && !info.liveSearch
      ? 'Running on Amazon Bedrock: Live Search is a native-SpaceXAI API feature, so this report reflects model knowledge rather than a live web sweep. Point LLM_PROVIDER=xai at console.x.ai for live-sourced research.'
      : undefined,
    caseId: caseFile.id,
    report,
  };
}
