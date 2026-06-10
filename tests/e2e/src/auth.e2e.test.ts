import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

describe("auth", () => {
  it("google oauth is disabled by default (missing env)", async () => {
    const res = await httpRequest({
      method: "GET",
      path: "/v1/auth/google/start",
    })
    expect(res.status).toBe(400)
    expect((res.json as any)?.code).toBe("BAD_REQUEST")
  })

  it("can login with email otp, call me, refresh tokens, and logout (server-side revoke)", async () => {
    const { accessToken, refreshToken } = await loginViaEmailOtp()

    expect(accessToken.length).toBeGreaterThan(20)
    expect(refreshToken.length).toBeGreaterThan(20)

    const me = await httpRequest({
      method: "GET",
      path: "/v1/auth/me",
      token: accessToken,
    })
    expect(me.status).toBe(200)
    expect((me.json as any)?.userId).toBeTypeOf("string")
    expect((me.json as any)?.workspaceId).toBeTypeOf("string")

    const refreshed = await httpRequest({
      method: "POST",
      path: "/v1/auth/refresh",
      body: { refreshToken },
    })
    expect([200, 201]).toContain(refreshed.status)

    const newAccess = (refreshed.json as any)?.accessToken
    const newRefresh = (refreshed.json as any)?.refreshToken
    expect(typeof newAccess).toBe("string")
    expect(typeof newRefresh).toBe("string")
    expect(newRefresh).not.toBe(refreshToken)

    const logout = await httpRequest({
      method: "POST",
      path: "/v1/auth/logout",
      token: newAccess,
    })
    expect([200, 201]).toContain(logout.status)
    expect((logout.json as any)?.ok).toBe(true)

    const refreshAfterLogout = await httpRequest({
      method: "POST",
      path: "/v1/auth/refresh",
      body: { refreshToken: newRefresh },
    })
    expect(refreshAfterLogout.status).toBe(401)
  })
})
