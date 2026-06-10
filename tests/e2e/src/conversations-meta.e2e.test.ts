import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

describe("conversations metadata (status/tags/details)", () => {
  it("can get details, set status, and set tags", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const list = await httpRequest({
      method: "GET",
      path: "/v1/conversations?folder=ALL&limit=5",
      token: accessToken,
    })
    expect(list.status).toBe(200)
    const convId = (list.json as any)?.items?.[0]?.id as string | undefined
    expect(typeof convId).toBe("string")

    const details0 = await httpRequest({
      method: "GET",
      path: `/v1/conversations/${convId}`,
      token: accessToken,
    })
    expect(details0.status).toBe(200)
    expect((details0.json as any)?.id).toBe(convId)
    expect(Array.isArray((details0.json as any)?.tagIds)).toBe(true)

    const statusName = uniq("status")
    const statusCreate = await httpRequest({
      method: "POST",
      path: "/v1/statuses",
      token: accessToken,
      body: { name: statusName, color: "#f59e0b", icon: "clock", sortOrder: 999 },
    })
    expect([200, 201]).toContain(statusCreate.status)
    const statusId = (statusCreate.json as any)?.id as string | undefined
    expect(typeof statusId).toBe("string")

    const tagName = uniq("tag")
    const tagCreate = await httpRequest({
      method: "POST",
      path: "/v1/tags",
      token: accessToken,
      body: { name: tagName, color: "#16a34a", icon: "tag" },
    })
    expect([200, 201]).toContain(tagCreate.status)
    const tagId = (tagCreate.json as any)?.id as string | undefined
    expect(typeof tagId).toBe("string")

    const setStatus = await httpRequest({
      method: "POST",
      path: `/v1/conversations/${convId}/status`,
      token: accessToken,
      body: { statusId },
    })
    expect([200, 201]).toContain(setStatus.status)
    expect((setStatus.json as any)?.statusId).toBe(statusId)

    const setTags = await httpRequest({
      method: "POST",
      path: `/v1/conversations/${convId}/tags`,
      token: accessToken,
      body: { tagIds: [tagId] },
    })
    expect([200, 201]).toContain(setTags.status)
    expect(Array.isArray((setTags.json as any)?.tagIds)).toBe(true)
    expect((setTags.json as any)?.tagIds).toContain(tagId)

    const clearStatus = await httpRequest({
      method: "POST",
      path: `/v1/conversations/${convId}/status`,
      token: accessToken,
      body: { statusId: null },
    })
    expect([200, 201]).toContain(clearStatus.status)
    expect((clearStatus.json as any)?.statusId).toBe(null)

    const clearTags = await httpRequest({
      method: "POST",
      path: `/v1/conversations/${convId}/tags`,
      token: accessToken,
      body: { tagIds: [] },
    })
    expect([200, 201]).toContain(clearTags.status)
    expect((clearTags.json as any)?.tagIds).toEqual([])
  })
})

