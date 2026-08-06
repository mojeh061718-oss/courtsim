# Deploying CourtSim on AWS

CourtSim is a single stateless Node 20 service (Express, in-memory sessions) that calls
Grok 4.3 outbound over HTTPS. Any AWS compute that can run a container works.

## Choosing a Grok provider

Grok 4.3 is reachable two ways; both are OpenAI-compatible and the app switches with
one env var (`LLM_PROVIDER`):

| | AWS-native: Amazon Bedrock | Native SpaceXAI API |
|---|---|---|
| Endpoint | `https://bedrock-mantle.{region}.api.aws/openai/v1` | `https://api.x.ai/v1` |
| Model ID | `xai.grok-4.3` | `grok-4.3` |
| Key | Bedrock API key (Bedrock console → API keys), env `AWS_BEARER_TOKEN_BEDROCK` | key from console.x.ai, env `GROK_API_KEY` |
| Regions | us-east-1, us-east-2, us-west-2 (+ GovCloud US-West) | n/a (SpaceXAI-hosted) |
| Billing | your AWS bill, IAM-governed | separate SpaceXAI account |
| Live Search (research endpoint) | not available | supported |

**Recommendation when deploying on AWS:** use Bedrock (`LLM_PROVIDER=bedrock`,
`AWS_REGION=us-east-1`) — same-cloud latency, one bill, keys managed in AWS. Keep a
native SpaceXAI key configured only if you want the Live Search case-refresh feature
(`POST /api/research/:caseId`); everything else is identical.

## Option A — AWS App Runner (recommended: simplest)

1. Build and push the image:
   ```bash
   aws ecr create-repository --repository-name courtsim
   docker build -t courtsim .
   docker tag courtsim:latest <acct>.dkr.ecr.<region>.amazonaws.com/courtsim:latest
   aws ecr get-login-password | docker login --username AWS --password-stdin <acct>.dkr.ecr.<region>.amazonaws.com
   docker push <acct>.dkr.ecr.<region>.amazonaws.com/courtsim:latest
   ```
2. Store the key: `aws secretsmanager create-secret --name courtsim/grok-api-key --secret-string '<key>'`
   (a Bedrock API key, or a SpaceXAI key if using the native provider).
3. Create the App Runner service from the ECR image, port **3000**, and set env vars:
   - Bedrock: `LLM_PROVIDER=bedrock`, `AWS_REGION=us-east-1`, and
     `AWS_BEARER_TOKEN_BEDROCK` referenced from Secrets Manager.
   - Native: `LLM_PROVIDER=xai` and `GROK_API_KEY` referenced from Secrets Manager.
4. Done — App Runner gives you TLS and autoscaling out of the box.

## Option B — ECS on Fargate

- Task definition: the same image, 0.5 vCPU / 1 GB is plenty; container port 3000.
- Inject the key (`AWS_BEARER_TOKEN_BEDROCK` or `GROK_API_KEY`) via `secrets`
  (Secrets Manager ARN) in the task definition, plus `LLM_PROVIDER`/`AWS_REGION`.
- Front with an Application Load Balancer (health check path: `/api/health`).
- **Sticky sessions**: trial state is in-memory, so if you scale beyond one task, enable
  ALB sticky sessions (or pin to one task) so a trial keeps hitting the same container.

## Option C — Elastic Beanstalk (no Docker)

```bash
eb init courtsim --platform node.js-20 && eb create courtsim-env
eb setenv LLM_PROVIDER=bedrock AWS_REGION=us-east-1 AWS_BEARER_TOKEN_BEDROCK=<key>
# or: eb setenv LLM_PROVIDER=xai GROK_API_KEY=<key>
```

## PWA requirement: HTTPS

CourtSim ships as an installable PWA (manifest + service worker). Service workers and
Add-to-Home-Screen require a **secure origin**, so serve the app over HTTPS in
production — App Runner and ALB-fronted ECS give you TLS termination out of the box
(`localhost` is exempt during development). After deploying a new build, bump the
`CACHE` version in `client/sw.js` so installed clients pick up the fresh shell.

## Notes

- **Health check**: `GET /api/health` returns `{ok, liveModel, sessions}`.
- **Voice** is synthesized in the user's browser (Web Speech API) — no AWS Polly needed,
  nothing extra to deploy. If you later want server-side TTS, Polly's neural voices can
  be dropped in where the client consumes `event.text`.
- **Costs**: each user action is 1–3 Grok calls; a deliberation round is `JURY_SIZE`
  calls. Tune `JURY_SIZE`, `MAX_AI_WITNESSES`, `MAX_AI_QUESTIONS`, `MAX_DELIB_ROUNDS`
  in the environment to control spend.
- **Timeouts**: keep the LB idle timeout ≥ 120 s (deliberation rounds are the slowest call).
