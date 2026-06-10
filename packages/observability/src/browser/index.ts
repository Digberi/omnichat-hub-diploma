import { ZoneContextManager } from "@opentelemetry/context-zone"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { registerInstrumentations } from "@opentelemetry/instrumentation"
import { Resource } from "@opentelemetry/resources"
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base"
import { BatchSpanProcessor, WebTracerProvider } from "@opentelemetry/sdk-trace-web"

import { buildResource } from "../core/resource"
import {
  buildBrowserInstrumentations,
  type BrowserInstrumentationName,
} from "./instrumentations"

export interface BrowserBootstrapOptions {
  serviceName: string
  instrumentations: BrowserInstrumentationName[]
  exporter: { endpoint: string; headers?: Record<string, string> }
  /** Defaults to NEXT_PUBLIC_OBS_DEPLOYMENT_ENV, then "local". */
  deploymentEnv?: string
  /** Defaults to 0.05 in production, 1.0 elsewhere. */
  probability?: number
}

let started = false

/**
 * Bootstrap OTel for the browser runtime (Next.js client / SPA).
 *
 * Synchronous: WebTracerProvider.register() is sync. Idempotent. No-op when
 * the exporter endpoint is missing (treated as "observability disabled").
 *
 * Uses ZoneContextManager so async work (fetch chains, setTimeout) keeps a
 * coherent active span. Default sampler ratio is 5% in production to keep
 * Tempo costs predictable; dev gets 100%.
 */
export function bootstrap(options: BrowserBootstrapOptions): void {
  if (started) return
  if (!options.exporter.endpoint) return

  const deploymentEnv =
    options.deploymentEnv ??
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_OBS_DEPLOYMENT_ENV
      : undefined) ??
    "local"
  const probability =
    options.probability ?? (deploymentEnv === "production" ? 0.05 : 1.0)

  const builtResource = buildResource({
    serviceName: options.serviceName,
    deploymentEnv,
  })
  const resource = new Resource(builtResource.attributes as Record<string, string>)

  const exporter = new OTLPTraceExporter({
    url: `${options.exporter.endpoint}/v1/traces`,
    ...(options.exporter.headers ? { headers: options.exporter.headers } : {}),
  })
  const batch = new BatchSpanProcessor(exporter, {
    maxQueueSize: 100,
    scheduledDelayMillis: 5000,
  })

  const provider = new WebTracerProvider({
    resource,
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(probability) }),
    spanProcessors: [batch],
  })

  provider.register({ contextManager: new ZoneContextManager() })

  registerInstrumentations({
    instrumentations: buildBrowserInstrumentations(options.instrumentations),
  })

  started = true
}

export function isStarted(): boolean {
  return started
}

export { injectTraceparentIntoHeaders, getCurrentTraceparent } from "./trace-propagator"
