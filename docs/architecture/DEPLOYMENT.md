# Deployment Guide

This repository now includes a production-oriented compose baseline and a separate monitoring stack.

## 1. Prepare production env file

1. Copy `infra/compose/.env.prod.example` to `infra/compose/.env.prod`.
2. Fill real secrets and external URLs.
3. Validate that all required vars in `docs/architecture/PROD_ENV_MATRIX.md` are set.

Important:
- never commit `infra/compose/.env.prod`
- use secret manager / CI secrets in real environments

## 2. Build and run production stack

From repository root:

```bash
cp infra/compose/.env.prod.example infra/compose/.env.prod
# edit infra/compose/.env.prod
pnpm infra:prod:up
```

This starts:
- `postgres`
- `redis`
- `minio` + bootstrap lifecycle setup
- `api`
- `workers`
- `web`

Stop:

```bash
pnpm infra:prod:down
```

## 3. Run migrations and seed (initial only)

When DB is first created:

```bash
pnpm --filter @omnichat/db prisma:migrate:deploy
pnpm --filter @omnichat/db prisma:seed
```

## 4. Health checks

- API health: `GET /health`
- API readiness: `GET /ready`
- Workers health: `GET /health` on workers port (`WORKERS_PORT`, default `4122`)
- Workers readiness: `GET /ready` on workers port

Examples:

```bash
curl http://localhost:4121/health
curl http://localhost:4121/ready
curl http://localhost:4122/health
curl http://localhost:4122/ready
```

## 5. Sentry release + sourcemaps

For CI release automation:
- set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_*`
- set `SENTRY_RELEASE` to your build SHA/tag

Scripts:
- API sourcemaps: `pnpm sentry:upload:api`
- Workers sourcemaps: `pnpm sentry:upload:workers`
- Web sourcemaps: uploaded during Next.js build when Sentry vars are present

## 6. Mobile push production validation

Expo Go cannot validate remote push on SDK 53+.

Use dev client or release build:
1. install/open dev client build on a physical device
2. login in mobile app
3. open Settings -> Push
4. verify:
   - permission is granted
   - token is shown and registration timestamp appears
5. toggle prefs and save
6. send test incoming event and confirm push opens the target chat (deep link)


## Hosted production baseline via Pulumi

The canonical hosted deployment path is now `infra/pulumi` with one `prod` stack in `fra1`.

### Topology

- `app.<domain>` -> `Vercel` (`apps/web` only)
- `api.<domain>` -> `DigitalOcean App Platform` public service (`apps/api`)
- `workers` -> `DigitalOcean App Platform` worker component (`apps/workers`)
- `PostgreSQL` -> `DigitalOcean Managed Database`
- `Redis/Valkey` -> `DigitalOcean Managed Database`
- `attachments + short-links` -> `DigitalOcean Spaces`
- `Cloudflare` -> authoritative DNS and domain control plane
- `Pulumi Cloud` -> state backend

### Runtime model

- `api` and `workers` are built from the existing repo Dockerfiles, not buildpacks.
- `api` receives `PUBLIC_WEB_URL`, `CORS_ORIGINS`, `WS_ALLOWED_ORIGINS`, S3-compatible Spaces credentials, Sentry config, Loki config, and a protected `/metrics` token.
- `workers` receive shared DB/Redis/storage credentials, Sentry config, Loki config, and their own `/metrics` token.
- `web` is managed in Vercel and receives `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_WS_PATH`, and Sentry env.

### Provisioning flow

1. Set provider auth env vars: `PULUMI_ACCESS_TOKEN`, `DIGITALOCEAN_TOKEN`, `CLOUDFLARE_API_TOKEN`, `VERCEL_API_TOKEN`.
2. Initialize `prod` stack in `infra/pulumi`.
3. Set required stack config and secrets from `infra/pulumi/README.md`.
   If the domain zone already exists in Cloudflare, set `cloudflareZoneId` and do not create a new zone.
4. Run `pnpm --filter @omnichat/pulumi-infra preview`.
5. Run `pnpm --filter @omnichat/pulumi-infra up`.
6. If Pulumi created the zone, delegate registrar nameservers to the Cloudflare nameservers from Pulumi outputs.
7. Wait for DNS propagation, then verify `https://app.<domain>` and `https://api.<domain>/health`.

### Notes

- Cloudflare remains DNS-only for `app.<domain>` in v1; we do not place a reverse-proxy layer in front of Vercel.
- `api.<domain>` is attached as a DigitalOcean App Platform custom domain and published as a DNS-only CNAME in Cloudflare.
- Existing `infra/compose/docker-compose.prod.yml` stays as a local/fallback ops path, but Pulumi is the canonical hosted control plane.
- Hosted deployments now include a mandatory `PRE_DEPLOY` App Platform job named `db-migrate` that runs `pnpm --filter @omnichat/db prisma:migrate:deploy` before new app code is switched live.
- That means schema migrations are part of every hosted deployment. Seed data remains a separate manual/staging concern and is not run automatically in production.
- Critical resources are protected in Pulumi (`protect: true`) to prevent accidental destructive changes to the DO project, managed databases, Spaces bucket, runtime app, and Vercel project.
- GitHub Actions now provide separate workflows for preview, deploy, drift detection, and IaC security:
  - `.github/workflows/infra-preview.yml`
  - `.github/workflows/infra-deploy.yml`
  - `.github/workflows/infra-drift.yml`
  - `.github/workflows/iac-security.yml`
- Use `docs/architecture/RELEASE_RUNBOOK.md` as the operational source of truth for deploy, rollback, verification, and drift handling.
