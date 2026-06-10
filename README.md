# Omnichat Hub (Monorepo)

Production-ready monorepo for an omnichannel inbox:

- `apps/api`: Classic NestJS REST API (versioned under `/v1`) + Swagger at `/docs`
- `apps/workers`: Separate NestJS workers (BullMQ) processing Outbox + push + maintenance + metrics
- `apps/web`: Next.js App Router client using generated OpenAPI client
- `apps/mobile`: Expo React Native client using generated OpenAPI client + Socket.IO

Shared packages:

- `packages/db`: Prisma schema + migrations + seed (Postgres)
- `packages/domain`: pure business rules (needsReply/snooze/archive/pin/auto-archive) + unit tests
- `packages/contracts`: shared enums + realtime event envelope types
- `packages/api-client`: generated OpenAPI types + runtime client (`openapi-fetch`)

## Requirements

- Node.js `22` (see `.nvmrc`)
- `pnpm`
- Docker (for Postgres/Redis/MinIO local infra)

## Quickstart (local dev)

1. Install deps:
   - `pnpm i`
2. Start infra:
   - `pnpm infra:up`
3. Migrate + seed DB:
   - `pnpm --filter @omnichat/db prisma:migrate`
   - `pnpm --filter @omnichat/db prisma:seed`
4. Start apps (separate terminals):
   - `pnpm dev:api`
   - `pnpm dev:workers`
   - `pnpm dev:web`

Mobile:

- `pnpm dev:mobile`

Health checks:

- API: `GET http://localhost:4121/health` and `GET http://localhost:4121/ready`
- Swagger/OpenAPI: `GET http://localhost:4121/docs`

## E2E tests

Shared black-box tests live in `tests/e2e`.

Local run:

1. Start infra + migrate + seed (see quickstart)
2. Start API + workers:
   - `pnpm dev:api`
   - `pnpm dev:workers`
3. Run:
   - `pnpm test:e2e`

Env:

- `E2E_API_BASE_URL` (default `http://localhost:4121`)
- `E2E_OTP_CODE` (default `000000`) must match API `AUTH_OTP_FIXED_CODE` when `NODE_ENV=test`
- `E2E_REQUIRE_WORKERS=1` enables websocket delivery assertions

## OpenAPI client generation (contract drift gate)

The API OpenAPI spec is exported from `apps/api` into `apps/api/openapi.json`.

Generate types:

- `pnpm api-client:generate`

Important: after regeneration, build the client package for consumers:

- `pnpm --filter @omnichat/api-client build`

CI enforces drift detection by generating and failing if `git diff` is non-empty.

## Repo commands

- `pnpm dev` (starts all packages that define `dev`; use `dev:*` scripts for focused runs)
- `pnpm dev:api`, `pnpm dev:workers`, `pnpm dev:web`, `pnpm dev:mobile`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm infra:up`, `pnpm infra:down`
- `pnpm infra:prod:up`, `pnpm infra:prod:down`
- `pnpm infra:monitoring:up`, `pnpm infra:monitoring:down`

## Docs

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DEPLOYMENT.md`
- `docs/architecture/MONITORING.md`
- `docs/architecture/PROD_ENV_MATRIX.md`
- `docs/architecture/DOMAIN_RULES.md`
- `docs/architecture/MODULE_MAP.md`
- `docs/architecture/RUNBOOK.md`
- `docs/architecture/MIGRATION_LOG.md`
- `docs/adapters/ADAPTER_SPEC_TEMPLATE.md`
