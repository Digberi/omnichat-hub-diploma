import { describe, expect, it, vi } from "vitest"

// Mock @sentry/node before importing the module under test so we can
// flip getClient/startSpan behavior per-test.
const sentryMocks = {
  getClient: vi.fn(),
  startSpan: vi.fn(),
}
vi.mock("@sentry/node", () => sentryMocks)

const { withQueueSpan } = await import("./queue-span")

describe("withQueueSpan", () => {
  it("falls back to OTel tracer when no Sentry client is registered", async () => {
    sentryMocks.getClient.mockReturnValue(undefined)
    const result = await withQueueSpan({ name: "x" }, async () => 42)
    expect(result).toBe(42)
    expect(sentryMocks.startSpan).not.toHaveBeenCalled()
  })

  it("propagates errors thrown inside fn under the OTel fallback", async () => {
    sentryMocks.getClient.mockReturnValue(undefined)
    await expect(
      withQueueSpan({ name: "x.process" }, async () => {
        throw new Error("kaboom")
      }),
    ).rejects.toThrow("kaboom")
    // No Sentry span should have been created in this branch.
    expect(sentryMocks.startSpan).not.toHaveBeenCalled()
  })

  it("wraps fn in Sentry.startSpan when client present", async () => {
    sentryMocks.getClient.mockReturnValue({} as any)
    sentryMocks.startSpan.mockImplementation(((_opts: any, cb: any) => cb({})) as any)
    const result = await withQueueSpan(
      { name: "workers.test", attributes: { foo: "bar" } },
      async () => "ok",
    )
    expect(result).toBe("ok")
    expect(sentryMocks.startSpan).toHaveBeenCalled()
    const opts = sentryMocks.startSpan.mock.calls.at(-1)?.[0] as any
    expect(opts.name).toBe("workers.test")
    expect(opts.op).toBe("queue.process")
    expect(opts.attributes).toEqual({ foo: "bar" })
  })

  it("propagates errors thrown inside fn", async () => {
    sentryMocks.getClient.mockReturnValue({} as any)
    sentryMocks.startSpan.mockImplementation(((_opts: any, cb: any) => cb({})) as any)
    await expect(
      withQueueSpan({ name: "x" }, async () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
  })
})
