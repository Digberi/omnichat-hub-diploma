import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

describe("notifications", () => {
  it("can register device token and update preferences", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const token = uniq("demo_push_token")
    const reg1 = await httpRequest({
      method: "POST",
      path: "/v1/notifications/device-tokens",
      token: accessToken,
      body: { platform: "WEB", token },
    })
    expect([200, 201]).toContain(reg1.status)
    expect((reg1.json as any)?.token).toBe(token)

    const reg2 = await httpRequest({
      method: "POST",
      path: "/v1/notifications/device-tokens",
      token: accessToken,
      body: { platform: "WEB", token },
    })
    expect([200, 201]).toContain(reg2.status)
    expect((reg2.json as any)?.token).toBe(token)

    const upd = await httpRequest({
      method: "PATCH",
      path: "/v1/notifications/preferences",
      token: accessToken,
      body: { pushNewMessageEnabled: false },
    })
    expect(upd.status).toBe(200)
    expect((upd.json as any)?.pushNewMessageEnabled).toBe(false)

    const get = await httpRequest({
      method: "GET",
      path: "/v1/notifications/preferences",
      token: accessToken,
    })
    expect(get.status).toBe(200)
    expect((get.json as any)?.pushNewMessageEnabled).toBe(false)
  })
})

