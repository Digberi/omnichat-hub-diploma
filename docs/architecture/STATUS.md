# Omnichat Hub — Status

Updated: 2026-02-18

This document is a pragmatic snapshot of what is already implemented in the repo, what is still missing vs the plan/PRD, and what could be improved beyond the current scope.

## Repo structure (current)

- `apps/api`: NestJS REST API (`/v1`) + Swagger (`/docs`) + Socket.IO (`/ws`)
- `apps/workers`: NestJS workers (BullMQ) for Outbox, push, maintenance, rollups
- `apps/web`: Next.js App Router (ported prototype UI/UX) using generated OpenAPI client + Socket.IO realtime
- `apps/mobile`: Expo RN (mobile parity in progress) using generated OpenAPI client + Socket.IO realtime
- `packages/contracts`: shared enums + realtime event types + shared error codes
- `packages/domain`: pure business rules + unit tests (Vitest)
- `packages/db`: Prisma schema + migrations + seed + Prisma Client build export
- `packages/api-client`: generated OpenAPI TS types + runtime client (`openapi-fetch`) + refresh-on-401 logic + unit tests
- `packages/config`, `packages/ui-tokens`: scaffolds for shared config/tokens
- `tests/e2e`: shared black-box E2E tests over HTTP + WebSocket boundaries (Vitest)
- `infra/compose`: local Postgres + Redis + MinIO compose
- `infra/monitoring`: Prometheus + Alertmanager + Grafana + blackbox configs
- `.github/workflows/ci.yml`: CI pipeline
- `docs/architecture/*`: architecture/runbook/migration log docs
- `docs/adapters/*`: adapter specs (stubs)

## Plan progress (high level)

- Monorepo bootstrap (pnpm + turbo + strict TS + CI): DONE
- Shared packages (`contracts/domain/db/api-client/...`): DONE
- Domain rules extracted + unit tests: DONE (core rules enforced)
- Prisma schema + migrations + seed: DONE
- API foundation (REST `/v1`, Swagger, validation, security baseline, health): DONE
- Auth + guards + workspace scoping: DONE (OTP/JWT refresh rotation baseline)
  - OTP email delivery now supports `Resend` as a real transactional provider; `console` remains available for local/dev.
- Core REST modules (conversations/messages/tags/statuses/templates/settings/search): DONE (core flows)
- Outbox producer + workers consumers (realtime emits, retries, poller): DONE
- Web UI ported and connected to API: DONE (core pages)
- Mobile parity: IN PROGRESS (push/dev-build and polish)
- Docs polish + runbooks: IN PROGRESS

## What is NOT migrated / still missing (prioritized)

P0 (required for production rollout):
- Google OAuth: DONE (endpoints + web redirect callback + one-time exchange code; disabled with clear error unless env is configured).
- Auth logout/session revoke: DONE (`POST /v1/auth/logout`, `POST /v1/auth/logout-all`) + `GET /v1/auth/me`.
- Push notifications end-to-end on mobile:
- Expo Go cannot test remote push on SDK 53+ (dev client required).
- DONE: deep-link on push tap to the right chat (cold start + background) + explicit permission/register UX in Settings.
- DONE: Settings now exposes push permission state, detected EAS `projectId`, token registration confirmation, and API registration timestamp for runtime verification on real devices.
- Remaining: one manual device smoke in dev-client/release build per platform to confirm full E2E push delivery in your target environments.
- Mobile UI kit convergence:
- DONE: `apps/mobile/src/components/ui` reduced to a single barrel (`index.ts`) and all component implementations are sourced from `apps/mobile/src/registry/nativewind/components/ui` (single source of truth).
- Production deployment artifacts:
- DONE: added `infra/compose/docker-compose.prod.yml`, `infra/compose/.env.prod.example`, and deployment/env docs (`docs/architecture/DEPLOYMENT.md`, `docs/architecture/PROD_ENV_MATRIX.md`).
- Storage hardening:
- DONE baseline: local MinIO bootstrap creates bucket + lifecycle policy and API storage paths use timeout/retry wrappers with health checks.
- Added: API exposes storage health/operation metrics via `GET /v1/metrics/storage` (`avgDurationMs`, retries, failures, last error/success timestamps).
- Added in code/tests:
  - `GET /v1/metrics/storage/health` (derived health status + reasons)
  - e2e test covers storage health endpoint
  - unit test covers expired short-links/attachments cleanup path
- Added in code: storage health endpoint `GET /v1/metrics/storage/health` with configurable thresholds:
  - `STORAGE_ALERT_PING_MAX_AGE_MS`
  - `STORAGE_ALERT_FAILURE_RATE_WARN_PCT`
  - `STORAGE_ALERT_FAILURE_RATE_CRITICAL_PCT`
  - `STORAGE_ALERT_AVG_DURATION_WARN_MS`
  - `STORAGE_ALERT_AVG_DURATION_CRITICAL_MS`

P1 (next after P0):
- Channel adapters:
- OLX: DONE (text flow baseline). Implemented OAuth linking, encrypted token storage, workers incoming sync with checkpoints, API outgoing text send with token refresh + retry endpoint (`POST /v1/messages/:messageId/retry`), and failure mapping to `message.updated`.
- Prom/Rozetka: still stubs/mock sync only.
- Remaining for full production adapter parity: OLX attachment send parity + adapter-specific reconciliation/monitoring.
- Realtime UX polish:
- PARTIAL: added client-side event dedupe window + reconnect refresh on web/mobile sockets.
- Remaining: richer optimistic reconciliation under packet loss and explicit offline queue UX.
- Web perf:
- inbox virtualization for large workspaces, caching strategy, and SSR/streaming decisions documented as ADRs.
- Observability:
- Sentry is wired end-to-end and verified:
  - Sentry org/projects exist: `omnichat-api`, `omnichat-workers`, `omnichat-web`, `omnichat-mobile` (org: `omnichat-ei`).
  - GitHub Actions vars/secrets are configured (`SENTRY_ORG`, `SENTRY_URL`, `SENTRY_PROJECT_*`, `SENTRY_AUTH_TOKEN`) so CI can upload sourcemaps on `main` (PR workflows remain no-op by design).
  - `scripts/sentry/release.sh` and `scripts/sentry/upload-node-sourcemaps.sh` were hardened to pass `--project` (required for org-scoped CI tokens and newer `sentry-cli` behavior).
  - Smoke events were sent and verified in Sentry via tag search (`smoke.marker:*`) across all projects.
  - Added: external monitoring baseline with `Prometheus + Alertmanager + Grafana + Blackbox` at `infra/compose/docker-compose.monitoring.yml`.
  - Added: alert rules for API/web/workers health/readiness probes and baseline dashboard provisioning.
  - Remaining: connect Alertmanager receivers to your production channels (Slack/PagerDuty/Webhook) and tune thresholds under real load.

P2 (later / optional improvements):
- Multi-workspace UI/UX (switcher) and membership role management screens.
- Admin/debug endpoints for Outbox inspection/replay and job introspection (guarded).
- More extensive e2e coverage:
- PARTIAL: WS tests are in place and negative/security tests now include workspace-membership `403 FORBIDDEN` scenario via forged workspace token in e2e.
- Remaining: expand authz matrix (role-based boundaries once role-restricted endpoints are introduced).

## Next immediate plan items (by priority)

1. Satisfy remaining P0:
   - Run final manual mobile push smoke in dev-client/release builds and capture evidence in release checklist.
   - Connect Alertmanager receivers and on-call routing in production.
2. P1 stabilization:
   - add storage/queue dashboards (`/v1/metrics/storage`, existing `/v1/metrics/inbox`) into Sentry/Prometheus.
   - finalize target-environment manifests (K8s/ECS/Fly/etc) beyond compose baseline.

## Can we run it now?

Yes. The current repo state is runnable locally as a full stack (API + workers + web), assuming you have infra up and the DB migrated/seeded.

## Quickstart (local dev)

Prereqs:
- Node.js `22` (see `.nvmrc`)
- pnpm (see `package.json#packageManager`)
- Docker (for local Postgres/Redis/MinIO)

Environment (no secrets committed):
- `apps/api/.env`: copy from `apps/api/.env.example`
- `apps/workers/.env`: copy from `apps/workers/.env.example`
- `apps/web/.env.local`: copy from `apps/web/.env.example`
- `apps/mobile/.env`: copy from `apps/mobile/.env.example` (Expo reads `EXPO_PUBLIC_*`)
  - Tip: on a physical device do not use `localhost` for API URLs; either leave the vars blank (auto-detect) or set them to your machine LAN IP.

Ports:
- Web: `http://localhost:3000`
- API: `http://localhost:4121` (REST `/v1`, Swagger `/docs`)
- Workers health: `http://localhost:4122` (`/health`, `/ready`)
- Realtime WS: `http://localhost:4121/ws`
- MinIO: `http://localhost:9000` (S3 API), `http://localhost:9001` (console)
- Postgres: `localhost:5432`, Redis: `localhost:6379`

Run the stack:
1. Install deps: `pnpm install`
2. Start infra: `pnpm infra:up`
3. Migrate + seed (migrations need `DATABASE_URL` set in your shell or in `packages/db/.env`; seed also tries to auto-load from `apps/api/.env` if present):
   - `pnpm --filter @omnichat/db prisma:migrate:deploy`
   - `pnpm --filter @omnichat/db prisma:seed`
4. Start API: `pnpm dev:api`
5. Start workers: `pnpm dev:workers` (required for realtime Outbox delivery)
6. Start web: `pnpm dev:web`
7. Optional: mobile app: `pnpm dev:mobile`
   - Note: Expo Go does not support remote push notifications (`expo-notifications`) on SDK 53+.
     Use a development build (dev client) to test push. In Expo Go push registration is skipped by the app.
   - If you have a dev build installed, use: `pnpm dev:mobile:dev-client`

Login (dev):
- Email: `demo@omnichat.local`
- OTP: `000000` when `AUTH_OTP_FIXED_CODE=000000` is set in `apps/api/.env` (otherwise read the OTP in API logs after starting OTP)

Tests:
- Unit: `pnpm test`
- E2E (black-box): start API + workers first, then `pnpm test:e2e`
  - env overrides: `E2E_API_BASE_URL`, `E2E_OTP_CODE`
  - Tip: E2E runs with `NODE_ENV=test` which automatically isolates BullMQ queues and Socket.IO Redis channels from your dev stack (see `BULLMQ_PREFIX` and `SOCKETIO_REDIS_KEY`).

Build:
- Build everything: `pnpm build`
- Export OpenAPI only: `pnpm openapi:export`

OpenAPI client:
- Regenerate OpenAPI + typed client: `pnpm api-client:generate` (CI enforces drift gate)

## Known dev gotchas / troubleshooting

### API port already in use

If API fails with `EADDRINUSE` (port `4121`), either stop the existing process on that port or change `PORT` in `apps/api/.env`.

### Redis namespace collisions (dev + e2e)

If you run multiple stacks against the same local Redis (e.g. dev API on `NODE_ENV=development` and e2e on `NODE_ENV=test`), queues and websocket channels must be isolated.

This repo isolates them by default using `NODE_ENV`-derived prefixes, but you can also override explicitly:
- `BULLMQ_PREFIX` (BullMQ key prefix)
- `SOCKETIO_REDIS_KEY` (Socket.IO Redis adapter/emitter key)

### Prisma `DATABASE_URL` and migrations

`apps/api`, `apps/workers`, and `packages/db` all need a consistent `DATABASE_URL` pointing at the same Postgres instance for local dev.

### Expo Go and push notifications (`expo-notifications`)

Expo SDK 53+ removed Android remote push notifications support from Expo Go for `expo-notifications`.
If you run `pnpm dev:mobile` using Expo Go, push token registration is intentionally skipped.

To test real push notifications, use a development build:
1. Install dev client: `pnpm --filter mobile exec expo install expo-dev-client`
2. Build & run:
   - Android: `pnpm --filter mobile exec expo run:android`
   - iOS: `pnpm --filter mobile exec expo run:ios`
3. Start Metro for dev client: `pnpm dev:mobile:dev-client`

### Mobile Sentry `wrap` before `init` warning

This warning should no longer appear because the mobile app initializes Sentry before calling `Sentry.wrap()`.
If you still see it, restart Metro with cache cleared.

## Related docs

- `docs/architecture/ARCHITECTURE.md`: monorepo + runtime overview
- `docs/architecture/DOMAIN_RULES.md`: business rules (English/Ukrainian)
- `docs/architecture/MODULE_MAP.md`: NestJS module map (API + workers)
- `docs/architecture/RUNBOOK.md`: local dev, migrations, jobs, debugging
- `docs/architecture/MIGRATION_LOG.md`: chronological refactor log

## What already exists (implemented)

### Tooling baseline

- pnpm workspaces + Turborepo orchestration (`dev`, `build`, `lint`, `typecheck`, `test`).
- Node pinned to v22 via `.nvmrc` and `package.json#engines.node`.
- Strict TypeScript configs enabled across packages/apps.
- OpenAPI is the source of truth, generated from `apps/api` and used to generate `packages/api-client`.

### Database (`packages/db`)

- Prisma schema v1 implemented (with the agreed additions like Outbox and analytics rollups).
- Migrations present, including search-related migrations (extensions/indexes as needed).
- Seed script produces deterministic baseline data for UI/API development, mirroring the original prototype mocks (tags/statuses/templates/channel accounts/conversations/messages + seller meta fields).

### Domain rules (`packages/domain`)

- Pure conversation/message state rules implemented and unit-tested, including:
- `needsReply` semantics: flips to `false` only after successful seller reply (not on “mark as read”).
- Pin rules: max 3 pinned in All; pinned never auto-archive; archive pinned requires explicit confirmation.
- Snooze semantics for suppressing push (while still showing unread state in UI).
- Auto-unarchive on new incoming message.
- Auto-archive eligibility logic based on `lastSellerReplyAt` and `needsReply=false` (and not pinned).

### API (`apps/api`)

- Classic NestJS REST (`/v1`) with:
- Controllers/Services/DTOs using `class-validator`/`class-transformer`.
- Global `ValidationPipe` with strict settings (`whitelist`, `transform`, `forbidNonWhitelisted`).
- Swagger/OpenAPI at `/docs`, export script generates `apps/api/openapi.json`.
- Structured logging via `nestjs-pino` with request id.
- Helmet and CORS allowlist.
- Health and readiness endpoints: `GET /health`, `GET /ready` (with DB+Redis checks).
- Storage readiness check is now included in `/ready` via `StorageService.ping()` for S3/MinIO dependency.
- Graceful shutdown hooks.
- Auth baseline:
- Email OTP flow.
- JWT access/refresh with refresh rotation and hashed refresh token storage in DB.
- Workspace membership enforcement for HTTP routes and WebSocket connections.
- Core modules (REST):
- Conversations list with folder logic (ALL/UNREAD/CHANNEL/SNOOZED/ARCHIVED), pinned block, cursor pagination.
- Conversation details endpoint.
- Mutations: pin/unpin, archive/unarchive, snooze/unsnooze, setStatus, setTags.
- Conversation meta updates: `PATCH /v1/conversations/:id/meta` (seller note, TTN/shipping, payment status, follow-up).
- Messages list with cursor pagination and send (text + attachment).
- Message delivery status updates: `PATCH /v1/messages/:messageId` produces outbox `message.updated` for realtime UI patches.
- Tags CRUD, Statuses CRUD.
- Templates CRUD (categories + templates).
- Settings read/update.
- Workspaces basics.
- Channel accounts stubs.
- Notifications device tokens + preferences.
- Search endpoint `GET /v1/search` with “recent window default” and `showOlder` flag.
- Attachments short links:
- Upload attachment message flow uses MinIO/S3-compatible API (local dev defaults).
- Create short link and resolve landing endpoint (`/v1/s/:token`), with UA fallback message for expired/unknown.
- Metrics endpoint for inbox dashboard: `GET /v1/metrics/inbox`.

### Outbox + queues (API + Workers)

- OutboxEvent rows are written in the same DB transaction as message/conversation derived updates.
- API enqueues `outbox.process` jobs immediately.
- Workers provide:
- Outbox consumer with retries/backoff and locking semantics.
- Poller that re-enqueues overdue pending events on an interval (recovery path).
- Websocket emits done by workers via Redis Socket.IO emitter (so API can scale horizontally behind Redis adapter).
- Push pipeline stubbed with providers (`console` and Expo scaffolding).
- Channel sync:
- optional stub generator for local/dev incoming messages.
- OLX pull baseline for OAuth-linked accounts with checkpoint cursor/lastMessageAt and idempotent incoming insert into DB.
- Maintenance jobs: cleanup expired short links (DB) and auto-archive conversations (hourly).
  - Attachment object TTL is enforced via S3/MinIO bucket lifecycle (bootstrapped by API `StorageService`; disable with `STORAGE_APPLY_LIFECYCLE=false`) and guarded at resolve-time (attachment `expiresAt` + storage `headObject`).
- Metrics rollup job into analytics tables.

### Realtime (Socket.IO)

- API hosts Socket.IO gateway on `/ws`.
- Redis adapter enabled for horizontal scaling.
- Workers emit events via Redis emitter to workspace-scoped rooms.
- BullMQ queues and Socket.IO Redis channels are namespaced by default based on `NODE_ENV`:
  - BullMQ: `BULLMQ_PREFIX=omnichat:<NODE_ENV>` when empty
  - Socket.IO: `SOCKETIO_REDIS_KEY=socket.io:<NODE_ENV>` when empty
  This prevents cross-environment interference when running dev + e2e stacks against the same local Redis.
- E2E coverage asserts `message.new`, `message.updated`, and `conversation.updated` delivery (requires workers running).

### Web (`apps/web`)

- Next.js App Router with ported prototype UI/UX (Tailwind + shadcn/ui), backed by API:
- Login flow (OTP; dev can use `AUTH_OTP_FIXED_CODE=000000`).
- Inbox with folders/tabs + realtime updates (Socket.IO outbox events).
- Realtime message patches: `message.updated` updates delivery state in the UI without refresh.
- Buyer sidebar seller meta edits (note/TTN/payment/follow-up) are persisted via API.
- Templates: list + create/edit/delete wired to API templates CRUD.
- Tags/Statuses management modals wired to API CRUD.
- Inbox dashboard uses `GET /v1/metrics/inbox` (no hardcoded mock metrics).
- Context, Settings, Search pages wired to API.
- Attachments: pick file, upload, render attachment bubbles/cards, open via short-links (7 days TTL).
- Sentry baseline wiring (env-gated).

### Mobile (`apps/mobile`)

- Expo RN skeleton with:
- Login flow (OTP) using generated client.
- Basic screens: Inbox, Chat, Context, Templates, Settings.
- Token persistence and token-change subscription handling.
- Socket.IO client wiring for realtime.
- Attachments: picker + upload + open via short-links.
- Inbox swipe actions: pin/unpin (All only) and archive/unarchive (with confirm for pinned archive).
- Sentry baseline wiring (env-gated).

### Infra (`infra/compose`)

- `postgres:16`, `redis:7`, `minio` compose file.
- Root scripts `infra:up` / `infra:down`.

### CI

- GitHub Actions workflow runs lint/typecheck/test/build + E2E smoke (infra + api + workers).
- OpenAPI drift gate exists (regeneration must match committed output).

### Tests

- Unit tests:
- `packages/domain` rules tests.
- `packages/api-client` refresh-on-401 tests.
- `apps/workers` outbox poller/processor tests.
- E2E tests:
- Located in `tests/e2e` (HTTP + WebSocket black-box), covering auth/health/conversations/messages/search/tags/statuses/templates/settings/shortlinks/ws.

## What is still missing (remaining work)

### Web product UI gaps

- More inbox polish: loading skeletons, long-list virtualization, accessibility passes.
- Jump-to-message UX hardening:
- “Load older/newer” around the anchor for long threads (current endpoint returns a fixed window only).
- Highlight clearing and “copy link” action.

### Mobile product UI gaps

- Push notification registration + preferences UI (API endpoints exist; UI is minimal).
- Expo Go limitation: remote push requires a development build; ensure dev-client workflow is documented and stable.
- Offline/resume behavior and better optimistic updates for sends.

### API gaps / hardening

- Swagger response DTO coverage is improved (attachments/channel accounts/notifications/workspaces now have explicit response DTOs and consistent error responses). Remaining endpoints should still be audited for “raw Prisma model” leaks and weak schema generation.
- More explicit error codes mapping in responses for clients (consistent `ErrorCode` usage).
- Google OAuth scaffolding and identity-linking flow completeness (if required for production).
- Rate limiting tuned specifically for auth endpoints (throttler is present, but policies may need hardening).
- End-to-end delivery status lifecycle from real channel adapters (adapters are still stubbed; `message.updated` is currently produced via a manual REST endpoint).

### Workers gaps / hardening

- Channel sync adapters are stubs; real OLX/Prom connectors are not implemented (by design).
- Stronger idempotency strategy for external messages when adapters are implemented (unique keys + dedupe).
- Push provider hardening is mostly in place (batching + disabling invalid tokens via Expo tickets/receipts).
  Remaining: decouple receipt polling into a separate queue job, delivery analytics/metrics, and more error-specific policies.

### Storage gaps

- Signed URL behavior and attachment expiry UX is present, but production storage strategy needs finalization:
- S3-compatible credentials management.
- Optional multipart uploads and AV scanning (if required).

### Observability and release

- Sentry is wired baseline with release/environment support across api/workers/web/mobile.
  - Node sourcemap upload scripts exist: `pnpm sentry:upload:api` / `pnpm sentry:upload:workers` (no-op without Sentry auth env).
  - Web sourcemaps upload automatically during `next build` when Sentry build env vars are provided.
  Remaining: define naming conventions for `SENTRY_RELEASE`, align sampling, and automate sourcemap upload for mobile builds.
- Operational dashboards (metrics export, alerts).

## Improvement ideas (beyond the current plan)

### Reliability and scale

- Add an Outbox delivery table per consumer (ws, push, metrics) to guarantee “exactly-once per side effect” and reduce ambiguous states.
- Add event ordering keys and monotonic sequence per conversation to simplify client ordering/dedup.
- Move outbox processing to “batch claim” with `FOR UPDATE SKIP LOCKED` and process N events per job for better throughput.
- Add connection pooling and/or PgBouncer to protect Postgres under burst load.

### Performance

- Add API caching for read-heavy endpoints (ETag/If-None-Match for conversations list; SWR cache headers where safe).
- Optimize search:
- generated `tsvector` columns and GIN indexes with proper language config.
- query plans monitoring and index validation in CI (optional).
- Reduce inbox refetch strategy: apply websocket patch locally instead of reloading list.

### Security

- Encrypt sensitive fields at rest (authDataEncrypted is modeled; implement KMS-backed encryption utilities).
- Add audit log coverage on all high-risk mutations (status/tags/pin/archive/snooze/auth flows).
- Add stricter CORS origin parsing and enforcement.
- Consider CSRF protection if cookies are used for web auth (currently bearer is the baseline).

### Developer experience

- Add a generator for new modules (controller/service/dto/repository) to keep patterns consistent.
- Add “one command” dev: `pnpm dev` that starts infra + api + workers + web (with concurrency and logs).
- Add `docker compose` profiles for optional MinIO and test DB isolation.

### Testing and quality

- Add contract tests for OpenAPI schemas (validate response shapes against DTOs).
- Add load tests (k6/Artillery) for inbox list, search, outbox throughput, websocket fanout.
- Add database-level invariants tests (migration checks, index existence checks).

### Product UX improvements

- Add a “rebuild derived fields” maintenance job for repair/consistency checks.
- Add a “conversation timeline” view that mixes status/tag changes with messages (events).
- Improve search UI: filters (folder/channel/status/tag), recent window toggle, and message snippet highlighting.
