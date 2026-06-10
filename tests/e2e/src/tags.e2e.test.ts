import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

describe("tags", () => {
  it("can CRUD tags", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const name1 = uniq("tag")
    const create = await httpRequest({
      method: "POST",
      path: "/v1/tags",
      token: accessToken,
      body: { name: name1, color: "#16a34a", icon: "tag" },
    })
    expect([200, 201]).toContain(create.status)
    const created = create.json as any
    expect(typeof created?.id).toBe("string")
    expect(created?.name).toBe(name1)

    const list1 = await httpRequest({
      method: "GET",
      path: "/v1/tags",
      token: accessToken,
    })
    expect(list1.status).toBe(200)
    expect(Array.isArray(list1.json)).toBe(true)
    const found = (list1.json as any[]).find((t) => t.id === created.id)
    expect(found?.name).toBe(name1)

    const name2 = uniq("tag2")
    const upd = await httpRequest({
      method: "PATCH",
      path: `/v1/tags/${created.id}`,
      token: accessToken,
      body: { name: name2 },
    })
    expect(upd.status).toBe(200)
    expect((upd.json as any)?.name).toBe(name2)

    const del = await httpRequest({
      method: "DELETE",
      path: `/v1/tags/${created.id}`,
      token: accessToken,
    })
    expect(del.status).toBe(200)
    expect((del.json as any)?.ok).toBe(true)
  })
})

