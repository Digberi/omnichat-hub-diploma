# Sentry release automation

This folder contains CI release helpers used by `.github/workflows/ci.yml`.

## `release.sh`

Runs conditional Sentry release creation + sourcemap upload for backend services:

- Requires env vars:
  - `SENTRY_AUTH_TOKEN`
  - `SENTRY_ORG`
  - `SENTRY_PROJECT`
  - `SENTRY_RELEASE`
- When any required var is missing, script exits with code `0` and logs a skip message.
- Uploads sourcemaps for:
  - `apps/api/dist` via `pnpm sentry:upload:api`
  - `apps/workers/dist` via `pnpm sentry:upload:workers`
- Next.js sourcemaps are expected to be uploaded by `@sentry/nextjs` at build time by default.
  - To force manual Next.js upload, set `SENTRY_UPLOAD_WEB_MANUAL=1`

## Release finalize and commits

`release.sh` tries to:
- create release (`sentry-cli releases new`)
- finalize release
- link commits (`sentry-cli releases set-commits --auto`)

Failures in optional finalize/set-commits steps are intentionally non-blocking in CI.
