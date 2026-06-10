import { registerOTel } from "@vercel/otel"

import { parseObsEnv } from "../core/env"

export interface VercelBootstrapOptions {
  serviceName: string
}

let started = false

/**
 * Bootstrap OpenTelemetry on Vercel (Next.js serverless / edge runtimes).
 *
 * Idempotent. No-op when OBS_ENABLED!=1.
 *
 * `@vercel/otel` reads OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_HEADERS
 * directly from process.env. We mirror our omnichat-prefixed vars
 * (OBS_OTLP_ENDPOINT / OBS_OTLP_HEADERS) into those names if they aren't
 * already set, so consumers only have to configure one env contract.
 */
export async function bootstrap(options: VercelBootstrapOptions): Promise<void> {
  if (started) return
  const env = parseObsEnv()
  if (!env.enabled) return

  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT && env.otlpEndpoint) {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = env.otlpEndpoint
  }
  if (!process.env.OTEL_EXPORTER_OTLP_HEADERS && Object.keys(env.otlpHeaders).length > 0) {
    process.env.OTEL_EXPORTER_OTLP_HEADERS = Object.entries(env.otlpHeaders)
      .map(([k, v]) => `${k}=${v}`)
      .join(",")
  }

  registerOTel({
    serviceName: options.serviceName,
    traceExporter: "auto",
    propagators: ["tracecontext", "baggage"],
    attributes: {
      "deployment.environment": env.deploymentEnv,
      ...(env.serviceVersion ? { "service.version": env.serviceVersion } : {}),
    },
    instrumentations: [],
  })

  started = true
}

export function isStarted(): boolean {
  return started
}
