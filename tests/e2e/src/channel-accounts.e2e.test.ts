import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

describe("channel accounts", () => {
  it("can list, create stub, update alias, and disable", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const list0 = await httpRequest({ method: "GET", path: "/v1/channel-accounts", token: accessToken })
    expect(list0.status).toBe(200)
    expect(Array.isArray(list0.json)).toBe(true)
    expect((list0.json as any[]).length).toBeGreaterThanOrEqual(3)

    const alias1 = uniq("OLX Stub")
    const created = await httpRequest({
      method: "POST",
      path: "/v1/channel-accounts",
      token: accessToken,
      body: { channel: "OLX", alias: alias1, externalAccountId: uniq("ext") },
    })
    expect([200, 201]).toContain(created.status)
    const ca = created.json as any
    expect(typeof ca?.id).toBe("string")
    expect(ca?.alias).toBe(alias1)
    expect(ca?.channel).toBe("OLX")

    const alias2 = uniq("OLX Renamed")
    const updated = await httpRequest({
      method: "PATCH",
      path: `/v1/channel-accounts/${ca.id}/alias`,
      token: accessToken,
      body: { alias: alias2 },
    })
    expect(updated.status).toBe(200)
    expect((updated.json as any)?.alias).toBe(alias2)

    const disabled = await httpRequest({
      method: "POST",
      path: `/v1/channel-accounts/${ca.id}/disable`,
      token: accessToken,
    })
    expect([200, 201]).toContain(disabled.status)
    expect((disabled.json as any)?.isEnabled).toBe(false)
  })
})

