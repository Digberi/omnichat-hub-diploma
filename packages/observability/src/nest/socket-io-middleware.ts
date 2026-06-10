import { trace } from "@opentelemetry/api"

export function wrapSocketEmit(emit: (event: string, payload?: unknown) => unknown) {
  return (event: string, payload?: unknown) => {
    const span = trace.getActiveSpan()
    let enriched = payload
    if (span && payload && typeof payload === "object" && !Array.isArray(payload)) {
      const ctx = span.spanContext()
      const flags = ((ctx.traceFlags ?? 0) & 0xff).toString(16).padStart(2, "0")
      const traceparent = `00-${ctx.traceId}-${ctx.spanId}-${flags}`
      enriched = { ...(payload as Record<string, unknown>), __obs: { traceparent } }
    }
    return emit(event, enriched)
  }
}

export function extractTraceparentFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined
  const obs = (payload as Record<string, unknown>).__obs
  if (!obs || typeof obs !== "object") return undefined
  const tp = (obs as Record<string, unknown>).traceparent
  return typeof tp === "string" ? tp : undefined
}
