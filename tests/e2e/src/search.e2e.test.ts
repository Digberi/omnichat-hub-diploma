import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

describe("search", () => {
  it("returns conversation and message hits (default recent window)", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const res = await httpRequest({
      method: "GET",
      path: "/v1/search?query=Incoming&limit=20",
      token: accessToken,
    })
    expect(res.status).toBe(200)
    const json = res.json as any
    expect(Array.isArray(json?.conversations)).toBe(true)
    expect(Array.isArray(json?.messages)).toBe(true)
    expect(json.messages.length).toBeGreaterThan(0)
    expect(typeof json.messages[0]?.id).toBe("string")
    expect(typeof json.messages[0]?.conversationId).toBe("string")
  })

  it("supports showOlder=1 flag", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const res = await httpRequest({
      method: "GET",
      path: "/v1/search?query=Buyer&showOlder=1&limit=20",
      token: accessToken,
    })
    expect(res.status).toBe(200)
    const json = res.json as any
    expect(Array.isArray(json?.conversations)).toBe(true)
    expect(json.conversations.length).toBeGreaterThan(0)
  })
})

