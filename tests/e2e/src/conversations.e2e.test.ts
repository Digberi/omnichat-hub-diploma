import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

describe("conversations", () => {
  it("lists conversations (ALL) with cursor pagination shape", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const res = await httpRequest({
      method: "GET",
      path: "/v1/conversations?folder=ALL&limit=10",
      token: accessToken,
    })
    expect(res.status).toBe(200)

    const body = res.json as any
    expect(body).toHaveProperty("items")
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.items.length).toBeGreaterThan(0)
    expect(body).toHaveProperty("pinned")
    expect(Array.isArray(body.pinned)).toBe(true)
  })

  it("lists UNREAD only (needsReply=true, isArchived=false)", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const res = await httpRequest({
      method: "GET",
      path: "/v1/conversations?folder=UNREAD&limit=20",
      token: accessToken,
    })
    expect(res.status).toBe(200)

    const body = res.json as any
    expect(Array.isArray(body.items)).toBe(true)
    for (const c of body.items) {
      expect(c.needsReply).toBe(true)
      expect(c.isArchived).toBe(false)
    }
  })
})

