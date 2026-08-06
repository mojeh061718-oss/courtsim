# Deploying CourtSim on AWS

CourtSim is a single stateless Node 20 service (Express, in-memory sessions) that calls
the Grok (xAI) API outbound over HTTPS. Any AWS compute that can run a container works.

## Option A — AWS App Runner (recommended: simplest)

1. Build and push the image:
   ```bash
   aws ecr create-repository --repository-name courtsim
   docker build -t courtsim .
   docker tag courtsim:latest <acct>.dkr.ecr.<region>.amazonaws.com/courtsim:latest
   aws ecr get-login-password | docker login --username AWS --password-stdin <acct>.dkr.ecr.<region>.amazonaws.com
   docker push <acct>.dkr.ecr.<region>.amazonaws.com/courtsim:latest
   ```
2. Store the key: `aws secretsmanager create-secret --name courtsim/grok-api-key --secret-string 'xai-…'`
3. Create the App Runner service from the ECR image, port **3000**, and set env vars
   `GROK_MODEL=grok-4` plus `GROK_API_KEY` referenced from Secrets Manager (App Runner
   supports secrets as env sources via the service role).
4. Done — App Runner gives you TLS and autoscaling out of the box.

## Option B — ECS on Fargate

- Task definition: the same image, 0.5 vCPU / 1 GB is plenty; container port 3000.
- Inject `GROK_API_KEY` via `secrets` (Secrets Manager ARN) in the task definition.
- Front with an Application Load Balancer (health check path: `/api/health`).
- **Sticky sessions**: trial state is in-memory, so if you scale beyond one task, enable
  ALB sticky sessions (or pin to one task) so a trial keeps hitting the same container.

## Option C — Elastic Beanstalk (no Docker)

```bash
eb init courtsim --platform node.js-20 && eb create courtsim-env
eb setenv GROK_API_KEY=xai-… GROK_MODEL=grok-4
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
