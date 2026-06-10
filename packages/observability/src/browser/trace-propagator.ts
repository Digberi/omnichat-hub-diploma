import { context, propagation, trace } from "@opentelemetry/api"

/**
 * Inject the current trace context into an outgoing HTTP headers object.
 *
 * Used by the api-client to bridge browser spans to api spans without
 * relying on FetchInstrumentation (e.g. when callers stream/fetch through
 * a custom transport).
 */
export function injectTraceparentIntoHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const ctx = context.active()
  const carrier: Record<string, string> = { ...headers }
  propagation.inject(ctx, carrier)
  return carrier
}

/**
 * Returns the W3C `traceparent` header value for the currently active span,
 * or `undefined` when no span is active. Useful for stamping log lines that
 * are emitted outside of the OTel pipeline.
 */
export function getCurrentTraceparent(): string | undefined {
  const span = trace.getActiveSpan()
  if (!span) return undefined
  const ctx = span.spanContext()
  return `00-${ctx.traceId}-${ctx.spanId}-01`
}
