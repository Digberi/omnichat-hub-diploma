# E2E tests (shared)

This package contains black-box E2E tests that exercise the system over real HTTP/WebSocket boundaries.

## Local run (dev)

1. Start infra:
   - `pnpm infra:up`
2. Migrate + seed:
   - `pnpm --filter @omnichat/db prisma:generate`
   - `pnpm --filter @omnichat/db prisma:migrate`
   - `pnpm --filter @omnichat/db prisma:seed`
3. Start API + workers (in separate terminals):
   - `pnpm dev:api`
   - `pnpm dev:workers`
4. Run E2E:
   - `pnpm test:e2e`

## Env

- `E2E_API_BASE_URL` (default `http://localhost:4121`)
- `E2E_OTP_CODE` (default `000000`) must match `AUTH_OTP_FIXED_CODE` used by the API in `NODE_ENV=test`
- `E2E_REQUIRE_WORKERS=1` to enable websocket delivery assertions (requires `pnpm dev:workers`)
