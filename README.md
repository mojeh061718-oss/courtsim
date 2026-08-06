# CourtSim — Attorney Trial Simulator

Practice arguing real cases **end-to-end** against an AI opposing counsel powered by the
**Grok (xAI) API**, in front of an AI judge who holds you to the rules of evidence, and a
**blind, deliberating AI jury** that decides only on the record you build.

## What it does

- **Pick a case, pick a side.** Four real cases ship as structured case files (facts,
  charges with elements, witness rosters ≤ 20, top-20 evidence lists, pretrial motions,
  original 12-juror pools):
  - *State of Ohio v. Mackenzie Shirilla* — the Strongsville 100-mph wall crash
  - *State of Florida v. Casey Anthony*
  - *Commonwealth of Massachusetts v. Lindsay Clancy* (ongoing — refreshable via live research)
  - *People v. O.J. Simpson*
- **Full trial arc.** Exclusionary pretrial motions → opening statements → prosecution and
  defense cases-in-chief (direct & cross of witnesses/experts) → closing arguments → jury
  instructions → deliberation → verdict.
- **Objections both ways, any time.** Press **O** at any moment (it stops the voice
  mid-word), pick your basis from a real FRE-style catalog, and argue it; the judge rules.
  Your typed submissions are reviewed by opposing counsel **before they reach the jurors'
  ears** — the AI can object first, you respond, the court rules, and blocked material is
  never seen by the jury.
- **Accountability at every angle.** Sua sponte judicial interventions, admonishments,
  stricken material, and an objection ledger — capped by a candid post-trial performance
  review and grade from the bench.
- **A true jury.** Twelve original juror profiles who never interact until deliberation,
  see only admitted/unstricken material (with real-world names alias-blinded by default),
  are instructed they know nothing of the real case, and then genuinely deliberate in
  rounds — speaking, disagreeing, voting — until they return a unanimous verdict or hang.
- **Natural voice.** Every AI actor speaks via the browser's speech engine at courtroom
  pace, with distinct voices per role. Interrupt at any point with **Space** or **O**.

## Run it

```bash
npm install
cp .env.example .env       # add your GROK_API_KEY (from console.x.ai)
npm start                  # http://localhost:3000
```

No API key? It runs in **offline demo mode** — deterministic mock agents so the whole
flow (motions, objections, examinations, deliberation, verdict) is playable for free.

```bash
npm run smoke              # scripted end-to-end trial against the API
```

## Architecture

```
server/
  index.js               Express entry — API + static client
  llm/grokClient.js      xAI Grok client (OpenAI-compatible), retries, JSON mode,
                         Live Search support, per-call offline fallbacks
  agents/prompts.js      How Grok is instructed to argue, judge, testify, deliberate
  engine/trialEngine.js  Trial state machine (pretrial → … → verdict)
  engine/objections.js   FRE-style objection catalog (shared by user, AI, judge)
  engine/jury.js         12 isolated juror agents + deliberation rounds & tallies
  cases/*.js             Structured case files for the four cases
  research/publicData.js Live-search fact refresh (POST /api/research/:caseId)
client/                  Vanilla SPA — courtroom UI, objection hotkey, speech engine
```

### Key API endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/cases`, `GET /api/cases/:id` | case catalog and detail |
| `POST /api/trial` `{caseId, side}` | start a trial |
| `POST /api/trial/:id/action` | everything in-trial: `proceed`, `file_motion`, `respond`, `statement`, `call_witness`, `ask`, `objection`, `pass_witness`, `rest_case`, `deliberate_round` |
| `POST /api/research/:caseId` | Grok Live Search fact-check/refresh of a case file |

### How jury blindness works

Jurors are separate agents that never see the pretrial phase, stricken material, or each
other before deliberation. Their prompts hard-instruct them to disregard any outside
knowledge and treat the trial record as the only universe of facts, and by default
(`JUROR_ALIASING=1`) the juror-facing record swaps real-world names for neutral aliases,
so pattern-matching famous cases is suppressed. The deliberation is genuinely emergent:
each juror speaks in seat order, hears the room, and votes privately each round; verdicts
require unanimity per count, with an Allen-style charge before a hung count is accepted.

## Deploying on AWS

See **[docs/DEPLOY_AWS.md](docs/DEPLOY_AWS.md)** — App Runner (recommended), ECS/Fargate,
and Elastic Beanstalk paths, with the Grok key in AWS Secrets Manager.

## Disclaimers

Educational simulation for advocacy training. Case files are dramatizations condensed
from public records and reporting; peripheral names marked *(composite)* are fictional.
The real Shirilla case was a bench trial (simulated here to a jury); the Clancy matter is
ongoing and ships with a research hook rather than any presumed outcome. Nothing here is
legal advice, and simulated verdicts say nothing about the real ones.
