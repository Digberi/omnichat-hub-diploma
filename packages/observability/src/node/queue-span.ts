import { SpanStatusCode, trace } from "@opentelemetry/api"
import * as Sentry from "@sentry/node"

export interface QueueSpanOptions {
  name: string
  op?: string
  attributes?: Record<string, string | number | boolean>
}

/**
 * Run `fn` inside a tracing span. Prefers Sentry when a client is registered
 * — that path preserves prod tracing during the OBS_ENABLED=0 rollout
 * window, when the OTel SDK is not yet bootstrapped. Once both are running,
 * the Sentry-OTel bridge stamps the OTel trace_id onto Sentry spans so they
 * correlate with auto-instrumented pg/redis/etc spans.
 *
 * Fallback path (no Sentry): start an OTel span directly. When the OTel SDK
 * is bootstrapped (OBS_ENABLED=1 + LGTM stack scenario), this captures the
 * span; when it isn't, the API returns a no-op tracer and the call is
 * effectively `fn()` — but the same code shape works in both worlds, so
 * future bootstraps light up automatically without a code change.
 */
export async function withQueueSpan<T>(
  options: QueueSpanOptions,
  fn: () => Promise<T>,
): Promise<T> {
  if (Sentry.getClient()) {
    return Sentry.startSpan(
      {
        name: options.name,
        op: options.op ?? "queue.process",
        attributes: options.attributes ?? {},
      },
      () => fn(),
    )
  }

  const tracer = trace.getTracer("@omnichat/observability/queue")
  return tracer.startActiveSpan(
    options.name,
    { attributes: options.attributes ?? {} },
    async (span) => {
      try {
        const result = await fn()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (err) {
        const e = err as Error
        span.recordException(e)
        span.setStatus({ code: SpanStatusCode.ERROR, message: e.message })
        throw err
      } finally {
        span.end()
      }
    },
  )
}
