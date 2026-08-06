/**
 * Public-data research module.
 *
 * Uses the SpaceXAI Agent Tools API (server-side web_search via the Responses
 * endpoint) to verify and refresh a case file against current public
 * reporting — important for ongoing matters like Commonwealth v. Clancy.
 * Native-xAI provider only; on Bedrock the report falls back to model
 * knowledge with a note. Returns a fact-check report; it never mutates the
 * case file automatically, and it never feeds real-world outcomes into
 * juror-facing material (jurors only ever see the trial record).
 */
import { chat, providerInfo, researchWithWebSearch } from '../llm/grokClient.js';

const RESEARCH_INSTRUCTIONS =
  'You are a meticulous legal researcher preparing a mock-trial case file. Verify facts against current public records and reporting using web search. Cite sources with URLs. Flag anything in the provided file that is wrong, outdated, or contested. NEVER include the real-world verdict or sentencing in suggested juror-facing text — outcome material must be clearly separated under a heading "OUTCOME (never show jurors)".';

function researchPrompt(caseFile) {
  return `Research task: ${caseFile.researchHint}\n\nCurrent case-file fact summary to verify:\n${caseFile.factSummary}\n\nWitness roster: ${caseFile.witnesses.map((w) => w.name).join(', ')}\nEvidence list: ${caseFile.evidence.map((e) => e.label).join('; ')}\n\nProduce: (1) corrections/updates with sources; (2) newly reported facts worth adding; (3) OUTCOME (never show jurors) — current real-world status.`;
}

export async function researchCase(caseFile) {
  const info = providerInfo();
  let report;
  if (info.liveSearch) {
    report = await researchWithWebSearch({
      instructions: RESEARCH_INSTRUCTIONS,
      input: [{ role: 'user', content: researchPrompt(caseFile) }],
      mock: () => offlineNote(caseFile),
    });
  } else {
    // Bedrock (or no key): no server-side web tools — model knowledge only.
    report = await chat(
      [
        { role: 'system', content: RESEARCH_INSTRUCTIONS + ' Web search is unavailable in this environment; answer from your knowledge and say plainly what you could not verify.' },
        { role: 'user', content: researchPrompt(caseFile) },
      ],
      { temperature: 0.2, mock: () => offlineNote(caseFile) }
    );
  }
  return {
    live: info.live,
    liveSearch: info.liveSearch,
    provider: info.provider,
    note: info.live && !info.liveSearch
      ? 'Running on Amazon Bedrock: web search is a native-SpaceXAI Agent Tools feature, so this report reflects model knowledge rather than a live web sweep. Point LLM_PROVIDER=xai at console.x.ai for live-sourced research.'
      : undefined,
    caseId: caseFile.id,
    report,
  };
}

function offlineNote(caseFile) {
  return `Live research requires an API key. Offline summary: the case file for "${caseFile.title}" was authored from the public record as of the app's knowledge date. For ongoing matters (${caseFile.status}), re-run this endpoint with a key configured to pull current filings and reporting.`;
}
