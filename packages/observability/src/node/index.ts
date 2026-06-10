import { metrics, type Meter } from "@opentelemetry/api"
import { logs } from "@opentelemetry/api-logs"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { Resource } from "@opentelemetry/resources"
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs"
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { ParentBasedSampler, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base"

import { parseObsEnv } from "../core/env"
import { setDefaultRedactor } from "../core/redact"
import { buildResource } from "../core/resource"
import { buildAutoInstrumentations } from "./auto-instrumentations"

export interface BootstrapOptions {
  serviceName: string
}

let started = false
let sdk: NodeSDK | undefined
let loggerProvider: LoggerProvider | undefined
let meterProvider: MeterProvider | undefined

/**
 * Returns the LoggerProvider configured by bootstrap(), or undefined if
 * bootstrap was skipped / hasn't run yet. Consumers should prefer this over
 * the global logs.setGlobalLoggerProvider plumbing: the global is fragile
 * (the SDK ecosystem has occasionally installed competing NoopLoggerProviders
 * post-bootstrap, leaving logger.emit() as a silent no-op).
 */
export function getLoggerProvider(): LoggerProvider | undefined {
  return loggerProvider
}

/**
 * Returns the MeterProvider configured by bootstrap(), or undefined if
 * bootstrap was skipped / hasn't run yet. See getLoggerProvider for the same
 * rationale (prefer direct binding over the api/metrics global).
 */
export function getMeterProvider(): MeterProvider | undefined {
  return meterProvider
}

/**
 * Convenience wrapper around getMeterProvider().getMeter(name) with a
 * safe fallback to the global meter when bootstrap was skipped (the global
 * returns a no-op meter in that case, so emit() calls are silent).
 */
export function getMeter(name: string, version?: string): Meter {
  const provider = meterProvider
  if (provider) {
    return version !== undefined ? provider.getMeter(name, version) : provider.getMeter(name)
  }
  return version !== undefined ? metrics.getMeter(name, version) : metrics.getMeter(name)
}

/**
 * Bootstrap the OpenTelemetry Node SDK for the api/workers runtime.
 *
 * Idempotent: subsequent calls are no-ops. Returns early if `OBS_ENABLED!=1`.
 *
 * Server-side head sampling is 100% (TraceIdRatioBased(1.0)); the OTel
 * Collector tail-samples downstream. ParentBasedSampler ensures we honor
 * upstream sampling decisions when a parent context exists.
 */
export async function bootstrap(options: BootstrapOptions): Promise<void> {
  if (started) return
  const env = parseObsEnv()
  if (!env.enabled) return

  // Wire OBS_EXTRA_REDACT_KEYS into the active redactor so operator-supplied
  // key patterns take effect for the pino transport, the Nest interceptor,
  // and any other site that imports `redact` from the core barrel.
  if (env.extraRedactKeys.length > 0) {
    setDefaultRedactor({ extraKeys: env.extraRedactKeys })
  }

  const builtResource = buildResource({
    serviceName: options.serviceName,
    deploymentEnv: env.deploymentEnv,
    ...(env.serviceVersion !== undefined ? { serviceVersion: env.serviceVersion } : {}),
  })
  const resource = new Resource(builtResource.attributes as Record<string, string>)

  const traceExporter = new OTLPTraceExporter({
    url: `${env.otlpEndpoint}/v1/traces`,
    headers: env.otlpHeaders,
  })
  const logExporter = new OTLPLogExporter({
    url: `${env.otlpEndpoint}/v1/logs`,
    headers: env.otlpHeaders,
  })
  const sampler = new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(1.0) })

  // Build the metric reader first and pass it to NodeSDK so the SDK
  // registers a single MeterProvider as the GLOBAL one before
  // sdk.start() loads auto-instrumentations. Previous attempt created
  // a separate MeterProvider after sdk.start() and called
  // metrics.setGlobalMeterProvider() too late -- http instrumentation
  // had already cached the NoopMeter and silently dropped every
  // emitted metric. Same race we hit with the LoggerProvider; same fix:
  // hand the provider to the SDK so it owns the lifecycle.
  const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${env.otlpEndpoint}/v1/metrics`,
      headers: env.otlpHeaders,
    }),
    exportIntervalMillis: 30_000,
  })

  sdk = new NodeSDK({
    resource,
    traceExporter,
    sampler,
    metricReader,
    instrumentations: buildAutoInstrumentations(),
  })

  sdk.start()

  // Capture the SDK-managed MeterProvider so getMeter() can bind to it
  // directly. metrics.getMeterProvider() returns the global the SDK just
  // registered.
  meterProvider = metrics.getMeterProvider() as MeterProvider

  // Logs provider is managed separately because NodeSDK's logs handling
  // varies across versions; setting it explicitly is the safe path.
  loggerProvider = new LoggerProvider({ resource })
  loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter))
  logs.setGlobalLoggerProvider(loggerProvider)

  started = true

  process.on("SIGTERM", async () => {
    try {
      await sdk?.shutdown()
    } catch {
      // best-effort
    }
    try {
      await loggerProvider?.shutdown()
    } catch {
      // best-effort
    }
    try {
      await meterProvider?.shutdown()
    } catch {
      // best-effort
    }
  })
}

export function isStarted(): boolean {
  return started
}

export { buildPinoStream } from "./pino-transport"
export { withQueueSpan, type QueueSpanOptions } from "./queue-span"
