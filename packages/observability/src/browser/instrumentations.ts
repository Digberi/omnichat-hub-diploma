import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load"
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch"
import { UserInteractionInstrumentation } from "@opentelemetry/instrumentation-user-interaction"
import type { Instrumentation } from "@opentelemetry/instrumentation"

export type BrowserInstrumentationName = "fetch" | "document-load" | "user-interaction"

/**
 * Build the requested set of browser instrumentations. Apps opt into the
 * specific names they need so we don't ship instrumentation code that's
 * never used.
 *
 * - `fetch`: outgoing fetch() calls; propagates W3C tracecontext to all CORS
 *   targets so the api can join the trace.
 * - `document-load`: PerformanceTiming-based page-load span.
 * - `user-interaction`: click/keypress spans for UX timing.
 */
export function buildBrowserInstrumentations(
  names: BrowserInstrumentationName[],
): Instrumentation[] {
  const out: Instrumentation[] = []
  for (const name of names) {
    switch (name) {
      case "fetch":
        out.push(new FetchInstrumentation({ propagateTraceHeaderCorsUrls: [/.*/] }))
        break
      case "document-load":
        out.push(new DocumentLoadInstrumentation())
        break
      case "user-interaction":
        out.push(new UserInteractionInstrumentation())
        break
    }
  }
  return out
}
