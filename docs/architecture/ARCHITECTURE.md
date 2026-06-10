# Architecture

## Monorepo layout

Apps:

- `apps/api`: Classic NestJS REST API (primary interface), versioned routes under `/v1`
- `apps/workers`: background processors (BullMQ) consuming the Outbox and running maintenance/rollups
- `apps/web`: Next.js client
- `apps/mobile`: Expo React Native client

Packages:

- `packages/db`: Prisma schema + migrations + seed
- `packages/domain`: pure business rules + tests
- `packages/contracts`: shared enums + realtime event envelopes
- `packages/api-client`: generated OpenAPI types + runtime client
- `packages/config`: shared lint/prettier configs
- `packages/ui-tokens`: design tokens (no components)

## API

`apps/api` is a classic NestJS app:

- Controllers + DTOs (`class-validator` / `class-transformer`)
- Global `ValidationPipe`:
  - `whitelist: true`
  - `transform: true`
  - `forbidNonWhitelisted: true`
- Swagger/OpenAPI at `/docs`
- URI versioning: `/v1/...`
- Guards:
  - `JwtAuthGuard` for bearer auth
  - `WorkspaceMembershipGuard` for workspace scoping
- Structured logging: `nestjs-pino` (+ request id)
- Security baseline: helmet + CORS allowlist + throttling on auth routes
- Health: `/health` + `/ready` include DB + Redis checks

Workers also expose unversioned health endpoints on a dedicated port (default `4122`):
- `/health`
- `/ready`

## Data layer (Prisma)

`packages/db` is the canonical schema and Prisma Client.

Services should avoid “Prisma everywhere” by using thin repositories/data-access services in the app layer.

## Reliability: Outbox-first

When writing messages, the API writes:

1. `Message`
2. derived `Conversation` updates (using `@omnichat/domain`)
3. `OutboxEvent`

in a single DB transaction.

Workers (`apps/workers`) consume `OutboxEvent` rows and deliver side-effects:

- realtime Socket.IO emits
- push notifications (respecting snooze suppression)
- maintenance and cleanup tasks
- analytics rollups

There is also an Outbox poller to re-enqueue pending events for recovery.

## Realtime: Socket.IO + Redis adapter/emitter

API hosts the Socket.IO server with Redis adapter for horizontal scale.

Workers use Redis emitter to broadcast events without needing direct access to the API server instance.

All sockets are scoped into workspace rooms:

- room: `workspace:{workspaceId}`

## Clients

The OpenAPI spec is the source of truth.

- `packages/api-client` is generated from `apps/api/openapi.json`
- `apps/web` and `apps/mobile` import `@omnichat/api-client`

## Search

Postgres search uses:

- tsvector + GIN for full-text search
- `pg_trgm` + trigram indexes for fuzzy fallback

Default scope is last N days (configured), with `showOlder` to search full history.
