import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

describe("workspaces", () => {
  it("can get current workspace", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const res = await httpRequest({
      method: "GET",
      path: "/v1/workspaces/current",
      token: accessToken,
    })
    expect(res.status).toBe(200)
    expect(typeof (res.json as any)?.id).toBe("string")
    expect(typeof (res.json as any)?.name).toBe("string")
  })
})

