import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { forgeWorkspaceMismatchAccessToken, loginViaEmailOtp } from "./helpers/auth"

describe("errors", () => {
  it("returns code=UNAUTHORIZED for protected routes", async () => {
    const res = await httpRequest({
      method: "GET",
      path: "/v1/conversations?folder=ALL&limit=1",
    })
    expect(res.status).toBe(401)
    expect(res.json).toMatchObject({ code: "UNAUTHORIZED" })
  })

  it("returns code=VALIDATION_FAILED for DTO validation errors", async () => {
    const res = await httpRequest({
      method: "POST",
      path: "/v1/auth/start-email-login",
      body: { email: "not-an-email" },
    })
    expect(res.status).toBe(400)
    expect(res.json).toMatchObject({ code: "VALIDATION_FAILED" })
  })

  it("returns code=RESOURCE_NOT_FOUND for missing resources", async () => {
    const { accessToken } = await loginViaEmailOtp()
    const res = await httpRequest({
      method: "GET",
      path: "/v1/conversations/does-not-exist",
      token: accessToken,
    })
    expect(res.status).toBe(404)
    expect(res.json).toMatchObject({ code: "RESOURCE_NOT_FOUND" })
  })

  it("returns code=FORBIDDEN when token workspace is not a member workspace", async () => {
    const { accessToken } = await loginViaEmailOtp()
    const forged = forgeWorkspaceMismatchAccessToken(accessToken)
    if (!forged) return

    const res = await httpRequest({
      method: "GET",
      path: "/v1/conversations?folder=ALL&limit=1",
      token: forged,
    })

    expect(res.status).toBe(403)
    expect(res.json).toMatchObject({ code: "FORBIDDEN" })
  })
})
