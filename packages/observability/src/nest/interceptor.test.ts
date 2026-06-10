import { describe, expect, it, vi } from "vitest"
import { ObservabilityInterceptor } from "./interceptor"
import { ObservabilityModule } from "./index"
import { APP_INTERCEPTOR } from "@nestjs/core"
import { trace } from "@opentelemetry/api"
import { of } from "rxjs"

function makeContext(req: any) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getType: () => "http",
    getHandler: () => () => undefined,
  } as any
}

describe("ObservabilityInterceptor", () => {
  it("sets omnichat.user_id when req.user.id present", async () => {
    const setAttribute = vi.fn()
    vi.spyOn(trace, "getActiveSpan").mockReturnValue({ setAttribute, isRecording: () => true } as any)
    const interceptor = new ObservabilityInterceptor()
    const ctx = makeContext({ user: { id: "usr_123" }, params: {}, headers: {} })
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, { handle: () => of("ok") }).subscribe({ complete: () => resolve() })
    })
    expect(setAttribute).toHaveBeenCalledWith("omnichat.user_id", "usr_123")
  })

  it("sets omnichat.conversation_id from params.conversationId", async () => {
    const setAttribute = vi.fn()
    vi.spyOn(trace, "getActiveSpan").mockReturnValue({ setAttribute, isRecording: () => true } as any)
    const interceptor = new ObservabilityInterceptor()
    const ctx = makeContext({ params: { conversationId: "conv_abc" }, headers: {} })
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, { handle: () => of("ok") }).subscribe({ complete: () => resolve() })
    })
    expect(setAttribute).toHaveBeenCalledWith("omnichat.conversation_id", "conv_abc")
  })

  it("sets omnichat.request_id from x-request-id header", async () => {
    const setAttribute = vi.fn()
    vi.spyOn(trace, "getActiveSpan").mockReturnValue({ setAttribute, isRecording: () => true } as any)
    const interceptor = new ObservabilityInterceptor()
    const ctx = makeContext({ params: {}, headers: { "x-request-id": "req_xyz" } })
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, { handle: () => of("ok") }).subscribe({ complete: () => resolve() })
    })
    expect(setAttribute).toHaveBeenCalledWith("omnichat.request_id", "req_xyz")
  })

  it("does not throw if no active span", async () => {
    vi.spyOn(trace, "getActiveSpan").mockReturnValue(undefined)
    const interceptor = new ObservabilityInterceptor()
    const ctx = makeContext({ params: {}, headers: {} })
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, { handle: () => of("ok") }).subscribe({ complete: () => resolve() })
    })
  })

  it("ObservabilityModule.forRoot registers interceptor as APP_INTERCEPTOR", () => {
    const mod = ObservabilityModule.forRoot({ serviceName: "x" })
    const binding = (mod.providers ?? []).find((p: any) => p && p.provide === APP_INTERCEPTOR)
    expect(binding).toBeDefined()
    expect((binding as any).useClass.name).toBe("ObservabilityInterceptor")
  })
})
