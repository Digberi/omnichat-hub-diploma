import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

describe("messages around", () => {
  it("returns a window containing the anchor message", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const list = await httpRequest({
      method: "GET",
      path: "/v1/conversations?folder=ALL&limit=1",
      token: accessToken,
    })
    expect(list.status).toBe(200)
    const convId = (list.json as any)?.items?.[0]?.id as string | undefined
    expect(typeof convId).toBe("string")

    const msgs = await httpRequest({
      method: "GET",
      path: `/v1/conversations/${convId}/messages?limit=10`,
      token: accessToken,
    })
    expect(msgs.status).toBe(200)
    const messageId = (msgs.json as any)?.items?.[0]?.id as string | undefined
    expect(typeof messageId).toBe("string")

    const around = await httpRequest({
      method: "GET",
      path: `/v1/conversations/${convId}/messages/around/${messageId}?limit=11`,
      token: accessToken,
    })
    expect(around.status).toBe(200)
    const json = around.json as any
    expect(json?.anchorMessageId).toBe(messageId)
    expect(Array.isArray(json?.items)).toBe(true)
    expect(json.items.some((m: any) => m?.id === messageId)).toBe(true)
  })
})

