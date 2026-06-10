import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

function newClientMessageId(): string {
  return `e2e_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

describe("messages", () => {
  it("can send message with idempotency (clientMessageId)", async () => {
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
    const send1 = await httpRequest({
      method: "POST",
      path: `/v1/conversations/${convId}/messages`,
      token: accessToken,
      body: { clientMessageId, text: "hello from e2e" },
    })
    expect([200, 201]).toContain(send1.status)
    const msg1 = send1.json as any
    expect(msg1).toHaveProperty("id")
    expect(msg1.clientMessageId).toBe(clientMessageId)
    // contract: do not leak Prisma/internal fields
    expect(msg1).not.toHaveProperty("workspaceId")
    expect(msg1).not.toHaveProperty("conversation")
    expect(msg1).not.toHaveProperty("attachments.storageKey")

    const send2 = await httpRequest({
      method: "POST",
      path: `/v1/conversations/${convId}/messages`,
      token: accessToken,
      body: { clientMessageId, text: "hello from e2e (retry)" },
    })
    expect([200, 201]).toContain(send2.status)
    const msg2 = send2.json as any
    expect(msg2.id).toBe(msg1.id)
    expect(msg2.clientMessageId).toBe(clientMessageId)

    const messages = await httpRequest({
      method: "GET",
      path: `/v1/conversations/${convId}/messages?limit=30`,
      token: accessToken,
    })
    expect(messages.status).toBe(200)
    expect(Array.isArray((messages.json as any)?.items)).toBe(true)
    const items = (messages.json as any)?.items as any[]
    for (const m of items) {
      expect(m).toHaveProperty("id")
      expect(m).toHaveProperty("conversationId", convId)
      expect(m).not.toHaveProperty("workspaceId")
      expect(Array.isArray(m?.attachments)).toBe(true)
      for (const a of m.attachments ?? []) {
        expect(a).toHaveProperty("id")
        expect(a).toHaveProperty("kind")
        expect(a).toHaveProperty("mimeType")
        expect(a).toHaveProperty("sizeBytes")
        expect(a).not.toHaveProperty("workspaceId")
        expect(a).not.toHaveProperty("messageId")
        expect(a).not.toHaveProperty("storageKey")
      }
    }
  })
})
