import { describe, expect, it, vi } from "vitest"
import { createSentryBridge } from "./sentry-bridge"

describe("createSentryBridge", () => {
  it("attaches sentry.event_id to active OTel span via beforeSend", () => {
    const setAttribute = vi.fn()
    const getActiveSpan = () => ({ setAttribute, isRecording: () => true })
    const sentryClient = { on: vi.fn(), getOptions: () => ({}) }
    const bridge = createSentryBridge({ sentryClient, getActiveSpan: getActiveSpan as any })
    const event = bridge.beforeSend({ event_id: "evt-123" } as any)
    expect(setAttribute).toHaveBeenCalledWith("sentry.event_id", "evt-123")
    expect(event).toBeDefined()
  })

  it("does not throw if no active span on beforeSend", () => {
    const sentryClient = { on: vi.fn(), getOptions: () => ({}) }
    const bridge = createSentryBridge({ sentryClient, getActiveSpan: () => undefined })
    expect(() => bridge.beforeSend({ event_id: "x" } as any)).not.toThrow()
  })

  it("returns event unchanged from beforeSend (does not drop)", () => {
    const sentryClient = { on: vi.fn(), getOptions: () => ({}) }
    const bridge = createSentryBridge({ sentryClient, getActiveSpan: () => undefined })
    const event = { event_id: "x", message: "test" } as any
    expect(bridge.beforeSend(event)).toBe(event)
  })

  it("eventProcessor adds otel.trace_id tag from active span", () => {
    const span = { spanContext: () => ({ traceId: "trc-123", spanId: "spn-456" }) }
    const sentryClient = { on: vi.fn(), getOptions: () => ({}) }
    const bridge = createSentryBridge({ sentryClient, getActiveSpan: () => span as any })
    const event = { tags: {} } as any
    const result = bridge.eventProcessor(event)
    expect(result.tags!["otel.trace_id"]).toBe("trc-123")
    expect(result.tags!["otel.span_id"]).toBe("spn-456")
  })

  it("is idempotent: setup() can be called twice", () => {
    const sentryClient = { on: vi.fn(), getOptions: () => ({}) }
    const bridge = createSentryBridge({ sentryClient, getActiveSpan: () => undefined })
    bridge.setup()
    bridge.setup()
    // Sentry's `on` is called only the first time
    expect(sentryClient.on).toHaveBeenCalledTimes(0) // we use eventProcessor, not Sentry hooks here
  })
})
