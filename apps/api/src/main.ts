// Load .env files BEFORE bootstrapObs so OBS_* settings are honored in
// dev/local where they live in apps/api/.env (or repo-root .env). Production
// (DO App Platform / Vercel) injects env at the runtime level so this is a
// no-op there. Nest's ConfigModule re-reads later — that's fine, dotenv
// silently skips already-set keys.
import { config as dotenvConfig } from "dotenv"
import { resolve as resolvePath } from "node:path"

dotenvConfig({ path: resolvePath(__dirname, "..", ".env") })
dotenvConfig({ path: resolvePath(__dirname, "..", "..", "..", ".env") })

// Observability MUST be initialized before any other import so the OTel SDK
// can install its module-load hooks for http, pg, ioredis, etc. The bootstrap
// returns a Promise but the underlying NodeSDK.start() is synchronous, so the
// hooks are registered before subsequent imports run. Gated on OBS_ENABLED=1
// inside the bootstrap function — at OBS_ENABLED=0 (default) it returns early.
import { bootstrap as bootstrapObs, isStarted as obsIsStarted } from "@omnichat/observability/node"

void bootstrapObs({ serviceName: "omnichat-api" }).catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[observability] bootstrap failed:", err)
})

import "reflect-metadata"

import { ValidationPipe, VersioningType } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { ConfigService } from "@nestjs/config"
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger"
import helmet from "helmet"
import { Logger } from "nestjs-pino"
import * as Sentry from "@sentry/node"
import { trace } from "@opentelemetry/api"
import { createSentryBridge } from "@omnichat/observability"
import { resolve } from "node:path"

import { AppModule } from "./app.module"
import { HttpExceptionFilter } from "./common/filters/http-exception.filter"
import { RedisIoAdapter } from "./modules/realtime/adapters/redis-io.adapter"

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  })

  app.useLogger(app.get(Logger))
  app.enableShutdownHooks()

  const config = app.get(ConfigService)

  const sentryDsn = String(config.get("SENTRY_DSN") ?? "")
  const sentryRelease = String(config.get("SENTRY_RELEASE") ?? "").trim()
  const sentryEnvOverride = String(config.get("SENTRY_ENVIRONMENT") ?? "").trim()
  const traceRateRaw = String(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "").trim()
  const defaultTraceRate = String(config.get("NODE_ENV") ?? "development") === "production" ? 0.05 : 0
  const configuredTraceRate = traceRateRaw ? Number(traceRateRaw) : defaultTraceRate
  const tracesSampleRate = Number.isFinite(configuredTraceRate)
    ? Math.max(0, Math.min(configuredTraceRate, 1))
    : defaultTraceRate
  if (sentryDsn) {
    // Ensure stable stack frame paths across environments so uploaded sourcemaps match.
    // We want frames like: app:///apps/api/dist/main.js
    const monorepoRoot = resolve(__dirname, "../../..")

    // OTel <-> Sentry bridge: tags Sentry events with otel.trace_id / otel.span_id
    // (so an issue page links back to the matching Tempo trace) and stamps the
    // active span with sentry.event_id (so a trace links forward to the issue).
    // No-op when OBS_ENABLED=0 because getActiveSpan() returns undefined.
    const bridge = createSentryBridge({
      sentryClient: { getOptions: () => ({}) },
      getActiveSpan: () => trace.getActiveSpan(),
    })

    Sentry.init({
      dsn: sentryDsn,
      tracesSampleRate,
      environment: sentryEnvOverride || String(config.get("NODE_ENV") ?? "development"),
      integrations: [Sentry.rewriteFramesIntegration({ root: monorepoRoot })],
      ...(sentryRelease ? { release: sentryRelease } : {}),
      beforeSend: bridge.beforeSend as unknown as NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>["beforeSend"]>,
      // M2 review fix (round 5): only skip Sentry's OTel setup when our own
      // NodeSDK actually started. At OBS_ENABLED=0 (default), bootstrapObs()
      // returns early without registering any TracerProvider — if we still
      // pass skipOpenTelemetrySetup we silently kill Sentry's own tracing
      // path that pre-M2 builds depended on. With OBS_ENABLED=1, our SDK is
      // registered and we tell Sentry to defer to it (avoiding the dual
      // provider stack that splits spans across two pipelines).
      ...(obsIsStarted() ? { skipOpenTelemetrySetup: true } : {}),
    })

    Sentry.addEventProcessor(
      bridge.eventProcessor as unknown as Parameters<typeof Sentry.addEventProcessor>[0],
    )
  }

  // Primary API is classic REST under /v1.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })

  app.use(
    helmet({
      // Keep defaults; tune CSP once web is integrated.
      contentSecurityPolicy: false,
    }),
  )

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  app.useGlobalFilters(new HttpExceptionFilter(app.get(Logger)))

  const redisIoAdapter = new RedisIoAdapter(app, config)
  await redisIoAdapter.connectToRedis()
  app.useWebSocketAdapter(redisIoAdapter)
  const corsOrigins = String(config.get("CORS_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  })

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Omnichat API")
    .setDescription("Classic NestJS REST API. Source of truth: OpenAPI (/docs).")
    .setVersion("1")
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup("docs", app, document)

  const port = Number(config.get("PORT") ?? 4121)
  await app.listen(port, "0.0.0.0")
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console 
  console.error("API bootstrap failed", err)
  process.exit(1)
})
