#!/usr/bin/env bash
# ============================================================================
# CourtSim one-command deployment bootstrap.
#
# Run this ONCE from the repo root on a machine where you are logged in to:
#   - AWS CLI  (aws configure — an admin or IAM-capable identity)
#   - GitHub CLI (gh auth login — with access to this repo)
#
# It creates the scoped deploy IAM user + App Runner ECR role, wires all five
# GitHub Actions secrets, and kicks off the deployment workflow. Every push
# to main after that redeploys automatically.
#
# Model keys: export AWS_BEARER_TOKEN_BEDROCK and GROK_API_KEY first, or the
# script will prompt for them (input hidden).
# ============================================================================
set -euo pipefail

REPO="${COURTSIM_REPO:-mojeh061718-oss/courtsim}"
REGION="${COURTSIM_REGION:-us-east-1}"
DEPLOY_USER="courtsim-deployer"
ECR_ROLE="CourtsimAppRunnerECRAccess"
POLICY_NAME="CourtsimDeploy"
HERE="$(cd "$(dirname "$0")" && pwd)"

command -v aws >/dev/null || { echo "ERROR: aws CLI not found (https://aws.amazon.com/cli/)"; exit 1; }
command -v gh  >/dev/null || { echo "ERROR: gh CLI not found (https://cli.github.com)"; exit 1; }
aws sts get-caller-identity >/dev/null || { echo "ERROR: aws CLI is not authenticated (run: aws configure)"; exit 1; }
gh auth status >/dev/null || { echo "ERROR: gh CLI is not authenticated (run: gh auth login)"; exit 1; }

echo "==> Creating scoped deploy policy + IAM user ($DEPLOY_USER)"
POLICY_ARN=$(aws iam create-policy --policy-name "$POLICY_NAME" \
  --policy-document "file://$HERE/deploy-policy.json" \
  --query 'Policy.Arn' --output text 2>/dev/null \
  || aws iam list-policies --scope Local \
       --query "Policies[?PolicyName=='$POLICY_NAME'].Arn" --output text)
aws iam create-user --user-name "$DEPLOY_USER" 2>/dev/null || true
aws iam attach-user-policy --user-name "$DEPLOY_USER" --policy-arn "$POLICY_ARN"

echo "==> Minting access keys for $DEPLOY_USER"
read -r AKID SECRET <<< "$(aws iam create-access-key --user-name "$DEPLOY_USER" \
  --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)"

echo "==> Creating App Runner ECR access role ($ECR_ROLE)"
aws iam create-role --role-name "$ECR_ROLE" --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  2>/dev/null || true
aws iam attach-role-policy --role-name "$ECR_ROLE" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess
ROLE_ARN=$(aws iam get-role --role-name "$ECR_ROLE" --query 'Role.Arn' --output text)

if [ -z "${AWS_BEARER_TOKEN_BEDROCK:-}" ]; then
  read -r -s -p "Bedrock API key (courtroom inference): " AWS_BEARER_TOKEN_BEDROCK; echo
fi
if [ -z "${GROK_API_KEY:-}" ]; then
  read -r -s -p "SpaceXAI key (web-search research): " GROK_API_KEY; echo
fi

echo "==> Setting the five GitHub Actions secrets on $REPO"
gh secret set AWS_ACCESS_KEY_ID        -R "$REPO" -b "$AKID"
gh secret set AWS_SECRET_ACCESS_KEY    -R "$REPO" -b "$SECRET"
gh secret set APP_RUNNER_ECR_ROLE_ARN  -R "$REPO" -b "$ROLE_ARN"
gh secret set AWS_BEARER_TOKEN_BEDROCK -R "$REPO" -b "$AWS_BEARER_TOKEN_BEDROCK"
gh secret set GROK_API_KEY             -R "$REPO" -b "$GROK_API_KEY"

echo "==> Triggering the deployment workflow"
gh workflow run deploy.yml -R "$REPO" --ref main

cat <<EOF

Done. Watch the deploy:   gh run watch -R $REPO
(First deploy takes ~5-8 minutes: image build + App Runner service creation.
The run's final step prints your HTTPS service URL — open it on your iPhone
and Share -> Add to Home Screen to install the app.)
EOF
