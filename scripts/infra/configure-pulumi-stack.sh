#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}/infra/pulumi"

if [[ -z "${PULUMI_ORG:-}" ]]; then
  echo "PULUMI_ORG is required" >&2
  exit 1
fi

if [[ -z "${PULUMI_STACK:-}" ]]; then
  echo "PULUMI_STACK is required" >&2
  exit 1
fi

PULUMI_PROJECT="${PULUMI_PROJECT:-omnichat}"

if [[ -z "${ROOT_DOMAIN:-}" ]]; then
  echo "ROOT_DOMAIN is required" >&2
  exit 1
fi

if [[ -z "${REPO_SLUG:-}" ]]; then
  echo "REPO_SLUG is required" >&2
  exit 1
fi

STACK_FQDN="${PULUMI_ORG}/${PULUMI_PROJECT}/${PULUMI_STACK}"

pulumi stack select "${STACK_FQDN}" >/dev/null 2>&1 || pulumi stack init "${STACK_FQDN}"

set_config() {
  local key="$1"
  local value="${2:-}"
  if [[ -n "${value}" ]]; then
    pulumi config set "${key}" "${value}" --stack "${STACK_FQDN}"
  fi
}

set_secret() {
  local key="$1"
  local value="${2:-}"
  if [[ -n "${value}" ]]; then
    pulumi config set --secret "${key}" "${value}" --stack "${STACK_FQDN}"
  fi
}

# Tag deployment artifacts with the source commit SHA so Sentry events and
# the sourcemaps that ci.yml uploads via release.sh end up on the same Sentry
# release (sourcemap resolution matches by release name). Falls back to stack
# name only for local invocations outside CI.
set_config release "${RELEASE_ID:-${GITHUB_SHA:-}}"

set_config rootDomain "${ROOT_DOMAIN}"
set_config githubRepo "${REPO_SLUG}"
set_config githubBranch "${REPO_BRANCH:-main}"
set_config appSubdomain "${APP_SUBDOMAIN:-app}"
set_config apiSubdomain "${API_SUBDOMAIN:-api}"
set_config vercelProjectName "${VERCEL_PROJECT_NAME:-omnichat-web}"
set_config doProjectName "${DO_PROJECT_NAME:-omnichat-prod}"
set_config region "${REGION:-fra1}"
set_config postgresSize "${POSTGRES_SIZE:-db-s-1vcpu-2gb}"
set_config redisSize "${REDIS_SIZE:-db-s-1vcpu-1gb}"
set_config postgresVersion "${POSTGRES_VERSION:-16}"
set_config redisVersion "${REDIS_VERSION:-8}"
set_config spacesBucketName "${SPACES_BUCKET_NAME:-}"
set_config spacesRegion "${SPACES_REGION:-}"
set_config emailFrom "${EMAIL_FROM:-}"
set_config emailReplyTo "${EMAIL_REPLY_TO:-}"
set_config sentryEnvironment "${SENTRY_ENVIRONMENT:-production}"
set_config sentryTracesSampleRate "${SENTRY_TRACES_SAMPLE_RATE:-0.05}"
set_config sentryUrl "${SENTRY_URL:-https://sentry.io/}"
set_config vercelTeamId "${VERCEL_TEAM_ID:-}"
set_config vercelProjectId "${VERCEL_PROJECT_ID:-}"
set_config sentryOrg "${SENTRY_ORG:-}"
set_config sentryProjectWeb "${SENTRY_PROJECT_WEB:-}"
set_config grafanaCreateCloudStack "${GRAFANA_CREATE_CLOUD_STACK:-false}"
set_config grafanaCloudRegion "${GRAFANA_CLOUD_REGION:-}"
set_config grafanaStackSlug "${GRAFANA_STACK_SLUG:-}"
set_config grafanaStackName "${GRAFANA_STACK_NAME:-}"
set_config channelSyncRozetkaEnabled "${CHANNEL_SYNC_ROZETKA_ENABLED:-false}"
set_config channelSyncRozetkaOrdersEnabled "${CHANNEL_SYNC_ROZETKA_ORDERS_ENABLED:-false}"

if [[ -n "${CLOUDFLARE_ZONE_ID:-}" ]]; then
  set_config cloudflareZoneId "${CLOUDFLARE_ZONE_ID}"
elif [[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  set_config cloudflareAccountId "${CLOUDFLARE_ACCOUNT_ID}"
else
  echo "Either CLOUDFLARE_ZONE_ID or CLOUDFLARE_ACCOUNT_ID is required" >&2
  exit 1
fi

set_secret apiJwtAccessSecret "${API_JWT_ACCESS_SECRET:-}"
set_secret apiJwtRefreshSecret "${API_JWT_REFRESH_SECRET:-}"
set_secret apiAuthOtpPepper "${API_AUTH_OTP_PEPPER:-}"

# Infisical envelope encryption — opt-in. When INFISICAL_DEPLOY_CLIENT_ID is
# absent, the Pulumi stack skips the whole Infisical block and api/workers
# boot in degraded mode (no INFISICAL_* env vars set on DO). The app
# validator then refuses to boot if OLX is configured, which is the
# intentional gate.
set_config infisicalDeployClientId "${INFISICAL_DEPLOY_CLIENT_ID:-}"
set_secret infisicalDeployClientSecret "${INFISICAL_DEPLOY_CLIENT_SECRET:-}"
set_config infisicalKmsProjectId "${INFISICAL_KMS_PROJECT_ID:-}"
set_config infisicalProjectId "${INFISICAL_PROJECT_ID:-}"
set_secret spacesAccessKeyId "${SPACES_ACCESS_KEY_ID:-}"
set_secret spacesSecretAccessKey "${SPACES_SECRET_ACCESS_KEY:-}"
set_secret apiMetricsToken "${API_METRICS_TOKEN:-}"
set_secret workersMetricsToken "${WORKERS_METRICS_TOKEN:-}"
set_secret resendApiKey "${RESEND_API_KEY:-}"
set_secret olxClientId "${OLX_CLIENT_ID:-}"
set_secret olxClientSecret "${OLX_CLIENT_SECRET:-}"
set_secret sentryApiDsn "${SENTRY_API_DSN:-}"
set_secret sentryWorkersDsn "${SENTRY_WORKERS_DSN:-}"
set_secret sentryWebDsn "${SENTRY_WEB_DSN:-}"
set_secret sentryAuthToken "${SENTRY_AUTH_TOKEN:-}"
set_secret grafanaCloudAccessPolicyToken "${GRAFANA_CLOUD_ACCESS_POLICY_TOKEN:-}"
set_secret grafanaOtlpAuth "${GRAFANA_OTLP_AUTH:-${GRAFANA_CLOUD_ACCESS_POLICY_TOKEN:-}}"
set_config grafanaOtlpEndpoint "${GRAFANA_OTLP_ENDPOINT:-https://otlp-gateway-prod-eu-west-2.grafana.net/otlp}"
set_secret otelCollectorInboundToken "${OTEL_COLLECTOR_INBOUND_TOKEN:-}"
set_secret grafanaLokiHost "${GRAFANA_LOKI_HOST:-}"
set_secret grafanaLokiUsername "${GRAFANA_LOKI_USERNAME:-}"
set_secret grafanaLokiPassword "${GRAFANA_LOKI_PASSWORD:-}"
set_secret grafanaPrometheusRemoteWriteUrl "${GRAFANA_PROMETHEUS_REMOTE_WRITE_URL:-}"
set_secret grafanaPrometheusUsername "${GRAFANA_PROMETHEUS_USERNAME:-}"
set_secret grafanaPrometheusPassword "${GRAFANA_PROMETHEUS_PASSWORD:-}"

echo "Configured Pulumi stack ${STACK_FQDN}"
