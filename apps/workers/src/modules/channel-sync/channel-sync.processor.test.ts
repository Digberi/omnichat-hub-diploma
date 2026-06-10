import { describe, expect, it, vi } from "vitest"

import { ChannelSyncProcessor } from "./channel-sync.processor"

function createProcessor(input: {
  enabled: boolean
  accounts?: Array<{ id: string }>
  conversation?: any | null
  outboxIds?: [string, string]
}) {
  const prisma: any = {
    channelAccount: {
      findMany: vi.fn(async () => input.accounts ?? []),
    },
    conversation: {
      findFirst: vi.fn(async () => input.conversation ?? null),
    },
    $transaction: vi.fn(async (fn: any) => {
      const ids = input.outboxIds ?? ["o_msg", "o_conv"]
      let outboxCalls = 0

      const tx: any = {
        message: {
          create: vi.fn(async (args: any) => ({
            id: "m1",
            conversationId: args.data.conversationId,
            direction: args.data.direction,
            text: args.data.text,
            clientMessageId: null,
            createdAt: new Date("2025-01-01T00:00:00.000Z"),
            sentAt: args.data.sentAt,
            deliveryStatus: args.data.deliveryStatus,
            errorCode: null,
            errorMessage: null,
          })),
        },
        conversation: {
          update: vi.fn(async () => ({})),
        },
        outboxEvent: {
          create: vi.fn(async (args: any) => {
            const id = ids[outboxCalls] ?? `o_${outboxCalls}`
            outboxCalls += 1
            return { id, ...args.data }
          }),
        },
      }

      return fn(tx)
    }),
  }

  const config: any = {
    get: vi.fn((key: string) => {
      if (key === "CHANNEL_SYNC_STUB_ENABLED") return input.enabled
      if (key === "CHANNEL_SYNC_STUB_MAX_ACCOUNTS") return 3
      return undefined
    }),
  }

  const outboxQueue: any = {
    add: vi.fn(async () => ({})),
  }

  const logger: any = {
    info: vi.fn(),
  }

  const crypto: any = {
    decrypt: vi.fn(async () => ({ accessToken: "fake" })),
  }

  const processor = new ChannelSyncProcessor(prisma, config, outboxQueue, logger, crypto)
  return { processor, prisma, outboxQueue }
}

describe("ChannelSyncProcessor (stub)", () => {
  it("skips when disabled", async () => {
    const { processor, prisma } = createProcessor({ enabled: false })
    await processor.process({ name: "stubTick" } as any)
    expect(prisma.channelAccount.findMany).not.toHaveBeenCalled()
  })

  it("creates outbox jobs for a stub incoming message", async () => {
    const outboxIds: [string, string] = ["o1", "o2"]
    const { processor, prisma, outboxQueue } = createProcessor({
      enabled: true,
      accounts: [{ id: "a1" }],
      conversation: {
        id: "c1",
        workspaceId: "w1",
        needsReply: false,
        isArchived: true,
        isPinnedInAll: true,
        snoozedUntil: null,
      },
      outboxIds,
    })

    await processor.process({ name: "stubTick" } as any)

    expect(prisma.channelAccount.findMany).toHaveBeenCalled()
    expect(prisma.conversation.findFirst).toHaveBeenCalled()
    expect(prisma.$transaction).toHaveBeenCalled()

    expect(outboxQueue.add).toHaveBeenCalledTimes(2)
    expect(outboxQueue.add).toHaveBeenCalledWith(
      "process",
      { outboxEventId: "o1" },
      { removeOnComplete: true, removeOnFail: true },
    )
    expect(outboxQueue.add).toHaveBeenCalledWith(
      "process",
      { outboxEventId: "o2" },
      { removeOnComplete: true, removeOnFail: true },
    )
  })
})

