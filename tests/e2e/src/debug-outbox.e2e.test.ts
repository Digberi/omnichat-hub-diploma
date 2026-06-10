import { describe, expect, it } from "vitest"

import { loginViaEmailOtp } from "./helpers/auth"
import { httpRequest } from "./helpers/http"

describe("debug outbox (dev/staging only)", () => {
  it("returns outbox summary, events list and accepts requeue call", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const summary = await httpRequest({
      method: "GET",
      path: "/v1/debug/outbox/summary",
      token: accessToken,
    })
    expect(summary.status).toBe(200)
    expect((summary.json as any)?.counts).toBeTruthy()

    const events = await httpRequest({
      method: "GET",
      path: "/v1/debug/outbox/events?limit=5",
      token: accessToken,
    })
    expect(events.status).toBe(200)
    expect(Array.isArray(events.json)).toBe(true)

    const requeue = await httpRequest({
      method: "POST",
      path: "/v1/debug/outbox/requeue",
      token: accessToken,
      body: { limit: 5, statuses: ["FAILED"] },
    })
    expect(requeue.status).toBe(200)
    expect(typeof (requeue.json as any)?.requeued).toBe("number")
    expect(Array.isArray((requeue.json as any)?.ids)).toBe(true)
  })
})

