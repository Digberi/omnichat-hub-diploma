# Migration Log

This file tracks major refactor steps while migrating the repository into a production-ready monorepo.

## 2026-02-22

- Added hosted deployment migration phase to `infra/pulumi`:
  - `DigitalOcean App Platform` spec now includes a mandatory `PRE_DEPLOY` job `db-migrate`
  - the job reuses the `apps/api` Docker image and runs `pnpm --filter @omnichat/db prisma:migrate:deploy`
  - this closes the gap where hosted deploys could ship app code before Prisma migrations were applied
- Hardened deployment control plane and release operations:
  - Vercel custom-domain DNS is now derived from `vercel.getDomainConfigOutput(...)` instead of a hardcoded generic CNAME
  - critical hosted resources are protected with Pulumi `protect: true`
  - added production GitHub Actions workflows for preview, deploy, drift detection, and IaC security scanning
  - added `docs/architecture/RELEASE_RUNBOOK.md` covering release, rollback, verification, migrations, security gates, and drift handling

- Implemented first non-stub OLX adapter baseline in workers:
  - `channelSync` poller now supports both `stubTick` and `olxTick` modes.
  - `ChannelSyncProcessor` now pulls OLX messages for OAuth-linked channel accounts (`channel=OLX`, `authType=OAUTH`).
  - Added decryption path for `authDataEncrypted` (AES-256-GCM format `v1:iv:tag:ciphertext`) using `AUTH_DATA_ENCRYPTION_KEY`.
  - Added idempotent incoming message persistence from OLX responses:
    - creates/updates conversation
    - applies domain incoming effects (`needsReply`, auto-unarchive, unpin-on-unarchive)
    - creates outbox events (`message.new`, `conversation.updated`) and enqueues `outbox.process`.
  - Added sync failure signaling:
    - stores `channelAccount.lastError`
    - emits outbox `sync.error` for realtime/notifications pipelines.
  - Added workers env/config keys for OLX sync tuning:
    - `CHANNEL_SYNC_OLX_ENABLED`
    - `CHANNEL_SYNC_OLX_MAX_ACCOUNTS`
    - `CHANNEL_SYNC_OLX_LIMIT`
    - `OLX_BASE_URL`
    - `OLX_MESSAGES_ENDPOINT`
    - `OLX_REQUEST_TIMEOUT_MS`
    - `AUTH_DATA_ENCRYPTION_KEY`
- Completed OLX outgoing text baseline in API:
  - `messages.sendText` now uses `SENDING -> SENT/FAILED` lifecycle with provider dispatch for `channel=OLX`.
  - Added OLX token refresh on 401/403 using refresh token + encrypted auth blob update in `ChannelAccount.authDataEncrypted`.
  - Added retry endpoint: `POST /v1/messages/:messageId/retry` (for failed outgoing).
  - Preserved product rule: `needsReply` flips to `false` only after successful seller reply delivery path.
  - Added explicit OLX attachment behavior: currently marked `FAILED` with `OLX_ATTACHMENT_NOT_SUPPORTED` (until provider attachment API integration).

## 2026-02-13

- Created monorepo scaffolding:
  - `pnpm-workspace.yaml`
  - `turbo.json`
  - root `package.json` scripts
  - `.nvmrc` pinned to Node 20
  - shared strict TypeScript base `tsconfig.base.json`
  - baseline GitHub Actions CI workflow at `.github/workflows/ci.yml`
- Added shared package skeletons:
  - `packages/config`
  - `packages/ui-tokens`
  - `packages/contracts`
  - `packages/domain`
  - `packages/db`
  - `packages/api-client`
- Fixed a product rule violation in the prototype store:
  - `needsReply` is no longer cleared by “mark as read”.
  - `needsReply` flips to false only after a simulated successful outgoing send (seller reply), via `@omnichat/domain`.
- Implemented initial `apps/api` NestJS foundation:
  - strict `ValidationPipe` defaults (whitelist/transform/forbidNonWhitelisted)
  - Swagger/OpenAPI at `/docs`
  - URI versioning enabled (`/v1/...`)
  - pino logging (`nestjs-pino`) with `x-request-id` generation
  - `/health` and `/ready` endpoints with DB+Redis readiness checks
  - Sentry init (env gated)
  - Socket.IO gateway + Redis adapter baseline for horizontal scaling
- Added initial authenticated REST endpoints (seeded data):
  - `GET /v1/conversations` with folder filters + cursor pagination + pinned block for ALL
  - `GET /v1/conversations/:conversationId/messages` with cursor pagination
  - `POST /v1/conversations/:conversationId/messages` with client idempotency key
  - Outbox event rows are created in the same DB transaction and enqueued to `outbox.process`
- Implemented initial `apps/workers` NestJS foundation:
  - validated env (zod)
  - pino logging (`nestjs-pino`)
  - Prisma + Redis connectivity baseline
  - application-context bootstrap (separate process from API)
  - Outbox polling + BullMQ queue + processor skeleton
  - Redis Socket.IO emitter baseline (workers -> redis -> api sockets)
- Added local infra compose at `infra/compose/docker-compose.yml`:
  - Postgres + Redis (+ MinIO placeholder)

## 2026-02-14

- Updated runtime baseline to Node 22:
  - `.nvmrc` now pins Node 22
  - root `package.json#engines.node` is `22`
- Stabilized install + deps:
  - fixed `@socket.io/redis-emitter` version mismatch so `pnpm install` succeeds
- Made local dev + e2e runs deterministic:
  - `packages/db/prisma/seed.ts` now wipes seeded workspace data and re-seeds to a known baseline
  - `tests/e2e/vitest.config.ts` now runs e2e serially (`fileParallelism: false`) to avoid shared-DB races
- Expanded REST surface (classic NestJS) and added more e2e coverage under `tests/e2e`:
  - added workspace membership enforcement for HTTP and websocket connections
  - implemented REST modules: tags, statuses, workspaces, settings, channel accounts, notifications, templates
  - implemented search endpoint `GET /v1/search` with recent-window default + `showOlder` flag
  - added a follow-up Prisma migration for search indexes + `pg_trgm` extension
- Implemented attachment short links + landing behavior:
  - added S3-compatible storage service (MinIO defaults) + upload path for attachment messages
  - `POST /v1/attachments/:attachmentId/short-link`
  - `GET /v1/s/:token` redirects to a presigned URL when valid; returns UA message when expired/unknown
- Hardened workers (Task 10 baseline):
  - Outbox reliability: process stale `PROCESSING` rows and track per-delivery completion (`wsDeliveredAt`, `pushDeliveredAt`)
  - Added push notification delivery service (providers: `console` | `expo`, preference + snooze suppression)
  - Added maintenance queue: cleanup expired short links
  - Added metrics queue: daily rollup into `WorkspaceDailyRollup`
- OpenAPI client generation (start of Task 11):
  - added `apps/api/src/scripts/export-openapi.ts` and generated `apps/api/openapi.json`
  - implemented `packages/api-client` generation via `openapi-typescript` + runtime client via `openapi-fetch`
  - expanded CI to run lint/typecheck/test/build and enforce OpenAPI drift gate
  - fixed graceful shutdown robustness for Redis clients (best-effort quit)

- Scaffolded `apps/mobile` (Expo + React Navigation) and wired it to the REST API:
  - added workspace OpenAPI client usage (`@omnichat/api-client`)
  - added Socket.IO client wired to `/ws` for realtime updates
  - added basic screens: Login (OTP), Inbox, Chat
  - added SecureStore-backed token persistence
  - added monorepo Metro config (`apps/mobile/metro.config.cjs`)
  - added `pnpm dev:mobile` root script

- Added Sentry baseline to clients:
  - `apps/web`: `@sentry/nextjs` config files + global error capture
  - `apps/mobile`: `@sentry/react-native` init + Expo config plugin entry

- Improved contract + client baseline:
  - added Swagger response DTOs for `settings` and `templates` modules so OpenAPI types are generated correctly
  - added `/settings` and `/templates` pages in `apps/web` consuming the generated client
  - added `Templates` and `Settings` screens in `apps/mobile`
  - implemented access token refresh + retry logic in `packages/api-client` (configurable via `getRefreshToken` + `setTokens`)
  - added unit tests for the refresh+retry behavior (`packages/api-client/test/refresh.test.ts`)

- Web inbox + realtime hardening:
  - added folder tabs (All/Unread/OLX/Prom/Snoozed/Archived) to `apps/web` inbox page
  - inbox now refetches conversation list on `conversation.updated` realtime events (debounced)
  - expanded E2E websocket coverage to assert `conversation.updated` delivery via workers (`tests/e2e/src/ws.e2e.test.ts`)

- Search contract + web UI:
  - added explicit Swagger response DTOs for `GET /v1/search` so the generated OpenAPI client has correct types
  - added `apps/web/src/app/search/page.tsx` using the generated client (recent window default + "Show older")

- Monorepo TS hygiene (React types):
  - pinned root `@types/react` + `@types/react-dom` to v19 so React Native types resolve consistently in the pnpm store layout
  - updated `apps/mobile` to use `@types/react@^19` (fixes TS2786 JSX-component errors in monorepo typecheck)

- Web search jump-to-message:
  - added `GET /v1/conversations/:conversationId/messages/around/:messageId` to support jump-to-message
  - `apps/web` search message results now link to `/chat/:id?messageId=...` and chat scrolls/highlights the anchor message
  - added API-level e2e coverage for the around endpoint (`tests/e2e/src/messages-around.e2e.test.ts`)

- Realtime + delivery updates:
  - added `PATCH /v1/messages/:messageId` to update delivery status and produce outbox `message.updated`
  - `apps/web` + `apps/mobile` apply `message.updated` patches via Socket.IO
  - expanded websocket e2e coverage to assert `message.updated` delivery (`tests/e2e/src/ws.e2e.test.ts`)

- Attachments UI parity:
  - `apps/web` chat input supports file upload and renders attachment bubbles/cards with short-link open
  - `apps/mobile` supports picking/uploading attachments and opening them via short-links
  - conversations list preview shows attachment-based last message text when message text is empty

- Workers: channel sync stub + auto-archive maintenance:
  - added optional stub channel sync module (generates incoming messages for enabled accounts)
  - added maintenance auto-archive job (hourly), creating `conversation.updated` outbox events
  - added unit tests for both the channel sync stub and maintenance processor

- Product rule enforcement in clients (Unread == needsReply):
  - opening a chat no longer clears “unread”
  - `unreadCount` is treated as derived from `needsReply` (1/0) in web and mobile

- Dev auth ergonomics:
  - allow `AUTH_OTP_FIXED_CODE` in non-production for faster local dev/e2e (still forbidden in production)

## 2026-02-17

- Mobile build/runtime fixes (Expo SDK 54 + NativeWind v4):
  - fixed Babel config: `nativewind/babel` is a preset (must be in `presets`, not `plugins`) (`apps/mobile/babel.config.js`)
  - fixed Metro resolution for pnpm virtual store by enabling hierarchical lookup (`apps/mobile/metro.config.cjs`)
  - aligned reanimated/worklets versions for Expo Go compatibility and stabilized dev-client builds (`apps/mobile/package.json`)
  - skipped `expo-notifications` imports in Expo Go to avoid noisy SDK 53+ remote-push errors (`apps/mobile/src/lib/push.ts`)
  - made Settings screen scrollable (`apps/mobile/src/screens/SettingsScreen.tsx`)

- Sentry “real integration” hardening:
  - created/verified Sentry projects: `omnichat-api`, `omnichat-workers`, `omnichat-web`, `omnichat-mobile` (org: `omnichat-ei`)
  - configured GitHub Actions vars/secrets for release automation + sourcemap upload (`SENTRY_ORG`, `SENTRY_URL`, `SENTRY_PROJECT_*`, `SENTRY_AUTH_TOKEN`)
  - hardened CI sourcemap upload scripts to pass `--project` for newer `sentry-cli` behavior and org-scoped CI tokens (`scripts/sentry/release.sh`, `scripts/sentry/upload-node-sourcemaps.sh`)
  - validated ingestion via `sentry-cli send-event` with tag search (`smoke.marker:*`) across all projects

## 2026-02-18

- Closed core P0 deployment/observability gaps:
  - added production runtime compose baseline: `infra/compose/docker-compose.prod.yml`
  - added production env template: `infra/compose/.env.prod.example`
  - added deployment and env matrix docs:
    - `docs/architecture/DEPLOYMENT.md`
    - `docs/architecture/PROD_ENV_MATRIX.md`
- Added external monitoring stack:
  - `infra/compose/docker-compose.monitoring.yml`
  - Prometheus config + alert rules + blackbox probes under `infra/monitoring/prometheus/*`
  - Alertmanager baseline config at `infra/monitoring/alertmanager/alertmanager.yml`
  - Grafana provisioning + baseline dashboard under `infra/monitoring/grafana/*`
- Workers observability/runtime improvements:
  - workers now expose `/health` and `/ready` on configurable port (`WORKERS_PORT`, default `4122`)
  - added workers Redis `ping()` for readiness checks
- Mobile push verification UX hardening:
  - push registration flow now returns token + `projectId` + server registration time
  - settings screen now displays push verification signals needed for real-device E2E validation

## 2026-02-15

- Made seed + e2e flows more deterministic and CI-friendly:
  - seeded data now includes known search keywords for E2E (`Incoming`, `Buyer`) so search tests are stable
  - `packages/db/prisma/seed.ts` now auto-loads `DATABASE_URL` (and other vars) from local env files when missing (tries `packages/db/.env`, repo `.env`, `apps/api/.env`, `apps/workers/.env`)
- CI now runs black-box E2E smoke tests against real local infra:
  - starts Postgres + Redis + MinIO via `pnpm infra:up`
  - runs Prisma migrations + seed
  - starts built `apps/api` + `apps/workers` and runs `pnpm test:e2e` (including websocket tests via `E2E_REQUIRE_WORKERS=1`)
- Web UX polish:
  - fixed Radix accessibility warning for mobile Sheets by ensuring `SheetContent` has an accessible `SheetTitle` where missing
- Push hardening (workers):
  - Expo push delivery now batches requests (max 100 notifications per call)
  - automatically disables `DeviceNotRegistered` tokens in DB (prevents repeated failures)
  - added unit tests for Expo push error handling
- Release ergonomics:
  - added `start` / `start:prod` scripts to `apps/api` and `apps/workers` (run built `dist/main.js`)
- Observability hardening:
  - standardized Sentry `release` + `environment` wiring across api/workers/web/mobile
  - enabled stable stack frame rewriting in api/workers (`rewriteFramesIntegration`) so uploaded sourcemaps match across environments
  - added scripts for uploading Node sourcemaps: `pnpm sentry:upload:api` and `pnpm sentry:upload:workers` (no-op without Sentry auth env)
  - enabled conditional Next.js sourcemap upload during `next build` when `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` are set
- Push hardening (Expo):
  - Expo push delivery now also polls push receipts and disables invalid tokens surfaced via receipts
  - push delivery avoids failing the whole outbox event on partial push errors (prevents duplicate pushes)
  - added unit tests for receipts handling and error behavior

- OpenAPI contract hardening:
  - added explicit Swagger response DTOs (and response mapping) for attachments short-links, channel accounts, notifications, and workspaces
  - ensured sensitive fields (like `authDataEncrypted`) are not leaked through controller responses

- Realtime reliability:
  - moved websocket auth + workspace room join into Socket.IO middleware to reduce “connect before join” races

- Redis isolation for local dev + e2e:
  - BullMQ now uses a per-environment prefix by default: `BULLMQ_PREFIX=omnichat:<NODE_ENV>` (overrideable)
  - Socket.IO Redis adapter/emitter now use a per-environment key by default: `SOCKETIO_REDIS_KEY=socket.io:<NODE_ENV>` (overrideable)
  - this prevents cross-env interference when dev + e2e stacks share the same local Redis

- Workers outbox recovery:
  - outbox poller now ticks immediately on startup
  - in `NODE_ENV=test`, outbox poll interval defaults to 1s for faster CI/e2e recovery of any lost jobs

## 2026-03-13 - Hosted deployment baseline (Pulumi + DO App Platform + Vercel + Cloudflare)

- added `infra/pulumi` TypeScript Pulumi project for a single `prod` stack
- modeled DigitalOcean App Platform runtime with one public API service and one worker component using existing Dockerfiles
- modeled DigitalOcean managed PostgreSQL and Valkey/Redis clusters
- modeled DigitalOcean Spaces bucket + scoped access key for attachments and short-links
- modeled Cloudflare zone + DNS records for `app.<domain>` and `api.<domain>`
- modeled Vercel project, production env injection, and custom domain attachment for `apps/web`
- standardized hosted runtime URLs around `https://app.<domain>` and `https://api.<domain>`
- added support for existing Cloudflare zones via `cloudflareZoneId`, keeping zone creation as fallback only

## 2026-03-13 - Hosted observability baseline (Sentry + Grafana Cloud + Cloud Loki)

- added protected Prometheus `/metrics` endpoints to API and workers
- added `prom-client` collectors for API storage health metrics and workers outbox backlog metrics
- added Loki transport wiring through `pino-loki` in API and workers logging modules
- extended runtime env schemas and env examples with `METRICS_TOKEN` and `LOKI_*`
- updated compose prod env passthrough for metrics/log shipping compatibility
- documented managed-cloud observability stance while keeping local self-hosted monitoring compose for dev/fallback use

## 2026-03-13 - GitHub deploy control plane

- added `scripts/infra/configure-pulumi-stack.sh` to materialize Pulumi stack config on CI runners
- added `.github/workflows/infra-preview.yml` for PR previews
- added `.github/workflows/infra-deploy.yml` for main/manual deploys
- configured Pulumi Cloud GitHub Actions OIDC issuer for org `Digberi`
- configured Pulumi OIDC auth policy restricted to `repo:Digberi/omnichat-hub:*`
- configured GitHub repo vars and secrets required for hosted infra deploys
- created GitHub `production` environment for infra deploy workflow

## 2026-03-14 - Optional Grafana Cloud IaC baseline

- added optional `infra/pulumi/src/observability.ts` module for Grafana Cloud
- added support for `grafanaCreateCloudStack`, `grafanaCloudRegion`, `grafanaStackSlug`, `grafanaStackName`, and `grafanaCloudAccessPolicyToken`
- added optional creation of Grafana Cloud stack plus Loki and Prometheus ingest access policies/tokens
- added workflow and stack-config wiring for Grafana Cloud provider auth
- wired Grafana-created Loki credentials into API/workers env generation when observability stack creation is enabled
