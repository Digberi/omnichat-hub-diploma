import * as Sentry from "@sentry/nextjs"
import { trace } from "@opentelemetry/api"
import { createSentryBridge } from "@omnichat/observability"

const dsn = process.env.SENTRY_DSN
const release = process.env.SENTRY_RELEASE || process.env.NEXT_PUBLIC_SENTRY_RELEASE
const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV
const defaultTracesSampleRate = process.env.NODE_ENV === "production" ? 0.05 : 0.1
const rawTracesSampleRate = process.env.SENTRY_TRACES_SAMPLE_RATE

// OTel <-> Sentry bridge for Node SSR. No-op when Vercel obs bootstrap (instrumentation.ts)
// didn't run -- getActiveSpan() returns undefined and the bridge becomes a passthrough.
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
