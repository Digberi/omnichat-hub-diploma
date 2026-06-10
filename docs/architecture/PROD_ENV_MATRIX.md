# Production Environment Matrix

This matrix defines the minimal production environment for each runtime component.

## Shared

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | yes | `production` | Must be `production` in deployed environments. |
| `DATABASE_URL` | yes | `postgresql://...` | Same Postgres for API and workers. |
| `REDIS_URL` | yes | `redis://...` | Same Redis for API Socket.IO + BullMQ + workers. |
| `BULLMQ_PREFIX` | yes | `omnichat:production` | Prevents queue namespace collisions. |
| `SOCKETIO_REDIS_KEY` | yes | `socket.io:production` | Must match API and workers. |

## API (`apps/api`)

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `PORT` | yes | `4121` | API HTTP port. |
| `CORS_ORIGINS` | yes | `https://app.example.com` | Comma-separated allowlist. |
| `JWT_ACCESS_SECRET` | yes | `***` | 16+ chars. |
| `JWT_REFRESH_SECRET` | yes | `***` | 16+ chars. |
| `AUTH_OTP_PEPPER` | yes | `***` | 16+ chars. |
| `EMAIL_PROVIDER` | yes | `resend` | `console`/`resend`. |
| `EMAIL_FROM` | required for `resend` | `OmniChat <hello@omnichat.to>` | Sender shown to user. |
| `EMAIL_REPLY_TO` | optional | `hello@omnichat.to` | Reply-to header. |
| `RESEND_API_KEY` | required for `resend` | `re_***` | API key for OTP and other transactional mail. |
| `SHORTLINK_TTL_DAYS` | yes | `7` | Attachment short-link TTL. |
| `ATTACHMENT_TTL_DAYS` | yes | `7` | Lifecycle + cleanup behavior. |
| `STORAGE_ENDPOINT` | yes | `https://s3...` | S3/MinIO endpoint. |
| `STORAGE_BUCKET` | yes | `omnichat` | Bucket name. |
| `STORAGE_ACCESS_KEY` | yes | `***` | Do not commit. |
| `STORAGE_SECRET_KEY` | yes | `***` | Do not commit. |
| `SENTRY_DSN` | optional | `https://...` | Enables API Sentry runtime. |
| `GOOGLE_CLIENT_ID` | optional | `...` | Optional OAuth provider. |
| `GOOGLE_CLIENT_SECRET` | optional | `...` | Optional OAuth provider. |
| `GOOGLE_CALLBACK_URL` | optional | `https://api.../v1/auth/google/callback` | Optional OAuth provider. |

## Workers (`apps/workers`)

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `WORKERS_PORT` | yes | `4122` | Workers health/readiness port. |
| `OUTBOX_POLL_INTERVAL_SEC` | yes | `60` | Recovery poll interval. |
| `OUTBOX_MAX_ATTEMPTS` | yes | `10` | Retry cap. |
| `OUTBOX_LOCK_TTL_SEC` | yes | `300` | Stale lock threshold. |
| `PUSH_PROVIDER` | yes | `expo` | `console`/`expo`. |
| `EXPO_ACCESS_TOKEN` | optional | `***` | Required for secure Expo push API usage in prod. |
| `SENTRY_DSN` | optional | `https://...` | Enables workers Sentry runtime. |
| `SENTRY_OUTBOX_BACKLOG_WARN` | yes | `200` | Backlog warning threshold. |
| `SENTRY_OUTBOX_BACKLOG_COOLDOWN_SEC` | yes | `300` | Backlog warning cooldown. |

## Web (`apps/web`)

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | yes | `https://api.example.com` | Build-time client API base URL. |
| `NEXT_PUBLIC_WS_URL` | yes | `https://api.example.com` | Build-time Socket.IO base URL. |
| `NEXT_PUBLIC_WS_PATH` | yes | `/ws` | Socket.IO path. |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | yes | `uk` | Default locale scaffold. |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | `https://...` | Client-side Sentry. |
| `SENTRY_DSN` | optional | `https://...` | Server-side Sentry. |
| `SENTRY_ORG` | optional | `omnichat-ei` | Required for build-time sourcemap upload. |
| `SENTRY_PROJECT` | optional | `omnichat-web` | Required for build-time sourcemap upload. |
| `SENTRY_AUTH_TOKEN` | optional | `sntrys_...` | Required for build-time sourcemap upload. |

## Mobile (`apps/mobile`)

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | yes | `https://api.example.com` | Runtime base URL in release builds. |
| `EXPO_PUBLIC_WS_URL` | yes | `https://api.example.com` | Runtime Socket.IO base URL. |
| `EXPO_PUBLIC_WS_PATH` | yes | `/ws` | Socket.IO path. |
| `EXPO_PUBLIC_SENTRY_DSN` | optional | `https://...` | Mobile Sentry runtime. |
| EAS project id | yes for push | configured in app config | Required for Expo push token generation in dev/prod builds. |


## Pulumi hosted production stack

### Provider auth

These are not committed and should be injected in CI/runtime only.

- `PULUMI_ACCESS_TOKEN`
- `DIGITALOCEAN_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `VERCEL_API_TOKEN`

### Pulumi stack config

Required stack config:

- `rootDomain`
- `githubRepo`
- `apiJwtAccessSecret` (secret)
- `apiJwtRefreshSecret` (secret)
- `apiAuthOtpPepper` (secret)
- `authDataEncryptionKey` (secret)
- `apiMetricsToken` (secret)
- `workersMetricsToken` (secret)

Cloudflare identification:

- preferred for an already-existing zone: `cloudflareZoneId`
- fallback if Pulumi should create the zone: `cloudflareAccountId`

Recommended stack config:

- `githubBranch`
- `doProjectName`
- `vercelProjectName`
- `appSubdomain`
- `apiSubdomain`
- `postgresSize`
- `redisSize`
- `spacesBucketName`
- `sentryApiDsn` (secret)
- `sentryWorkersDsn` (secret)
- `sentryWebDsn` (secret)
- `sentryEnvironment`
- `sentryOrg`
- `sentryProjectWeb`
- `sentryAuthToken` (secret)
- `grafanaLokiHost` (secret)
- `grafanaLokiUsername` (secret)
- `grafanaLokiPassword` (secret)
- `grafanaPrometheusRemoteWriteUrl` (secret)
- `grafanaPrometheusUsername` (secret)
- `grafanaPrometheusPassword` (secret)

### Injected into `apps/api`

- `NODE_ENV=production`
- `PORT=4121`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `AUTH_OTP_PEPPER`
- `AUTH_DATA_ENCRYPTION_KEY`
- `METRICS_TOKEN`
- `CORS_ORIGINS=https://app.<domain>`
- `PUBLIC_WEB_URL=https://app.<domain>`
- `WS_ALLOWED_ORIGINS=https://app.<domain>`
- `STORAGE_ENDPOINT=https://<region>.digitaloceanspaces.com`
- `STORAGE_REGION=<region>`
- `STORAGE_BUCKET=<spaces-bucket>`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `STORAGE_APPLY_LIFECYCLE=true`
- `SHORTLINK_TTL_DAYS=7`
- `EMAIL_PROVIDER=console|resend`
- `EMAIL_FROM` optional (`resend`)
- `EMAIL_REPLY_TO` optional
- `RESEND_API_KEY` optional (`resend`)
- `LOG_LEVEL=info`
- `GOOGLE_CALLBACK_URL=https://api.<domain>/v1/auth/google/callback`
- `OLX_REDIRECT_URL=https://api.<domain>/v1/channel-accounts/olx/callback`
- `SENTRY_*` optional
- `LOKI_*` optional

### Injected into `apps/workers`

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_DATA_ENCRYPTION_KEY`
- `METRICS_TOKEN`
- `STORAGE_ENDPOINT`
- `STORAGE_REGION`
- `STORAGE_BUCKET`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `STORAGE_APPLY_LIFECYCLE=true`
- `SHORTLINK_TTL_DAYS=7`
- `CHANNEL_SYNC_STUB_ENABLED=false`
- `CHANNEL_SYNC_OLX_ENABLED=true`
- `OLX_BASE_URL=https://apps.olx.com.br`
- `PUSH_PROVIDER=expo`
- `SENTRY_*` optional
- `LOKI_*` optional

### Injected into `apps/web` on Vercel

- `NEXT_PUBLIC_API_BASE_URL=https://api.<domain>`
- `NEXT_PUBLIC_WS_URL=https://api.<domain>`
- `NEXT_PUBLIC_WS_PATH=/ws`
- `NEXT_PUBLIC_SENTRY_DSN` optional
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT` optional
- `NEXT_PUBLIC_SENTRY_RELEASE` optional
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` optional
- `SENTRY_DSN` optional
- `SENTRY_ENVIRONMENT` optional
- `SENTRY_RELEASE` optional
- `SENTRY_TRACES_SAMPLE_RATE` optional
- `SENTRY_ORG` optional
- `SENTRY_PROJECT` optional
- `SENTRY_AUTH_TOKEN` optional
- `SENTRY_URL` optional
