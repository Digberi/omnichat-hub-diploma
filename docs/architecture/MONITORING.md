# Monitoring and Alerting

## Stack

Monitoring stack is isolated in `infra/compose/docker-compose.monitoring.yml`:
- Prometheus
- Alertmanager
- Grafana
- Blackbox exporter

It expects the runtime network `omnichat-net` from `docker-compose.prod.yml`.

## Start/stop

```bash
pnpm infra:monitoring:up
pnpm infra:monitoring:down
```

Endpoints:
- Prometheus: `http://localhost:9090`
- Alertmanager: `http://localhost:9093`
- Grafana: `http://localhost:3001` (`admin/admin` by default)
- Blackbox exporter: `http://localhost:9115`

## What is monitored now

Blackbox probes:
- API `/health`
- API `/ready`
- Workers `/health`
- Workers `/ready`
- Web root `/`

Alert rules (`infra/monitoring/prometheus/alerts.yml`):
- `APIHealthDown`
- `APIReadinessDown`
- `WorkersHealthDown`
- `WorkersReadinessDown`
- `WebDown`
- `APIReadySlow`

## Runtime metrics + Sentry signals

API:
- `GET /v1/metrics/storage`
- `GET /v1/metrics/storage/health`
- `GET /v1/metrics/inbox`

Workers:
- Outbox backlog warning signal in Sentry:
  - `SENTRY_OUTBOX_BACKLOG_WARN`
  - `SENTRY_OUTBOX_BACKLOG_COOLDOWN_SEC`

## Alert routing

Alertmanager currently ships with a minimal default receiver config.
For production, add one or more integrations in:

`infra/monitoring/alertmanager/alertmanager.yml`

Typical routes:
- PagerDuty/Slack for `severity=critical`
- Slack/email for `severity=warning`

## Operational playbook

1. `APIReadinessDown`:
   - check DB connectivity
   - check Redis connectivity
   - check object storage connectivity
2. `WorkersReadinessDown`:
   - check DB/Redis reachability from workers network
   - check queue backlog and consumer logs
3. `WebDown`:
   - check web container health and upstream API availability
4. repeated Sentry outbox warnings:
   - inspect outbox table backlog
   - inspect worker processing errors and retry loop
   - scale workers or reduce upstream dependency latency

## Hosted production incident note: Redis socket resets

Observed on `2026-03-15` in DigitalOcean App Platform hosted production:

- `workers` emitted repeated `MaxRetriesPerRequestError` errors from `ioredis`
- the process then crashed on an unhandled `SocketClosedUnexpectedlyError` from `@redis/client`
- DigitalOcean restarted the `workers` process automatically
- `api` remained healthy during the same window, so the App Platform UI can look like an `api` or app-level failure while the actual crash is isolated to `workers`

Operational implication:

- a transient managed Redis/Valkey TLS socket close can currently escalate into a `workers` process exit instead of graceful degradation
- the first triage target must be `workers` logs, not only public API health probes

Triage signatures to look for in hosted logs:

- `MaxRetriesPerRequestError: Reached the max retries per request limit`
- `SocketClosedUnexpectedlyError: Socket closed unexpectedly`

Immediate checks:

1. confirm `https://api.omnichat.to/health` and `https://api.omnichat.to/ready`
2. inspect `workers` runtime logs in DigitalOcean App Platform
3. verify managed Redis/Valkey status in DigitalOcean
4. verify whether DigitalOcean auto-restarted the `workers` component
5. inspect Sentry for correlated worker exceptions and outbox lag


## Hosted production observability baseline

Production observability is split by concern.

### Sentry

Sentry remains the primary error and tracing backend for:

- `apps/api`
- `apps/workers`
- `apps/web`
- `apps/mobile`

Use Sentry for:

- exceptions
- distributed request traces where SDK support exists
- release health
- client-side crash and session diagnostics

### Grafana Cloud + Cloud Loki

Grafana Cloud is the managed metrics and alerting backend. Cloud Loki is the managed log backend.

- `apps/api` exposes a protected Prometheus endpoint at `/metrics`
- `apps/workers` exposes a protected Prometheus endpoint at `/metrics`, but App Platform worker mode does not expose it publicly in hosted v1
- `apps/api` and `apps/workers` can ship structured logs directly to Loki via `pino-loki`
- uptime probes should continue to target `https://app.<domain>` and `https://api.<domain>/health`
- worker restart loops caused by Redis socket instability should be treated as a first-class production signal even when public API health remains green

### Metrics auth

Both API and workers require `Authorization: Bearer <METRICS_TOKEN>` for `/metrics`.

### Operational stance

- Local and self-hosted monitoring remains available through `infra/compose/docker-compose.monitoring.yml`
- Hosted production uses managed observability, not self-hosted Prometheus/Grafana/Loki
- Worker public metrics scraping is intentionally deferred; in hosted v1 worker health is covered by Sentry, DO health, outbox/DB-derived metrics, and log-based alerts
