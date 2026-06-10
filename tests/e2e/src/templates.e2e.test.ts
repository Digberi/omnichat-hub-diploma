import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

describe("templates", () => {
  it("can CRUD categories and templates", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const catName = uniq("cat")
    const catCreate = await httpRequest({
      method: "POST",
      path: "/v1/templates/categories",
      token: accessToken,
      body: { name: catName, sortOrder: 10 },
    })
    expect([200, 201]).toContain(catCreate.status)
    const categoryId = (catCreate.json as any)?.id as string
    expect(typeof categoryId).toBe("string")

    const tplTitle = uniq("tpl")
    const tplCreate = await httpRequest({
      method: "POST",
      path: "/v1/templates",
      token: accessToken,
      body: {
        scope: "GLOBAL",
        title: tplTitle,
        content: "Hello from template",
        categoryId,
      },
    })
    expect([200, 201]).toContain(tplCreate.status)
    const templateId = (tplCreate.json as any)?.id as string
    expect(typeof templateId).toBe("string")

    const list = await httpRequest({
      method: "GET",
      path: "/v1/templates?scope=GLOBAL",
      token: accessToken,
    })
    expect(list.status).toBe(200)
    expect(Array.isArray(list.json)).toBe(true)
    expect((list.json as any[]).some((t) => t.id === templateId)).toBe(true)

    const tplTitle2 = uniq("tpl2")
    const tplUpd = await httpRequest({
      method: "PATCH",
      path: `/v1/templates/${templateId}`,
      token: accessToken,
      body: { title: tplTitle2 },
    })
    expect(tplUpd.status).toBe(200)
    expect((tplUpd.json as any)?.title).toBe(tplTitle2)

    const tplDel = await httpRequest({
      method: "DELETE",
      path: `/v1/templates/${templateId}`,
      token: accessToken,
    })
    expect(tplDel.status).toBe(200)
    expect((tplDel.json as any)?.ok).toBe(true)

    const catDel = await httpRequest({
      method: "DELETE",
      path: `/v1/templates/categories/${categoryId}`,
      token: accessToken,
    })
    expect(catDel.status).toBe(200)
    expect((catDel.json as any)?.ok).toBe(true)
  })
})

