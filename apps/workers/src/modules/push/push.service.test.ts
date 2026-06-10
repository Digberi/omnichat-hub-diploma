import { describe, expect, it, vi, afterEach } from "vitest"

import { PushService } from "./push.service"

function createService(input?: {
  provider?: "expo" | "console"
  tokens?: string[]
  pushNewMessageEnabled?: boolean
  pushSendErrorEnabled?: boolean
  snoozedUntil?: Date | null
  messageRow?: any
}) {
  const prisma: any = {
    conversation: {
      findFirst: vi.fn(async () => ({
        snoozedUntil: input?.snoozedUntil ?? null,
        buyerDisplayName: "Buyer",
      })),
    },
    message: {
      findFirst: vi.fn(async () => input?.messageRow ?? null),
    },
    workspaceSettings: {
      upsert: vi.fn(async () => ({
        pushNewMessageEnabled: input?.pushNewMessageEnabled ?? true,
        pushSendErrorEnabled: input?.pushSendErrorEnabled ?? true,
      })),
    },
    devicePushToken: {
      findMany: vi.fn(async () =>
        (input?.tokens ?? ["ExponentPushToken[ok]", "ExponentPushToken[bad]"]).map((token) => ({ token })),
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  }

  const config: any = {
    get: vi.fn((key: string) => {
      if (key === "PUSH_PROVIDER") return input?.provider ?? "expo"
      if (key === "EXPO_ACCESS_TOKEN") return ""
      return undefined
    }),
  }

  const logger: any = {
    info: vi.fn(),
    warn: vi.fn(),
  }

  const service = new PushService(prisma, config, logger)
  return { service, prisma, config, logger }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("PushService (expo)", () => {
  it("disables DeviceNotRegistered tokens from tickets and does not fail the delivery", async () => {
    const { service, prisma } = createService({
      provider: "expo",
      tokens: ["ExponentPushToken[ok]", "ExponentPushToken[bad]"],
    })

    vi.stubGlobal("fetch", vi.fn(async (url: any) => {
      const u = String(url)
      if (u.includes("/push/send")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: [
                { status: "ok", id: "ticket-1" },
                { status: "error", message: "Device not registered", details: { error: "DeviceNotRegistered" } },
              ],
            }),
        } as any
      }
      if (u.includes("/push/getReceipts")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: {
                "ticket-1": { status: "ok" },
              },
            }),
        } as any
      }
      throw new Error(`unexpected url: ${u}`)
    }) as any)

    const sent = await service.deliverForOutboxEvent({
      workspaceId: "w1",
      type: "message.new",
      payload: {
        schemaVersion: 1,
        workspaceId: "w1",
        occurredAt: new Date().toISOString(),
        data: {
          conversationId: "c1",
          message: { direction: "IN", text: "hi" },
        },
      },
    })

    expect(sent).toBe(true)
    expect(prisma.devicePushToken.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "w1", token: { in: ["ExponentPushToken[bad]"] } },
      data: { isEnabled: false },
    })
  })

  it("disables DeviceNotRegistered tokens from receipts and does not fail the delivery", async () => {
    const { service, prisma } = createService({
      provider: "expo",
      tokens: ["ExponentPushToken[ok]", "ExponentPushToken[bad]"],
    })

    vi.stubGlobal("fetch", vi.fn(async (url: any) => {
      const u = String(url)
      if (u.includes("/push/send")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: [
                { status: "ok", id: "ticket-1" },
                { status: "ok", id: "ticket-2" },
              ],
            }),
        } as any
      }
      if (u.includes("/push/getReceipts")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: {
                "ticket-1": { status: "ok" },
                "ticket-2": { status: "error", message: "Device not registered", details: { error: "DeviceNotRegistered" } },
              },
            }),
        } as any
      }
      throw new Error(`unexpected url: ${u}`)
    }) as any)

    const sent = await service.deliverForOutboxEvent({
      workspaceId: "w1",
      type: "message.new",
      payload: {
        schemaVersion: 1,
        workspaceId: "w1",
        occurredAt: new Date().toISOString(),
        data: {
          conversationId: "c1",
          message: { direction: "IN", text: "hi" },
        },
      },
    })

    expect(sent).toBe(true)
    expect(prisma.devicePushToken.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "w1", token: { in: ["ExponentPushToken[bad]"] } },
      data: { isEnabled: false },
    })
  })

  it("fails the delivery on hard expo errors", async () => {
    const { service } = createService({
      provider: "expo",
      tokens: ["ExponentPushToken[one]"],
    })

    vi.stubGlobal("fetch", vi.fn(async (url: any) => {
      const u = String(url)
      if (u.includes("/push/send")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: [
                { status: "error", message: "bad credentials", details: { error: "InvalidCredentials" } },
              ],
            }),
        } as any
      }
      throw new Error(`unexpected url: ${u}`)
    }) as any)

    await expect(
      service.deliverForOutboxEvent({
        workspaceId: "w1",
        type: "message.new",
        payload: {
          schemaVersion: 1,
          workspaceId: "w1",
          occurredAt: new Date().toISOString(),
          data: {
            conversationId: "c1",
            message: { direction: "IN", text: "hi" },
          },
        },
      }),
    ).rejects.toThrow(/expo push errors/i)
  })

  it("fails the delivery when all receipts error", async () => {
    const { service } = createService({
      provider: "expo",
      tokens: ["ExponentPushToken[one]"],
    })

    vi.stubGlobal("fetch", vi.fn(async (url: any) => {
      const u = String(url)
      if (u.includes("/push/send")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: [{ status: "ok", id: "ticket-1" }],
            }),
        } as any
      }
      if (u.includes("/push/getReceipts")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: {
                "ticket-1": { status: "error", message: "bad", details: { error: "InvalidCredentials" } },
              },
            }),
        } as any
      }
      throw new Error(`unexpected url: ${u}`)
    }) as any)

    await expect(
      service.deliverForOutboxEvent({
        workspaceId: "w1",
        type: "message.new",
        payload: {
          schemaVersion: 1,
          workspaceId: "w1",
          occurredAt: new Date().toISOString(),
          data: {
            conversationId: "c1",
            message: { direction: "IN", text: "hi" },
          },
        },
      }),
    ).rejects.toThrow(/receipts/i)
  })
})

describe("PushService (rules)", () => {
  it("suppresses push for snoozed conversations (message.new)", async () => {
    const { service, logger } = createService({
      provider: "console",
      snoozedUntil: new Date(Date.now() + 60_000),
    })

    const sent = await service.deliverForOutboxEvent({
      workspaceId: "w1",
      type: "message.new",
      payload: {
        schemaVersion: 1,
        workspaceId: "w1",
        occurredAt: new Date().toISOString(),
        data: {
          conversationId: "c1",
          message: { direction: "IN", text: "hi" },
        },
      },
    })

    expect(sent).toBe(false)
    expect(logger.info).not.toHaveBeenCalled()
  })

  it("sends push for outgoing send failures (message.updated) when enabled", async () => {
    const { service, prisma, logger } = createService({
      provider: "console",
      pushSendErrorEnabled: true,
      messageRow: {
        id: "m1",
        direction: "OUT",
        text: "hello",
        errorCode: "E_SEND",
        errorMessage: "send failed",
        conversationId: "c1",
        conversation: { buyerDisplayName: "Buyer" },
      },
    })

    const sent = await service.deliverForOutboxEvent({
      workspaceId: "w1",
      type: "message.updated",
      payload: {
        schemaVersion: 1,
        workspaceId: "w1",
        occurredAt: new Date().toISOString(),
        data: {
          messageId: "m1",
          patch: { deliveryStatus: "FAILED" },
        },
      },
    })

    expect(sent).toBe(true)
    expect(prisma.message.findFirst).toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalled()
  })

  it("does not send send-error push when disabled in prefs", async () => {
    const { service, logger } = createService({
      provider: "console",
      pushSendErrorEnabled: false,
      messageRow: {
        id: "m1",
        direction: "OUT",
        text: "hello",
        errorCode: "E_SEND",
        errorMessage: "send failed",
        conversationId: "c1",
        conversation: { buyerDisplayName: "Buyer" },
      },
    })

    const sent = await service.deliverForOutboxEvent({
      workspaceId: "w1",
      type: "message.updated",
      payload: {
        schemaVersion: 1,
        workspaceId: "w1",
        occurredAt: new Date().toISOString(),
        data: {
          messageId: "m1",
          patch: { deliveryStatus: "FAILED" },
        },
      },
    })

    expect(sent).toBe(false)
    expect(logger.info).not.toHaveBeenCalled()
  })
})
