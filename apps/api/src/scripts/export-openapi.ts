import "reflect-metadata"

import { NestFactory } from "@nestjs/core"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { VersioningType } from "@nestjs/common"
import { writeFile } from "node:fs/promises"

function setDefaultEnv(key: string, value: string) {
  if (!process.env[key] || String(process.env[key]).trim().length === 0) {
    process.env[key] = value
  }
}

async function main() {
  // Make OpenAPI export runnable in CI without secrets or infra.
  setDefaultEnv("NODE_ENV", "test")
  setDefaultEnv("PORT", "4121")
  setDefaultEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/omnichat")
  setDefaultEnv("REDIS_URL", "redis://localhost:6379")
  setDefaultEnv("JWT_ACCESS_SECRET", "openapi_export_dummy_access_secret_0123456789abcdef")
  setDefaultEnv("JWT_REFRESH_SECRET", "openapi_export_dummy_refresh_secret_0123456789abcdef")
  setDefaultEnv("AUTH_OTP_PEPPER", "openapi_export_dummy_otp_pepper_0123456789abcdef")
  setDefaultEnv("INFISICAL_CLIENT_ID", "00000000-0000-0000-0000-000000000000")
  setDefaultEnv("INFISICAL_CLIENT_SECRET", "openapi-export-dummy-infisical-client-secret-0000000000000000")
  setDefaultEnv("INFISICAL_KMS_KEY_ID", "openapi-export-dummy-infisical-kms-key-id")
  setDefaultEnv("OLX_CLIENT_ID", "openapi-export-dummy-olx-client-id")
  setDefaultEnv("OLX_CLIENT_SECRET", "openapi-export-dummy-olx-client-secret")
  setDefaultEnv("OLX_REDIRECT_URL", "http://localhost:4121/v1/channel-accounts/olx/callback")

  // Important: AppModule import triggers env validation (ConfigModule.forRoot),
  // so we must set defaults before importing it.
  const { AppModule } = await import("../app.module")

  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })

  // Keep paths consistent with runtime.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Omnichat API")
    .setDescription("Classic NestJS REST API. Source of truth: OpenAPI (/docs).")
    .setVersion("1")
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  await writeFile("openapi.json", JSON.stringify(document, null, 2), "utf8")

  await app.close()
  // BullMQ + ioredis emit "Connection is closed" error events during the
  // graceful shutdown sequence — Node's default unhandled-error handler
  // crashes the process with exit 1 even though `openapi.json` was written
  // successfully. Skip the rest of the event loop with an explicit exit 0.
  process.exit(0)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("OpenAPI export failed", err)
  process.exit(1)
})
