import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

describe("statuses", () => {
  it("can list and CRUD statuses", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const list0 = await httpRequest({ method: "GET", path: "/v1/statuses", token: accessToken })
    expect(list0.status).toBe(200)
    expect(Array.isArray(list0.json)).toBe(true)

    const name1 = uniq("status")
    const create = await httpRequest({
      method: "POST",
      path: "/v1/statuses",
      token: accessToken,
      body: { name: name1, color: "#f59e0b", icon: "clock", sortOrder: 50 },
    })
    expect([200, 201]).toContain(create.status)
    const created = create.json as any
    expect(typeof created?.id).toBe("string")
    expect(created?.name).toBe(name1)

    const name2 = uniq("status2")
    const upd = await httpRequest({
      method: "PATCH",
      path: `/v1/statuses/${created.id}`,
      token: accessToken,
      body: { name: name2, sortOrder: 51 },
    })
    expect(upd.status).toBe(200)
    expect((upd.json as any)?.name).toBe(name2)

    const del = await httpRequest({
      method: "DELETE",
      path: `/v1/statuses/${created.id}`,
      token: accessToken,
    })
    expect(del.status).toBe(200)
    expect((del.json as any)?.ok).toBe(true)
  })
})

