import { describe, expect, it } from "vitest"
import { decideSample, decideAtSpanEnd } from "./sampler"

describe("decideSample", () => {
  it("samples deterministically by trace_id at given probability", () => {
    const traceId = "0123456789abcdef0123456789abcdef"
    const a = decideSample(traceId, 0.05)
    const b = decideSample(traceId, 0.05)
    expect(a).toBe(b)
  })

  it("samples 100% when probability=1", () => {
    expect(decideSample("a".repeat(32), 1.0)).toBe(true)
  })

  it("samples 0% when probability=0", () => {
    expect(decideSample("a".repeat(32), 0.0)).toBe(false)
  })

  it("respects parent decision when parentSampled is provided", () => {
    expect(decideSample("a".repeat(32), 0.0, { parentSampled: true })).toBe(true)
    expect(decideSample("a".repeat(32), 1.0, { parentSampled: false })).toBe(false)
  })
})

describe("decideAtSpanEnd", () => {
  it("keeps spans with status=ERROR regardless of probability", () => {
    expect(decideAtSpanEnd({ status: "ERROR", probabilityKept: false })).toBe(true)
  })

  it("keeps spans with recordedException=true regardless of probability", () => {
    expect(decideAtSpanEnd({ status: "OK", probabilityKept: false, recordedException: true })).toBe(true)
  })

  it("respects probability decision when no error and no exception", () => {
    expect(decideAtSpanEnd({ status: "OK", probabilityKept: false })).toBe(false)
    expect(decideAtSpanEnd({ status: "OK", probabilityKept: true })).toBe(true)
  })
})
