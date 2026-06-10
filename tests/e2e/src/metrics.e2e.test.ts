import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

describe("metrics", () => {
  it("returns inbox metrics", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const res = await httpRequest({
      method: "GET",
      path: "/v1/metrics/inbox",
      token: accessToken,
    })

    expect(res.status).toBe(200)

    const json = res.json as any
    expect(json).toBeTruthy()

    expect(json.avgResponseMin === null || typeof json.avgResponseMin === "number").toBe(true)
    expect(Array.isArray(json.hourlyActivity)).toBe(true)
    expect(json.hourlyActivity).toHaveLength(24)
    expect(json.hourlyActivity.every((n: unknown) => typeof n === "number")).toBe(true)
  })

  it("returns storage metrics", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const res = await httpRequest({
      method: "GET",
      path: "/v1/metrics/storage",
      token: accessToken,
    })

    expect(res.status).toBe(200)

    const json = res.json as any
    expect(json).toBeTruthy()
    expect(typeof json.bucket).toBe("string")
    expect(typeof json.endpoint).toBe("string")
    expect(typeof json.operations).toBe("object")
    expect(json.operations).not.toBeNull()
  })

  it("returns storage health summary", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const res = await httpRequest({
      method: "GET",
      path: "/v1/metrics/storage/health",
      token: accessToken,
    })

    expect(res.status).toBe(200)

    const json = res.json as any
    expect(["ok", "degraded", "critical"]).toContain(json.status)
    expect(Array.isArray(json.reasons)).toBe(true)
    expect(Array.isArray(json.operations)).toBe(true)
  })
})
