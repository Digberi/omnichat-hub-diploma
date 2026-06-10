import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

describe("settings", () => {
  it("can get and update workspace settings", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const get1 = await httpRequest({
      method: "GET",
      path: "/v1/settings",
      token: accessToken,
    })
    expect(get1.status).toBe(200)
    expect(typeof (get1.json as any)?.autoArchiveDays).toBe("number")

    const patch = await httpRequest({
      method: "PATCH",
      path: "/v1/settings",
      token: accessToken,
      body: { autoArchiveDays: 5, pushNewMessageEnabled: true, pushSendErrorEnabled: true },
    })
    expect(patch.status).toBe(200)
    expect((patch.json as any)?.autoArchiveDays).toBe(5)

    const get2 = await httpRequest({
      method: "GET",
      path: "/v1/settings",
      token: accessToken,
    })
    expect(get2.status).toBe(200)
    expect((get2.json as any)?.autoArchiveDays).toBe(5)
  })
})

