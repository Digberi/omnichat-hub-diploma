import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import type { Instrumentation } from "@opentelemetry/instrumentation"
import type { IncomingMessage } from "node:http"

/**
 * Paths whose HTTP spans are deliberately dropped at the source. Health probes
 * fire once every ~10 seconds per replica from the load balancer, and each
 * request expands to ~12 spans through the http + express + nest
 * auto-instrumentation chain. Two replicas × 8640/day × 12 ≈ 200k useless
 * spans/day -- pure noise that drowns out real traffic in Tempo.
 *
 * The api still logs the request via pino, so liveness/readiness investigations
 * stay possible through Loki without paying for the trace storage.
 */
const HEALTH_PATHS = new Set(["/health", "/ready"])

function isHealthProbe(req: IncomingMessage): boolean {
  const raw = req.url ?? ""
  // Strip query string before comparison; LB probes are clean but be defensive.
  const path = raw.split("?", 1)[0]
  return HEALTH_PATHS.has(path)
}

/**
 * Build the default Node auto-instrumentation set for omnichat services.
 *
 * Disables noisy low-level instrumentations (fs, net, dns) and the Express
 * middleware-level spans (one span per query/helmet/cors/expressInit/router
 * middleware per request -- low signal, high volume). Explicitly enables the
 * ones we care about for the api/workers runtimes.
 */
export function buildAutoInstrumentations(): Instrumentation[] {
  return getNodeAutoInstrumentations({
    "@opentelemetry/instrumentation-fs": { enabled: false },
    "@opentelemetry/instrumentation-net": { enabled: false },
    "@opentelemetry/instrumentation-dns": { enabled: false },
    // Express middleware spans (middleware - query, middleware - helmetMiddleware,
    // middleware - expressInit, middleware - corsMiddleware, request handler - /*,
    // request handler - /:route, middleware - jsonParser, middleware -
    // urlencodedParser) generate 7+ low-signal spans per request. Disable them;
    // we keep HTTP server span + nestjs-core controller span which carry the
    // useful context.
    "@opentelemetry/instrumentation-express": { enabled: false },
    "@opentelemetry/instrumentation-http": {
      enabled: true,
      ignoreIncomingRequestHook: isHealthProbe,
    },
    "@opentelemetry/instrumentation-pg": { enabled: true },
    "@opentelemetry/instrumentation-ioredis": { enabled: true },
    "@opentelemetry/instrumentation-socket.io": { enabled: true },
    // Note: instrumentation-bullmq is not in @opentelemetry/auto-instrumentations-node
    // 0.55.x. BullMQ spans are emitted via manual instrumentation in workers if needed.
  })
}
