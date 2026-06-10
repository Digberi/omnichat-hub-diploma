import * as Sentry from "@sentry/nextjs"
import { trace } from "@opentelemetry/api"
import { createSentryBridge } from "@omnichat/observability"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
const release = process.env.NEXT_PUBLIC_SENTRY_RELEASE
const environment = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV
const defaultTracesSampleRate = process.env.NODE_ENV === "production" ? 0.05 : 0.1
const rawTracesSampleRate = process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE

// OTel <-> Sentry bridge: tags Sentry events with otel.trace_id / otel.span_id.
// No-op when the browser OTel bootstrap hasn't run (NEXT_PUBLIC_OBS_OTLP_ENDPOINT unset).
const bridge = createSentryBridge({
  sentryClient: { getOptions: () => ({}) },
  getActiveSpan: () => trace.getActiveSpan(),
})

Sentry.init({
  dsn: dsn && dsn.length > 0 ? dsn : undefined,
  tracesSampleRate: Math.max(
    0,
    Math.min(
      Number.isFinite(Number(rawTracesSampleRate ?? ""))
        ? Number(rawTracesSampleRate ?? "")
        : defaultTracesSampleRate,
      1,
    ),
  ),
  release: release && release.length > 0 ? release : undefined,
  environment: environment && environment.length > 0 ? environment : undefined,
  enabled: Boolean(dsn),
  beforeSend: bridge.beforeSend as unknown as NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>["beforeSend"]>,
})

Sentry.addEventProcessor(
  bridge.eventProcessor as unknown as Parameters<typeof Sentry.addEventProcessor>[0],
)
