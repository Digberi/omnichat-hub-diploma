# Observability — Architecture

## Data flow

```
                                                                      ┌─────────────┐
   Browser (web client)                                                │             │
       │  trace + log + Sentry events                                  │   Sentry    │
       ▼                                                               │ (omnichat-  │
   ┌──────────────────────────┐                                        │     ei,     │
   │ NEXT_PUBLIC_OBS_OTLP_*   │ ──direct OTLP──┐                       │ de.sentry.io)│
   └──────────────────────────┘                │                       │             │
                                               │                       └──────△──────┘
   Mobile (Expo)                               │                              │
       │                                       │                              │ trace_id ↔ event_id
       ▼                                       ▼                              │ bidirectional bridge
   ┌──────────────────────────┐    ┌────────────────────────┐                 │
   │ EXPO_PUBLIC_OBS_OTLP_*   │ ─▶ │ Grafana Cloud          │ ◀───────────────┘
   └──────────────────────────┘    │ appomnichat.grafana.net│
                                   │  - Loki  (logs)        │
   Web SSR (Vercel functions)      │  - Tempo (traces)      │
       │                           │  - Mimir (metrics)     │
       ▼                           │  - Pyroscope (profiles)│
   ┌──────────────────────────┐    └──────────△─────────────┘
   │ OBS_OTLP_AUTH (Vercel)   │ ──direct OTLP─┘
   └──────────────────────────┘                              ┌─────────────┐
                                                             │ OTel Collector│
   API (NestJS, DO App)                                      │  s-1vcpu-1gb │
   Workers (NestJS, DO App)                                  │  on DO fra1  │
       │                                                     │  (private VPC)│
       │  bootstrapObs() in main.ts                          │              │
       │  ObservabilityModule.forRoot() in app.module.ts     │  - tail-      │
       │  Pino multistream → OTel logs                       │    sampling   │
       │  Auto-instrumentations: http, pg, ioredis,          │  - redaction  │
       │    socket.io, bullmq                                │    (defense   │
       │  Custom: withQueueSpan, ObservabilityInterceptor    │     in depth) │
       │                                                     │  - persistent │
       ▼                                                     │    queue      │
   ┌──────────────────────────┐                              │              │
   │ OBS_OTLP_ENDPOINT=       │ ──OTLP via private VPC──────▶│              │
   │ http://<priv-ip>:4318    │                              └──────────────┘
   └──────────────────────────┘                                      │
                                                                     │
                                                                     ▼ (collector forwards
                                                                       to Grafana Cloud)
```

## How to read a trace in Tempo

Open https://appomnichat.grafana.net → Explore → datasource Tempo.

TraceQL queries:
- All recent api traces: `{ service.name = "omnichat-api" }`
- Slow requests: `{ duration > 1s }`
- Errors only: `{ status = error }`
- For a specific user's recent activity: `{ omnichat.user_id = "usr_..." }`
- Channel-specific (e.g. OLX flows): `{ omnichat.channel_type = "olx" }`

Click any trace ID to expand the span tree. Each span shows attributes (omnichat.*, http.*, db.*) and events (recordException entries).

## How to find logs by trace_id in Loki

Same Explore page → datasource Loki.

LogQL queries:
- All logs from one service: `{service_name="omnichat-api"}`
- Logs for a specific trace: `{} | trace_id="<trace-id-from-tempo>"`
- Errors in last hour: `{service_name="omnichat-api"} |= "level=50"`
- Channel-sync errors: `{service_name="omnichat-workers"} |~ "channel-sync.*error"`

Each log carries `trace_id` and `span_id` fields when emitted inside an active span. Click "Show context" on a log line to see surrounding lines.

## Sentry ↔ Tempo correlation

Bidirectional bridge in `packages/observability/src/core/sentry-bridge.ts`:

- **From Sentry to Tempo**: Sentry event tags include `otel.trace_id` and `otel.span_id`. In Sentry UI, these appear as filterable tags. Click → opens the trace in Tempo via Grafana data link.
- **From Tempo/Loki to Sentry**: each OTel span carries `sentry.event_id` attribute. Search Loki/Tempo by `sentry.event_id="<uuid>"` to find every signal related to one Sentry incident.

## Per-runtime configuration

| Runtime | Bootstrap call | Subpath | Env vars |
|---|---|---|---|
| api (NestJS) | `apps/api/src/main.ts` first import | `@omnichat/observability/node` | `OBS_*`, `SENTRY_*` |
| workers (NestJS) | `apps/workers/src/main.ts` first import | `@omnichat/observability/node` | `OBS_*`, `SENTRY_*` |
| web SSR (Vercel) | `apps/web/instrumentation.ts` `register()` | `@omnichat/observability/vercel` | `OBS_*`, `SENTRY_*` |
| web client (browser) | `apps/web/src/observability.ts` (loaded by `providers.tsx`) | `@omnichat/observability/browser` | `NEXT_PUBLIC_OBS_*`, `NEXT_PUBLIC_SENTRY_*` |
| mobile (Expo) | `apps/mobile/src/observability.ts` (loaded by `App.tsx`) | `@omnichat/observability/expo` | `EXPO_PUBLIC_OBS_*`, `EXPO_PUBLIC_SENTRY_*` |

## Where to find more

- Runbook: [`./runbook.md`](./runbook.md)
- Cardinality budget: [`./cardinality-budget.md`](./cardinality-budget.md)
