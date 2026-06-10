import "./src/observability"

import * as Sentry from "@sentry/react-native"
import { trace } from "@opentelemetry/api"
import { createSentryBridge } from "@omnichat/observability"

import "./global.css"

import { AppRoot } from "./src/app/AppRoot"
import { env } from "./src/lib/env"

const dsn = env.sentryDsn ?? undefined

// OTel <-> Sentry bridge: tags Sentry events with otel.trace_id / otel.span_id.
// No-op when EXPO_PUBLIC_OBS_OTLP_ENDPOINT is unset (expo bootstrap then skips
// SDK init and getActiveSpan() returns undefined).
const bridge = createSentryBridge({
  sentryClient: { getOptions: () => ({}) },
  getActiveSpan: () => trace.getActiveSpan(),
})

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: env.sentryTracesSampleRate,
  ...(env.sentryEnvironment ? { environment: env.sentryEnvironment } : {}),
  ...(env.sentryRelease ? { release: env.sentryRelease } : {}),
  beforeSend: bridge.beforeSend as unknown as NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>["beforeSend"]>,
})

Sentry.addEventProcessor(
  bridge.eventProcessor as unknown as Parameters<typeof Sentry.addEventProcessor>[0],
)

export default Sentry.wrap(AppRoot)
