import { context, trace, propagation } from "@opentelemetry/api"

export function injectTraceContext(carrier: Record<string, string>): Record<string, string> {
  propagation.inject(context.active(), carrier)
  return carrier
}

export function extractTraceContext(carrier: Record<string, string>) {
  return propagation.extract(context.active(), carrier)
}

export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan()
  return span?.spanContext().traceId
}

export function getCurrentSpanId(): string | undefined {
  const span = trace.getActiveSpan()
  return span?.spanContext().spanId
}
