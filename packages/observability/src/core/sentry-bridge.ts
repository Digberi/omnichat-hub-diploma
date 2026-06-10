import type { Span } from "@opentelemetry/api"

export interface SentryEvent {
  event_id?: string
  tags?: Record<string, string>
}

export interface SentryClientLike {
  on?: (...args: unknown[]) => void
  getOptions: () => unknown
}

export interface BridgeOptions {
  sentryClient: SentryClientLike
  getActiveSpan: () => Span | undefined
}

export interface SentryBridge {
  beforeSend: (event: SentryEvent) => SentryEvent
  eventProcessor: (event: SentryEvent) => SentryEvent
  setup: () => void
}

export function createSentryBridge(options: BridgeOptions): SentryBridge {
  let setupDone = false

  function beforeSend(event: SentryEvent): SentryEvent {
    if (!event.event_id) return event
    const span = options.getActiveSpan()
    if (span && span.isRecording()) {
      span.setAttribute("sentry.event_id", event.event_id)
    }
    return event
  }

  function eventProcessor(event: SentryEvent): SentryEvent {
    const span = options.getActiveSpan()
    if (!span) return event
    const ctx = span.spanContext()
    if (!ctx) return event
    event.tags = event.tags ?? {}
    event.tags["otel.trace_id"] = ctx.traceId
    event.tags["otel.span_id"] = ctx.spanId
    return event
  }

  function setup() {
    if (setupDone) return
    setupDone = true
    // Bridge is wired by callers passing beforeSend to Sentry.init({beforeSend})
    // and adding eventProcessor to Sentry.addEventProcessor().
    // setup() is a no-op marker for future hook registrations.
  }

  return { beforeSend, eventProcessor, setup }
}
