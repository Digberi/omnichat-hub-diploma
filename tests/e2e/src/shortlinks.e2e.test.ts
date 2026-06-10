import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"
import { deleteMinioObject } from "./helpers/minio"

function newClientMessageId(): string {
  return `e2e_att_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

describe("short links", () => {
  it("can upload attachment message, create short link, and resolve landing redirect", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const list = await httpRequest({
      method: "GET",
      path: "/v1/conversations?folder=ALL&limit=5",
      token: accessToken,
    })
    expect(list.status).toBe(200)
    const convId = (list.json as any)?.items?.[0]?.id as string | undefined
    expect(typeof convId).toBe("string")

    const clientMessageId = newClientMessageId()
    const form = new FormData()
    form.append("clientMessageId", clientMessageId)
    form.append("file", new Blob(["hello from e2e attachment"], { type: "text/plain" }), "hello.txt")

    const send = await httpRequest({
      method: "POST",
      path: `/v1/conversations/${convId}/messages/attachment`,
      token: accessToken,
      formData: form,
    })
    expect([200, 201]).toContain(send.status)
    const msg = send.json as any
    expect(msg?.clientMessageId).toBe(clientMessageId)
    expect(Array.isArray(msg?.attachments)).toBe(true)
    // contract: do not leak Prisma/internal fields
    expect(msg).not.toHaveProperty("workspaceId")
    for (const a of msg.attachments ?? []) {
      expect(a).toHaveProperty("id")
      expect(a).toHaveProperty("kind")
      expect(a).toHaveProperty("mimeType")
      expect(a).toHaveProperty("sizeBytes")
      expect(a).not.toHaveProperty("workspaceId")
      expect(a).not.toHaveProperty("messageId")
      expect(a).not.toHaveProperty("storageKey")
    }
    const attachmentId = msg.attachments?.[0]?.id as string | undefined
    expect(typeof attachmentId).toBe("string")

    const short = await httpRequest({
      method: "POST",
      path: `/v1/attachments/${attachmentId}/short-link`,
      token: accessToken,
    })
    expect([200, 201]).toContain(short.status)
    const token = (short.json as any)?.token as string | undefined
    expect(typeof token).toBe("string")

    const landing = await httpRequest({
      method: "GET",
      path: `/v1/s/${token}`,
      redirect: "manual",
    })
    expect([301, 302, 303, 307, 308]).toContain(landing.status)
    const location = landing.headers.get("location")
    expect(typeof location).toBe("string")
    expect(location?.length).toBeGreaterThan(10)
  })

  it("returns UA message when storage object is missing (json)", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const list = await httpRequest({
      method: "GET",
      path: "/v1/conversations?folder=ALL&limit=5",
      token: accessToken,
    })
    expect(list.status).toBe(200)
    const convId = (list.json as any)?.items?.[0]?.id as string | undefined
    expect(typeof convId).toBe("string")

    const clientMessageId = newClientMessageId()
    const form = new FormData()
    form.append("clientMessageId", clientMessageId)
    form.append("file", new Blob(["hello from e2e attachment"], { type: "text/plain" }), "hello.txt")

    const send = await httpRequest({
      method: "POST",
      path: `/v1/conversations/${convId}/messages/attachment`,
      token: accessToken,
      formData: form,
    })
    expect([200, 201]).toContain(send.status)
    const msg = send.json as any
    const attachmentId = msg.attachments?.[0]?.id as string | undefined
    expect(typeof attachmentId).toBe("string")

    const short = await httpRequest({
      method: "POST",
      path: `/v1/attachments/${attachmentId}/short-link`,
      token: accessToken,
    })
    expect([200, 201]).toContain(short.status)
    const token = (short.json as any)?.token as string | undefined
    expect(typeof token).toBe("string")

    // Deterministic storage key (matches API implementation).
    await deleteMinioObject({ key: `attachments/${attachmentId}` })

    const res = await httpRequest({
      method: "GET",
      path: `/v1/s/${token}`,
      redirect: "manual",
    })
    expect(res.status).toBe(410)
    expect((res.json as any)?.message).toBe("Файл недоступний. Попросіть продавця надіслати ще раз.")
  })

  it("returns UA message for unknown token (json)", async () => {
    const res = await httpRequest({
      method: "GET",
      path: "/v1/s/does_not_exist",
      redirect: "manual",
    })
    expect(res.status).toBe(404)
    expect((res.json as any)?.message).toBe("Файл недоступний. Попросіть продавця надіслати ще раз.")
  })
})
