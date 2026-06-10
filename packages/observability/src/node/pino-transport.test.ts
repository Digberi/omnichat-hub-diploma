import { logs as logsApi } from "@opentelemetry/api-logs"
import { LoggerProvider } from "@opentelemetry/sdk-logs"
import pino from "pino"
import { beforeEach, describe, expect, it } from "vitest"

import { InMemoryLogProcessor } from "../testing/no-op"
import { buildPinoStream } from "./pino-transport"

describe("buildPinoStream", () => {
  let processor: InMemoryLogProcessor
  let provider: LoggerProvider

  beforeEach(() => {
    // Reset the global logger provider so each test sees a fresh delegate.
    // The api-logs setGlobalLoggerProvider is sticky once set, so without
    // disable() the provider from a previous test would keep receiving emits.
    logsApi.disable()
    processor = new InMemoryLogProcessor()
    provider = new LoggerProvider()
    provider.addLogRecordProcessor(processor)
    logsApi.setGlobalLoggerProvider(provider)
  })

  it("emits one OTel log record per pino log line", async () => {
    const stream = buildPinoStream()
    const logger = pino({}, stream)
    logger.info({ foo: "bar" }, "hello")
    await new Promise((r) => setTimeout(r, 50))
    await provider.forceFlush()
    expect(processor.records.length).toBeGreaterThanOrEqual(1)
    const rec = processor.records[0]
    expect(String(rec.body)).toContain("hello")
  })

  it("propagates trace_id from active span context (smoke)", async () => {
    const stream = buildPinoStream()
    const logger = pino({}, stream)
    logger.warn("test")
    await new Promise((r) => setTimeout(r, 50))
    await provider.forceFlush()
    expect(processor.records.length).toBeGreaterThanOrEqual(1)
    const rec = processor.records[0]
    expect(rec.attributes).toBeDefined()
  })

  it("redacts Bearer tokens in the log body before emit", async () => {
    const stream = buildPinoStream()
    const logger = pino({}, stream)
    logger.info("called Authorization: Bearer secret123abc")
    await new Promise((r) => setTimeout(r, 50))
    await provider.forceFlush()
    expect(processor.records.length).toBeGreaterThan(0)
    const rec = processor.records[0]
    expect(String(rec.body)).toContain("Bearer [REDACTED]")
    expect(String(rec.body)).not.toContain("secret123abc")
  })

  it("redacts object-only logs (no msg string) before sending as OTLP body", async () => {
    const stream = buildPinoStream()
    const logger = pino({}, stream)
    logger.info({ authorization: "raw-token-abc-not-bearer-prefixed", normal: "ok" })
    await new Promise((r) => setTimeout(r, 50))
    await provider.forceFlush()
    expect(processor.records.length).toBeGreaterThan(0)
    const rec = processor.records[0]
    const body = String(rec.body)
    expect(body).not.toContain("raw-token-abc-not-bearer-prefixed")
    expect(body).toContain("[REDACTED]")
  })
})
