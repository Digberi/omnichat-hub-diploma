import { describe, expect, it, vi } from "vitest"
import { wrapSocketEmit, extractTraceparentFromPayload } from "./socket-io-middleware"
import { trace } from "@opentelemetry/api"

describe("wrapSocketEmit", () => {
  it("attaches __obs.traceparent to outbound payload", () => {
    const span = {
      spanContext: () => ({
        traceId: "trc1".padEnd(32, "0"),
        spanId: "spn1".padEnd(16, "0"),
        traceFlags: 1,
      }),
    }
    vi.spyOn(trace, "getActiveSpan").mockReturnValue(span as any)
    const emit = vi.fn()
    const wrapped = wrapSocketEmit(emit)
    wrapped("message.new", { id: "m1" })
    expect(emit).toHaveBeenCalledWith(
      "message.new",
      expect.objectContaining({
        id: "m1",
        __obs: expect.objectContaining({ traceparent: expect.stringContaining("00-") }),
      }),
    )
  })

  it("preserves traceFlags=00 when parent span was not sampled", () => {
    const span = {
      spanContext: () => ({
        traceId: "abc1".padEnd(32, "0"),
        spanId: "def1".padEnd(16, "0"),
        traceFlags: 0,
      }),
    }
    vi.spyOn(trace, "getActiveSpan").mockReturnValue(span as any)
    const emit = vi.fn()
    const wrapped = wrapSocketEmit(emit)
    wrapped("message.new", { id: "m1" })
    const callArg = emit.mock.calls[0][1] as any
    expect(callArg.__obs.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/)
  })
})

describe("extractTraceparentFromPayload", () => {
  it("returns traceparent string when present", () => {
    expect(extractTraceparentFromPayload({ __obs: { traceparent: "00-x-y-01" } })).toBe("00-x-y-01")
  })

  it("returns undefined when missing", () => {
    expect(extractTraceparentFromPayload({})).toBeUndefined()
  })
})
