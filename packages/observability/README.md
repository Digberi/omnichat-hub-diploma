# @omnichat/observability

OpenTelemetry + Sentry observability for omnichat-hub.

Six subpath exports, one per runtime:

- `@omnichat/observability/node` — NestJS api / workers
- `@omnichat/observability/vercel` — Next.js Vercel functions
- `@omnichat/observability/browser` — Web client (browser bundle)
- `@omnichat/observability/expo` — Expo / React Native
- `@omnichat/observability/workers` — Cloudflare Workers (stub)
- `@omnichat/observability/nest` — NestJS DI module

See [`docs/observability/README.md`](../../docs/observability/README.md) for architecture (TBD — created in DOCS task 43).
