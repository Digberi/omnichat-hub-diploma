# Release Runbook

## Scope

This runbook covers the hosted production deployment path for:
- `apps/web` on Vercel
- `apps/api` and `apps/workers` on DigitalOcean App Platform
- managed Postgres, Redis/Valkey, Spaces, Cloudflare DNS, Grafana Cloud

## Preconditions

Before a production deploy:
- all required GitHub secrets and vars are set
- Cloudflare zone is active
- `Pulumi` preview passes cleanly
- CI passes `lint`, `typecheck`, `test`, `build`, `iac-security`
- on-call owner can access DigitalOcean, Vercel, Pulumi Cloud, Cloudflare, Sentry, Grafana

## Deployment path

Production deploy is driven by `.github/workflows/infra-deploy.yml`.

Flow:
1. `Pulumi` authenticates via OIDC.
2. Stack config is hydrated from GitHub vars/secrets.
3. `pulumi up --yes --skip-preview` runs.
4. DigitalOcean App Platform release executes `PRE_DEPLOY` job `db-migrate`.
5. Only after migration succeeds does new runtime code roll forward.

## Migrations policy

Rules:
- every Prisma schema change must ship via migration files
- hosted deploys always run `prisma migrate deploy`
- seeds are never part of production release automation
- destructive schema changes must use expand/migrate/contract rollout

## Post-deploy verification

Check:
1. `https://api.omnichat.to/health`
2. `https://api.omnichat.to/ready`
3. `https://app.omnichat.to`
4. web login and inbox load
5. realtime socket connect
6. workers processing and outbox flow
7. Spaces upload/read path
8. Sentry ingest
9. Grafana/Loki ingest

## Runtime triage note: Redis socket failures in workers

Observed on `2026-03-15`:

- a hosted production incident presented as an App Platform app/service problem
- public API health remained green
- the actual failing component was `workers`
- failure sequence in logs:
  - repeated `MaxRetriesPerRequestError` from `ioredis`
  - then unhandled `SocketClosedUnexpectedlyError` from `@redis/client`
  - then `workers` exited with code `1`
  - DigitalOcean auto-restarted the component

Implication:

- when DigitalOcean shows an unexpected runtime failure, do not assume `api` is the root cause
- check `workers` logs first if the app still serves `https://api.omnichat.to/health`
- a transient Redis/Valkey TLS socket reset can currently crash the `workers` process

Minimum triage path:

1. verify `https://api.omnichat.to/health`
2. verify `https://api.omnichat.to/ready`
3. inspect DigitalOcean `workers` run logs
4. look specifically for:
   - `MaxRetriesPerRequestError`
   - `SocketClosedUnexpectedlyError`
5. confirm managed Redis/Valkey status in DigitalOcean
6. confirm whether DigitalOcean already restarted the worker automatically

## Rollback

If deploy is bad but infrastructure is healthy:
1. roll back Vercel to previous deployment
2. roll back DigitalOcean App Platform to previous successful revision
3. do not roll back database schema blindly
4. if schema changed, use forward-fix or explicit rollback migration only if proven safe

## Drift detection

Scheduled workflow:
- `.github/workflows/infra-drift.yml`

Behavior:
- runs `pulumi preview --refresh --diff`
- fails if infrastructure drift or unapplied infra deltas are detected
- uploads full preview log as artifact

## Security gates

Workflow:
- `.github/workflows/iac-security.yml`

Checks:
- Checkov for Dockerfiles, compose, GitHub Actions, secret exposure
- Trivy config scan for high/critical IaC misconfigurations

## Protected resources

Critical resources are marked with Pulumi `protect: true`:
- DigitalOcean project
- managed Postgres
- managed Redis/Valkey
- Spaces bucket
- DigitalOcean App Platform runtime app
- Vercel project

Destroy or replacement of these resources requires explicit unprotect workflow.

## Known constraints

- workers do not expose public `/metrics` in current App Platform worker mode
- Grafana Cloud stack is provisioned via Pulumi, but alert topology still needs continuous tuning after first real traffic
- Cloudflare is DNS authority; Vercel remains unproxied by Cloudflare in v1
- `workers` currently depend on Redis clients that can turn a transient Redis socket close into a process crash; `api` has similar client patterns and should be treated as having the same class of risk until hardened
