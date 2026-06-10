import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { registerInstrumentations } from "@opentelemetry/instrumentation"
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch"
import { Resource } from "@opentelemetry/resources"
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base"
import { BatchSpanProcessor, WebTracerProvider } from "@opentelemetry/sdk-trace-web"

import { buildResource } from "../core/resource"

export interface ExpoBootstrapOptions {
  serviceName: string
  exporter: { endpoint: string; headers?: Record<string, string> }
  /** Defaults to EXPO_PUBLIC_OBS_DEPLOYMENT_ENV, then "local". */
  deploymentEnv?: string
  /** Defaults to 0.05 in production, 1.0 elsewhere. */
  probability?: number
}

let started = false

/**
 * Bootstrap OTel for Expo / React Native.
 *
 * RN-compatible subset of the browser adapter:
 * - Uses WebTracerProvider (works in JS engines without Node APIs).
 * - Only FetchInstrumentation — no document-load (no DOM) and no
 *   user-interaction (RN events aren't DOM events).
 * - No ZoneContextManager — RN doesn't bundle zone.js, and pulling it in
 *   would bloat the app and isn't needed for fetch span correlation.
 *
 * Idempotent. No-op when the exporter endpoint is missing.
 */
export function bootstrap(options: ExpoBootstrapOptions): void {
  if (started) return
  if (!options.exporter.endpoint) return

  const deploymentEnv =
    options.deploymentEnv ??
    (typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_OBS_DEPLOYMENT_ENV
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

  const provider = new WebTracerProvider({
    resource,
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(probability) }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  })

  provider.register()

  registerInstrumentations({
    instrumentations: [new FetchInstrumentation({ propagateTraceHeaderCorsUrls: [/.*/] })],
  })

  started = true
}

export function isStarted(): boolean {
  return started
}
