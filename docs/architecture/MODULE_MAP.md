# Module Map

## API (`apps/api/src/modules`)

- `auth`: email OTP + JWT access/refresh rotation
- `workspaces`: workspace read/update
- `settings`: workspace settings (including notification prefs + auto-archive days)
- `channel-accounts`: stub channel accounts (OLX/Prom/etc)
- `conversations`: inbox folders + pin/archive/snooze mutations
- `messages`: list/send messages + attachments
- `attachments`: attachment ingestion + short link creation
- `shortlinks`: landing endpoint `/v1/s/:token`
- `search`: conversations/messages search
- `tags`: CRUD
- `statuses`: CRUD
- `templates`: categories + templates
- `notifications`: device token registration + push prefs
- `realtime`: Socket.IO gateway + Redis adapter
- `queue`: BullMQ connection for enqueueing Outbox delivery jobs
- `debug`: dev/staging outbox inspection + manual requeue endpoints (`/v1/debug/outbox/*`)
- `redis`: Redis client wrapper
- `storage`: S3-compatible storage (MinIO in local dev)
- `health`: `/health` and `/ready`
- `logging`: pino
- `prisma`: Prisma service wrapper over `@omnichat/db`
- `config`: validated env

## Workers (`apps/workers/src/modules`)

- `outbox`: poller + processor, retry/backoff, ws/push delivery
- `queue`: BullMQ connections
- `channel-sync`: stub adapters for OLX/Prom (sync jobs)
- `push`: Expo/console push provider
- `maintenance`: cleanup tasks (expired short links etc)
- `metrics`: daily rollups (`WorkspaceDailyRollup`)
- `prisma`: Prisma service wrapper
- `redis`: Redis client wrapper
- `health`: `/health` and `/ready` for worker process monitoring
- `config`: validated env
- `logging`: pino
