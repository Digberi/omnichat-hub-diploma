# Pulumi production stack

This project provisions the hosted production baseline for Omnichat:

- `apps/web` on Vercel
- `apps/api` and `apps/workers` on one DigitalOcean App Platform app
- DigitalOcean Managed PostgreSQL
- DigitalOcean Managed Valkey/Redis
- DigitalOcean Spaces for attachments and short-links
- Cloudflare DNS records, using either an existing zone or a Pulumi-managed zone

## Prerequisites

Set provider credentials in your shell or CI runner:

```bash
export PULUMI_ACCESS_TOKEN=...
export DIGITALOCEAN_TOKEN=...
export CLOUDFLARE_API_TOKEN=...
export VERCEL_API_TOKEN=...
```

## Required stack config

```bash
cd infra/pulumi
pulumi stack init Digberi/omnichat/prod
pulumi config set rootDomain example.com
pulumi config set githubRepo owner/omnichat-hub
pulumi config set --secret apiJwtAccessSecret <secret>
pulumi config set --secret apiJwtRefreshSecret <secret>
pulumi config set --secret apiAuthOtpPepper <secret>
pulumi config set --secret authDataEncryptionKey <secret>
pulumi config set --secret apiMetricsToken <secret-16-plus>
pulumi config set --secret workersMetricsToken <secret-16-plus>
```

Cloudflare config requires one of:

```bash
pulumi config set cloudflareZoneId <existing-zone-id>
```

or, if you want Pulumi to create the zone itself:

```bash
pulumi config set cloudflareAccountId <cloudflare-account-id>
```

Recommended optional config:

```bash
pulumi config set githubBranch main
pulumi config set appSubdomain app
pulumi config set apiSubdomain api
pulumi config set vercelProjectName omnichat-web
pulumi config set doProjectName omnichat-prod
pulumi config set postgresSize db-s-1vcpu-2gb
pulumi config set redisSize db-s-1vcpu-1gb
pulumi config set spacesBucketName omnichat-prod-assets
pulumi config set --secret sentryApiDsn <dsn>
pulumi config set --secret sentryWorkersDsn <dsn>
pulumi config set --secret sentryWebDsn <dsn>
pulumi config set sentryEnvironment production
pulumi config set grafanaCreateCloudStack true
pulumi config set grafanaCloudRegion <grafana-cloud-region-slug>
pulumi config set grafanaStackSlug omnichat-prod
pulumi config set grafanaStackName "Omnichat Production"
pulumi config set --secret grafanaCloudAccessPolicyToken <grafana-cloud-access-policy-token>
pulumi config set --secret grafanaLokiHost https://logs-prod-xxx.grafana.net/loki/api/v1/push
pulumi config set --secret grafanaLokiUsername <username>
pulumi config set --secret grafanaLokiPassword <password>
pulumi config set --secret grafanaPrometheusRemoteWriteUrl https://prometheus-prod-xxx.grafana.net/api/prom/push
pulumi config set --secret grafanaPrometheusUsername <username>
pulumi config set --secret grafanaPrometheusPassword <password>
```

## Usage

```bash
pnpm --filter @omnichat/pulumi-infra preview
pnpm --filter @omnichat/pulumi-infra up
```

## GitHub Actions auth model

The repo uses GitHub Actions OIDC for Pulumi Cloud authentication.

- Pulumi auth is short-lived OIDC, not a stored `PULUMI_ACCESS_TOKEN` in GitHub
- provider credentials still remain GitHub Actions secrets:
  - `DIGITALOCEAN_TOKEN`
  - `CLOUDFLARE_API_TOKEN`
  - `VERCEL_API_TOKEN`

For the current Pulumi org/plan, GitHub Actions is configured to request a `personal` Pulumi access token for user `Digberi`, scoped to this repository only.

Pulumi outputs include:

- Cloudflare zone mode and nameservers/delegation note
- hosted `app.<domain>` and `api.<domain>` URLs
- managed DB and Redis endpoints
- Spaces bucket and endpoint
- Vercel project id
- API metrics URL
- workers metrics visibility note

## Notes

- `api.<domain>` is attached as a custom domain to the DO App Platform app.
- `app.<domain>` is attached to the Vercel project and managed in Cloudflare DNS as a DNS-only CNAME.
- Cloudflare remains the authoritative DNS manager. No reverse-proxy is placed in front of Vercel in v1.
- For an already-activated domain such as `omnichat.to`, prefer `cloudflareZoneId` and let Pulumi manage only DNS records.
- `workers` remain a background component in App Platform. Their `/metrics` endpoint exists in-process but is not publicly exposed by App Platform worker mode.
- Grafana Cloud IaC is optional. When `grafanaCreateCloudStack=true` and `grafanaCloudAccessPolicyToken` is present, Pulumi can create a Grafana Cloud stack plus Loki and Prometheus ingest tokens and wire Loki credentials into API/workers automatically.
