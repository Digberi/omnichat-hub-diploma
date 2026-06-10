# Runbook

## Common commands

- Install: `pnpm i`
- Infra up/down: `pnpm infra:up` / `pnpm infra:down`
- Prod stack up/down: `pnpm infra:prod:up` / `pnpm infra:prod:down`
- Monitoring stack up/down: `pnpm infra:monitoring:up` / `pnpm infra:monitoring:down`
- DB migrate/seed:
  - `pnpm --filter @omnichat/db prisma:migrate`
  - `pnpm --filter @omnichat/db prisma:seed`
- Start API/workers/web:
  - `pnpm dev:api`
  - `pnpm dev:workers`
  - `pnpm dev:web`
  - `pnpm dev:mobile`

## Health

- `GET /health` should return `{ status: "ok" }`
- `GET /ready` should check DB + Redis and return `{ status: "ok" }` (or 503)
- Workers also expose:
  - `GET http://localhost:4122/health`
  - `GET http://localhost:4122/ready`

## Outbox debugging

Symptoms:

- no realtime updates
- pushes not sent

Checklist:

1. Confirm `apps/workers` is running.
2. Check Outbox rows in DB:
   - status `PENDING` / `PROCESSING` / `FAILED`
3. Verify Redis connectivity (API adapter + workers emitter).
4. Verify Redis namespacing matches between API and workers (same environment):
   - BullMQ uses `BULLMQ_PREFIX` (defaults to `omnichat:<NODE_ENV>`)
   - Socket.IO uses `SOCKETIO_REDIS_KEY` (defaults to `socket.io:<NODE_ENV>`)

## OpenAPI / generated client

Generate:

- `pnpm api-client:generate`

If web/mobile type errors show stale schema, rebuild the client:

- `pnpm --filter @omnichat/api-client build`

## E2E tests

See `tests/e2e/README.md`.

## Sentry releases + sourcemaps

Runtime is env-gated: if DSN is blank, Sentry is disabled.

Recommended env vars (production):
- `SENTRY_DSN` (api/workers/web server + edge)
- `NEXT_PUBLIC_SENTRY_DSN` (web client)
- `EXPO_PUBLIC_SENTRY_DSN` (mobile)
- `SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE` / `EXPO_PUBLIC_SENTRY_RELEASE`
- `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `EXPO_PUBLIC_SENTRY_ENVIRONMENT`

Sampling policy (suggested starting point):
- API/Workers server traces: `SENTRY_TRACES_SAMPLE_RATE=0.05` (or `0` in dev)
- Web client traces: `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05`
- Web server/edge traces: `SENTRY_TRACES_SAMPLE_RATE=0.05`
- Mobile traces: `EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05`

Sourcemap upload (optional; requires Sentry auth):
- Set: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_RELEASE`
- Build first: `pnpm build`
- Upload Node sourcemaps:
  - API: `pnpm sentry:upload:api`
  - Workers: `pnpm sentry:upload:workers`
- Web sourcemaps:
  - When `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` are set, `apps/web` will upload sourcemaps automatically on `next build`.

CI automation (optional):
- GitHub Actions derives `SENTRY_RELEASE` for each run and exports it as:
  - `SENTRY_RELEASE`
  - `NEXT_PUBLIC_SENTRY_RELEASE`
  - `EXPO_PUBLIC_SENTRY_RELEASE`
- Sourcemap upload is disabled for `pull_request` events (no secrets, no uploads from PRs).
- To enable uploads on `main` pushes, configure:
  - GitHub *Repository Variables*:
    - `SENTRY_ORG`
    - `SENTRY_PROJECT_WEB` (used by Next.js build)
    - `SENTRY_PROJECT_API`
    - `SENTRY_PROJECT_WORKERS`
    - `SENTRY_URL` (optional; for self-hosted Sentry)
  - GitHub *Repository Secret*:
    - `SENTRY_AUTH_TOKEN`

CI behavior:
- In GitHub Actions, release is auto-derived:
  - main: `${GITHUB_SHA}`
  - feature branches: `${GITHUB_REF_NAME}-${GITHUB_SHA}`
- `SENTRY_RELEASE` is passed consistently into `NEXT_PUBLIC_SENTRY_RELEASE` and
  `EXPO_PUBLIC_SENTRY_RELEASE`.
- Sentry upload step is skipped on pull_request and when required secrets are missing.

## Sentry operational monitoring (workers/outbox)

What is automated in code now:
- Workers pollers/processors are instrumented with Sentry spans (`queue.poll` / `queue.process`).
- Worker exceptions are captured with module/action tags:
  - `workers.module` (`outbox`, `maintenance`, `metrics`, `channel_sync`)
  - `workers.action` (tick/process action)
- Outbox backlog warning signal:
  - if poller finds too many ready events, workers emit a warning event to Sentry.
  - tune with:
    - `SENTRY_OUTBOX_BACKLOG_WARN` (default `200`)
    - `SENTRY_OUTBOX_BACKLOG_COOLDOWN_SEC` (default `300`)

What is NOT fully automatable from repository code alone:
- Creating Sentry alert rules/notification routing in your Sentry org/project.
- Assigning on-call receivers (Slack/PagerDuty/email) and escalation policy.

Required manual setup in Sentry UI:
1. Create issue alert for `workers.module:outbox` + `workers.action:process_event` (threshold by count/time).
2. Create issue alert for message `Outbox backlog is high`.
3. Create issue alerts for `workers.module` in (`maintenance`, `metrics`, `channel_sync`).
4. Connect notification channels (Slack/PagerDuty/email) and verify delivery.

Recommended production thresholds (starting point):
- Outbox backlog warning at `>=200`, critical at `>=1000` (via alert condition grouping).
- Any repeated `outbox processing failed` exceptions over 5m => page on-call.
- Any maintenance/metrics processor failure over 15m => warning alert.

## Storage hardening and monitoring

- API object storage health/metrics:
  - `GET /v1/metrics/storage` for operation counters, avg durations, ping time.
  - `GET /v1/metrics/storage/health` for alert-oriented status.
- Bucket init + lifecycle:
  - Local dev: `infra/compose/docker-compose.yml` creates bucket and applies a lifecycle rule for `attachments/`.
  - API can also apply/ensure this rule at startup (best-effort): `STORAGE_APPLY_LIFECYCLE=1` (set to `0` if lifecycle is managed by infra/IaC).
- Configurable thresholds (in `apps/api/.env`):
  - `STORAGE_ALERT_PING_MAX_AGE_MS`
  - `STORAGE_ALERT_FAILURE_RATE_WARN_PCT`
  - `STORAGE_ALERT_FAILURE_RATE_CRITICAL_PCT`
  - `STORAGE_ALERT_AVG_DURATION_WARN_MS`
  - `STORAGE_ALERT_AVG_DURATION_CRITICAL_MS`
- Suggested checks:
  - monitor `/health` every 10s
  - monitor `/v1/metrics/storage/health` every 60s and alert on `degraded`/`critical`.

## Production deployment baseline

- Production compose file: `infra/compose/docker-compose.prod.yml`
- Production env template: `infra/compose/.env.prod.example`
- Deployment guide: `docs/architecture/DEPLOYMENT.md`
- Full env matrix: `docs/architecture/PROD_ENV_MATRIX.md`

## Monitoring/alerting baseline

- Monitoring compose file: `infra/compose/docker-compose.monitoring.yml`
- Prometheus/alerts config: `infra/monitoring/prometheus/*`
- Alertmanager config: `infra/monitoring/alertmanager/alertmanager.yml`
- Grafana provisioning: `infra/monitoring/grafana/*`
- Detailed guide: `docs/architecture/MONITORING.md`

## Common local dev gotchas

### pnpm ignored build scripts

pnpm may block build scripts for some native deps (e.g. `esbuild`) until approved.

This repo commits a build allowlist in `package.json#pnpm.onlyBuiltDependencies` so CI and clean clones should not prompt.

If you add a new dependency that requires build scripts and installs start warning again:
- add it to `package.json#pnpm.onlyBuiltDependencies`
- re-run `pnpm i`

If Vite/Next fail to start with esbuild errors on a fresh machine, run the approve step.
