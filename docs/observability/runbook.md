# Observability Runbook

Three procedures for the most common on-call scenarios.

## Procedure 1: Service is slow

Signal: latency alert, user complaint, p95 spike.

1. Open Tempo (Grafana → Explore → Tempo datasource)
2. Service map: filter by `service.name = "omnichat-api"` and time window of the issue
3. Identify slow span by sorting on duration. Click into the trace.
4. Within the trace, find the longest span — usually a DB query, external call, or queue wait
5. For a DB query: copy the SQL from span attributes, run EXPLAIN locally to understand
6. For an external call: check the next span's attributes for the upstream URL and status
7. For correlated logs: copy `trace_id` from the trace header → switch to Loki datasource → query `{} | trace_id="<id>"` to see all log lines from this request

## Procedure 2: Errors spiking

Signal: Sentry alert, increased 5xx on Vercel/DO.

1. Open Sentry → omnichat-ei org → identify the spiking issue
2. Click the issue → see exception type, message, frequency, recent occurrences
3. Click any recent event → in tags, find `otel.trace_id` (added by our bridge)
4. Copy the trace ID → open Tempo → search by trace ID → see the full trace tree leading to the error
5. The root span shows which endpoint/queue job triggered. Child spans show what was attempted before failure.
6. For full context: switch to Loki, query `{} | trace_id="<id>"` for surrounding log lines

## Procedure 3: Collector down

Signal: spans/logs stop arriving in Grafana, even though apps are healthy.

1. Check DO console: is the `omnichat-otelcol-prod` droplet up? Health monitoring metrics?
2. SSH in: `ssh root@<public-ip>` (key from doctl compute ssh-key list)
3. `systemctl status otelcol-contrib` — should be active. If not, `systemctl restart otelcol-contrib`
4. `journalctl -u otelcol-contrib -n 100` — look for errors. Common: Grafana Cloud auth expired, OOM, disk full
5. Check buffer: `ls -lah /var/lib/otelcol/queue/` — queue files accumulating means upstream Grafana Cloud is down or auth is broken
6. Check connectivity: `curl -v https://otlp-gateway-prod-eu-west-2.grafana.net/` (should return 4xx, not connection refused)
7. If creds rotated: update Pulumi secret `grafanaOtlpAuth`, run `pulumi up` to redeploy collector with new userdata
8. While collector is down: api/workers buffer in-memory for ~5 min. Beyond that, telemetry loss. Sentry continues independently.
9. Rollback option: set `OBS_ENABLED=0` in DO App env (via Pulumi or manually) to bypass collector entirely. Sentry tracing takes over via `withQueueSpan` Sentry path.

## Emergency: kill switch

If observability infrastructure is causing application instability:

1. Pulumi: `pulumi config set OBS_ENABLED 0` (in api+workers env block)
2. `pulumi up` (rolling deploy ~3-5 min)
3. Apps continue running — bootstrap returns early, no telemetry, but pino-loki direct shipping (when `OBS_ENABLED=0` it's re-enabled automatically) still works for log delivery.
