import { describe, expect, it } from "vitest"
import { io } from "socket.io-client"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

const baseUrl = process.env.E2E_API_BASE_URL ?? "http://localhost:4121"
const itIfWorkers = process.env.E2E_REQUIRE_WORKERS === "1" ? it : it.skip

function newClientMessageId(): string {
  return `e2e_ws_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

describe("realtime (socket.io)", () => {
  itIfWorkers("receives message.new after sending a message (requires workers)", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const socket = io(baseUrl, {
      path: "/ws",
      transports: ["websocket"],
      auth: { token: accessToken },
    })

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("socket connect timeout")), 5_000)
      socket.on("connect", () => {
        clearTimeout(t)
        resolve()
      })
      socket.on("connect_error", (err) => {
        clearTimeout(t)
        reject(err)
      })
    })

    try {
      const list = await httpRequest({
        method: "GET",
        path: "/v1/conversations?folder=ALL&limit=5",
        token: accessToken,
      })
      expect(list.status).toBe(200)
      const convId = (list.json as any)?.items?.[0]?.id as string | undefined
      expect(typeof convId).toBe("string")

      const clientMessageId = newClientMessageId()
      const messageNew = new Promise<any>((resolve, reject) => {
        const handler = (payload: any) => {
          if (payload?.data?.conversationId !== convId) return
          if (payload?.data?.message?.clientMessageId !== clientMessageId) return
          clearTimeout(t)
          socket.off("message.new", handler)
          resolve(payload)
        }

        const t = setTimeout(() => {
          socket.off("message.new", handler)
          reject(new Error("message.new timeout (is workers running?)"))
        }, 10_000)

        socket.on("message.new", handler)
      })
      const send = await httpRequest({
        method: "POST",
        path: `/v1/conversations/${convId}/messages`,
        token: accessToken,
        body: { clientMessageId, text: "hello from ws e2e" },
      })
      expect([200, 201]).toContain(send.status)

      const payload = await messageNew
      expect(payload?.schemaVersion).toBe(1)
      expect(payload?.data?.conversationId).toBe(convId)
      expect(payload?.data?.message?.clientMessageId).toBe(clientMessageId)
    } finally {
      socket.disconnect()
    }
  })

  itIfWorkers("receives conversation.updated after setting status (requires workers)", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const socket = io(baseUrl, {
      path: "/ws",
      transports: ["websocket"],
      auth: { token: accessToken },
    })

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("socket connect timeout")), 5_000)
      socket.on("connect", () => {
        clearTimeout(t)
        resolve()
      })
      socket.on("connect_error", (err) => {
        clearTimeout(t)
        reject(err)
      })
    })

    try {
      const list = await httpRequest({
        method: "GET",
        path: "/v1/conversations?folder=ALL&limit=5",
        token: accessToken,
      })
      expect(list.status).toBe(200)
      const convId = (list.json as any)?.items?.[0]?.id as string | undefined
      expect(typeof convId).toBe("string")

      const create = await httpRequest({
        method: "POST",
        path: "/v1/statuses",
        token: accessToken,
        body: { name: uniq("ws_status"), color: "#f59e0b", icon: "clock", sortOrder: 123 },
      })
      expect([200, 201]).toContain(create.status)
      const statusId = (create.json as any)?.id as string | undefined
      expect(typeof statusId).toBe("string")

      const event = new Promise<any>((resolve, reject) => {
        const handler = (payload: any) => {
          if (payload?.data?.conversationId !== convId) return
          if (payload?.data?.patch?.statusId !== statusId) return
          clearTimeout(t)
          socket.off("conversation.updated", handler)
          resolve(payload)
        }

        const t = setTimeout(() => {
          socket.off("conversation.updated", handler)
          reject(new Error("conversation.updated timeout (is workers running?)"))
        }, 10_000)

        socket.on("conversation.updated", handler)
      })

      const setStatus = await httpRequest({
        method: "POST",
        path: `/v1/conversations/${convId}/status`,
        token: accessToken,
        body: { statusId },
      })
      expect([200, 201]).toContain(setStatus.status)

      const payload = await event
      expect(payload?.schemaVersion).toBe(1)
      expect(payload?.data?.conversationId).toBe(convId)
      expect(payload?.data?.patch?.statusId).toBe(statusId)
    } finally {
      socket.disconnect()
    }
  })

  itIfWorkers("receives message.updated after delivery status update (requires workers)", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const socket = io(baseUrl, {
      path: "/ws",
      transports: ["websocket"],
      auth: { token: accessToken },
    })

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("socket connect timeout")), 5_000)
      socket.on("connect", () => {
        clearTimeout(t)
        resolve()
      })
      socket.on("connect_error", (err) => {
        clearTimeout(t)
        reject(err)
      })
    })

    try {
      const list = await httpRequest({
        method: "GET",
        path: "/v1/conversations?folder=ALL&limit=5",
        token: accessToken,
      })
      expect(list.status).toBe(200)
      const convId = (list.json as any)?.items?.[0]?.id as string | undefined
      expect(typeof convId).toBe("string")

      const clientMessageId = newClientMessageId()
      const send = await httpRequest({
        method: "POST",
        path: `/v1/conversations/${convId}/messages`,
        token: accessToken,
        body: { clientMessageId, text: "hello delivery status e2e" },
      })
      expect([200, 201]).toContain(send.status)
      const messageId = (send.json as any)?.id as string | undefined
      expect(typeof messageId).toBe("string")

      const event = new Promise<any>((resolve, reject) => {
        const handler = (payload: any) => {
          if (payload?.data?.messageId !== messageId) return
          if (payload?.data?.patch?.deliveryStatus !== "DELIVERED") return
          clearTimeout(t)
          socket.off("message.updated", handler)
          resolve(payload)
        }

        const t = setTimeout(() => {
          socket.off("message.updated", handler)
          reject(new Error("message.updated timeout (is workers running?)"))
        }, 10_000)

        socket.on("message.updated", handler)
      })

      const patch = await httpRequest({
        method: "PATCH",
        path: `/v1/messages/${messageId}`,
        token: accessToken,
        body: { deliveryStatus: "DELIVERED" },
      })
      expect([200, 201]).toContain(patch.status)

      const payload = await event
      expect(payload?.schemaVersion).toBe(1)
      expect(payload?.data?.messageId).toBe(messageId)
      expect(payload?.data?.patch?.deliveryStatus).toBe("DELIVERED")
    } finally {
      socket.disconnect()
    }
  })
})
