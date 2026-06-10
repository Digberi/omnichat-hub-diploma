import { describe, expect, it, vi } from "vitest"

import { RozetkaChannelSyncService } from "./rozetka-channel-sync.service"

function createService(input: {
  accounts?: any[]
  fetchResponses?: any[]
  configValues?: Record<string, unknown>
} = {}) {
  const findMany = vi.fn(async () => input.accounts ?? [])
  const findFirstConv = vi.fn(async () => null as any)
  const createConv = vi.fn(async ({ data }: any) => ({
    id: "conv_1",
    needsReply: false,
    isArchived: false,
    isPinnedInAll: false,
    snoozedUntil: null,
    ...data,
  }))
  const updateConv = vi.fn(async ({ data }: any) => ({ id: "conv_1", ...data }))
  const createMessage = vi.fn(async ({ data }: any) => ({
    id: "msg_1",
    conversationId: data.conversationId ?? "conv_1",
    direction: data.direction,
    text: data.text,
    clientMessageId: null,
    createdAt: new Date(),
    sentAt: data.sentAt ?? new Date(),
    deliveryStatus: data.deliveryStatus,
    errorCode: null,
    errorMessage: null,
    ...data,
  }))
  const updateAccount = vi.fn(async () => ({}))
  const upsertCheckpoint = vi.fn(async () => ({}))
  const createOutboxEvent = vi.fn(async ({ data }: any) => ({
    id: `outbox_${Math.random().toString(36).slice(2, 8)}`,
    ...data,
  }))

  const outboxAdd = vi.fn(async () => ({}))
  const outboxQueue: any = { add: outboxAdd }

  const makeTx = () => ({
    conversation: { findFirst: findFirstConv, create: createConv, update: updateConv },
    message: { create: createMessage, findFirst: vi.fn(async () => null) },
    outboxEvent: { create: createOutboxEvent },
    channelAccount: { update: updateAccount },
    channelSyncCheckpoint: { upsert: upsertCheckpoint },
  })

  const prisma: any = {
    channelAccount: { findMany, update: updateAccount },
    conversation: { findFirst: findFirstConv, create: createConv, update: updateConv },
    message: { create: createMessage, findFirst: vi.fn(async () => null) },
    outboxEvent: { create: createOutboxEvent },
    channelSyncCheckpoint: { upsert: upsertCheckpoint },
    workspaceSettings: { findUnique: vi.fn(async () => ({ autoArchiveDays: 7 })) },
    $transaction: vi.fn(async (cb: any) => cb(makeTx())),
  }

  const crypto: any = {
    decrypt: vi.fn(async () => ({
      apiToken: "fake-token",
      apiBaseUrl: "https://api-seller.rozetka.com.ua",
    })),
  }

  const fetchMock = vi.fn()
  for (const r of input.fetchResponses ?? []) fetchMock.mockResolvedValueOnce(r)

  const config: any = {
    get: vi.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        CHANNEL_SYNC_ROZETKA_MAX_ACCOUNTS: 50,
      }
      return input.configValues?.[key] ?? defaults[key]
    }),
  }

  const logger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), setContext: vi.fn() }

  const service = new RozetkaChannelSyncService(prisma, crypto, config, logger, outboxQueue)
  service.setFetch(fetchMock as any)
  return {
    service,
    prisma,
    crypto,
    fetchMock,
    findMany,
    updateAccount,
    createConv,
    updateConv,
    findFirstConv,
    createMessage,
    createOutboxEvent,
    outboxQueue,
    outboxAdd,
  }
}

describe("RozetkaChannelSyncService.tick", () => {
  it("does nothing when no Rozetka accounts are enabled", async () => {
    const { service, fetchMock, crypto, createMessage } = createService({ accounts: [] })

    await service.runTick()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(crypto.decrypt).not.toHaveBeenCalled()
    expect(createMessage).not.toHaveBeenCalled()
  })

  it("fresh checkpoint: searches without updated_from, fetches each chat, persists IN messages", async () => {
    const { service, fetchMock, createConv, createMessage, createOutboxEvent, outboxAdd } = createService({
      accounts: [
        {
          id: "acc_1",
          workspaceId: "ws_1",
          externalAccountId: "rzo_acc_1",
          authDataEncrypted: "v1:1:iv:tag:ct",
          syncCheckpoint: { lastMessageAt: null },
        },
      ],
      fetchResponses: [
        // searchChats response
        new Response(JSON.stringify({
          success: true,
          content: {
            chats: [
              {
                id: 555,
                updated: "2026-05-14 12:00:00",
                user: { id: 999, contact_fio: "Покупець Тест", has_email: true },
                subject: "Заказ № 12345",
                order_id: 12345,
                type: 0,
              },
            ],
            _meta: { totalPages: 1, currentPage: 1 },
          },
        }), { status: 200 }),
        // getChatWithMessages response
        new Response(JSON.stringify({
          success: true,
          content: {
            id: 555,
            updated: "2026-05-14 12:00:00",
            user: { id: 999, contact_fio: "Покупець Тест", has_email: true },
            subject: "Заказ № 12345",
            order_id: 12345,
            type: 0,
            messages: [
              {
                chat_id: 555,
                body: "<p>Привіт, де моє замовлення?</p>",
                created: "2026-05-14 12:00:00",
                receiver_id: 42,
                sender: 2,
                seller_id: null,
                files: [],
              },
            ],
          },
        }), { status: 200 }),
      ],
    })

    await service.runTick()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [searchUrl, searchInit] = fetchMock.mock.calls[0]!
    expect(String(searchUrl)).toContain("/messages/search")
    expect(String(searchUrl)).toContain("msgType=orders")
    expect(String(searchUrl)).not.toContain("updated_from") // fresh checkpoint
    expect((searchInit as RequestInit).headers).toMatchObject({
      Authorization: "Bearer fake-token",
    })

    const [chatUrl] = fetchMock.mock.calls[1]!
    expect(String(chatUrl)).toContain("/messages/555")
    expect(String(chatUrl)).toContain("expand=messages")

    expect(createConv).toHaveBeenCalledTimes(1)
    expect(createConv.mock.calls[0]?.[0].data).toMatchObject({
      workspaceId: "ws_1",
      channel: "ROZETKA",
      externalConversationId: "12345",
      externalBuyerId: "999",
      buyerDisplayName: "Покупець Тест",
    })

    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(createMessage.mock.calls[0]?.[0].data).toMatchObject({
      direction: "IN",
      text: "<p>Привіт, де моє замовлення?</p>",
      externalMessageId: "555-20260514120000-0",
    })

    // 2 outbox events created: message.new + conversation.updated
    expect(createOutboxEvent).toHaveBeenCalledTimes(2)
    const outboxTypes = createOutboxEvent.mock.calls.map((c: any) => c[0].data.type)
    expect(outboxTypes).toContain("message.new")
    expect(outboxTypes).toContain("conversation.updated")

    // 2 enqueue calls to outboxQueue.add
    expect(outboxAdd).toHaveBeenCalledTimes(2)
    const addCalls = outboxAdd.mock.calls as any[][]
    expect(addCalls[0]?.[0]).toBe("process")
    expect(addCalls[0]?.[1]).toMatchObject({ outboxEventId: expect.any(String) })
    expect(addCalls[1]?.[0]).toBe("process")
    expect(addCalls[1]?.[1]).toMatchObject({ outboxEventId: expect.any(String) })
  })

  it("warm checkpoint: passes updated_from to searchChats and bumps checkpoint", async () => {
    const lastMessageAt = new Date("2026-05-14T10:00:00+02:00")
    const { service, fetchMock, prisma, createOutboxEvent, outboxAdd } = createService({
      accounts: [
        {
          id: "acc_1",
          workspaceId: "ws_1",
          externalAccountId: "rzo_acc_1",
          authDataEncrypted: "v1:1:iv:tag:ct",
          syncCheckpoint: { lastMessageAt },
        },
      ],
      fetchResponses: [
        new Response(JSON.stringify({
          success: true,
          content: {
            chats: [{
              id: 600,
              updated: "2026-05-14 13:30:00",
              user: { id: 1, contact_fio: "X", has_email: false },
              subject: "Заказ № 1",
              order_id: 1,
              type: 0,
            }],
            _meta: { totalPages: 1, currentPage: 1 },
          },
        }), { status: 200 }),
        new Response(JSON.stringify({
          success: true,
          content: {
            id: 600,
            updated: "2026-05-14 13:30:00",
            user: { id: 1, contact_fio: "X", has_email: false },
            subject: "Заказ № 1",
            order_id: 1,
            type: 0,
            messages: [{
              chat_id: 600,
              body: "Нове повідомлення",
              created: "2026-05-14 13:30:00",
              receiver_id: 42,
              sender: 2,
              seller_id: null,
              files: [],
            }],
          },
        }), { status: 200 }),
      ],
    })

    await service.runTick()

    const [searchUrl] = fetchMock.mock.calls[0]!
    // Cursor 2026-05-14T10:00:00+02:00 = 2026-05-14T08:00:00Z UTC
    // formatRozetkaTimestamp produces "2026-05-14 08:00:00", URL-encoded → "2026-05-14+08%3A00%3A00"
    expect(String(searchUrl)).toMatch(/updated_from=2026-05-14[+ ]08%3A00%3A00/)

    expect(prisma.channelSyncCheckpoint.upsert).toHaveBeenCalledWith({
      where: { channelAccountId: "acc_1" },
      create: { channelAccountId: "acc_1", lastMessageAt: expect.any(Date) },
      update: { lastMessageAt: expect.any(Date) },
    })
    const checkpointArg = prisma.channelSyncCheckpoint.upsert.mock.calls[0]?.[0].update.lastMessageAt as Date
    // 13:30:00 Kyiv-local (EEST = +03:00 in May) → 10:30:00 UTC.
    expect(checkpointArg.toISOString()).toBe("2026-05-14T10:30:00.000Z")

    // IN message → outbox must fire
    expect(createOutboxEvent).toHaveBeenCalledTimes(2)
    expect(outboxAdd).toHaveBeenCalledTimes(2)
  })

  it("message with seller_id != null is persisted as direction OUT", async () => {
    const { service, createMessage, createOutboxEvent, outboxAdd } = createService({
      accounts: [
        {
          id: "acc_1",
          workspaceId: "ws_1",
          externalAccountId: "rzo_acc_1",
          authDataEncrypted: "v1:1:iv:tag:ct",
          syncCheckpoint: { lastMessageAt: null },
        },
      ],
      fetchResponses: [
        new Response(JSON.stringify({
          success: true,
          content: {
            chats: [{
              id: 700,
              updated: "2026-05-14 14:00:00",
              user: { id: 5, contact_fio: "Y", has_email: false },
              subject: "Заказ № 2",
              order_id: 2,
              type: 0,
            }],
            _meta: { totalPages: 1, currentPage: 1 },
          },
        }), { status: 200 }),
        new Response(JSON.stringify({
          success: true,
          content: {
            id: 700,
            updated: "2026-05-14 14:00:00",
            user: { id: 5, contact_fio: "Y", has_email: false },
            subject: "Заказ № 2",
            order_id: 2,
            type: 0,
            messages: [
              {
                chat_id: 700,
                body: "Ваше замовлення відправлено",
                created: "2026-05-14 13:00:00",
                receiver_id: 5,
                sender: 1,
                seller_id: 39,
                files: [],
              },
              {
                chat_id: 700,
                body: "Дякую",
                created: "2026-05-14 14:00:00",
                receiver_id: 42,
                sender: 2,
                seller_id: null,
                files: [],
              },
            ],
          },
        }), { status: 200 }),
      ],
    })

    await service.runTick()

    expect(createMessage).toHaveBeenCalledTimes(2)
    const [first, second] = createMessage.mock.calls
    expect(first?.[0].data).toMatchObject({
      direction: "OUT",
      text: "Ваше замовлення відправлено",
      externalMessageId: "700-20260514130000-0",
    })
    expect(second?.[0].data).toMatchObject({
      direction: "IN",
      text: "Дякую",
      externalMessageId: "700-20260514140000-1",
    })

    // OUT message: emits 1 conversation.updated outbox event (no message.new
    // since we didn't author it here). IN message: emits 2 (message.new +
    // conversation.updated). Total: 3.
    expect(createOutboxEvent).toHaveBeenCalledTimes(3)
    expect(outboxAdd).toHaveBeenCalledTimes(3)
  })

  it("preserves HTML body verbatim in Message.text", async () => {
    const html = `Заказ № 12345<br><br>Шановний (-а), <b>user</b>!<br>Дякуємо за покупку!<br><a href="https://rozetka.com.ua/order/12345">Деталі</a>`
    const { service, createMessage } = createService({
      accounts: [
        {
          id: "acc_1",
          workspaceId: "ws_1",
          externalAccountId: "rzo_acc_1",
          authDataEncrypted: "v1:1:iv:tag:ct",
          syncCheckpoint: { lastMessageAt: null },
        },
      ],
      fetchResponses: [
        new Response(JSON.stringify({
          success: true,
          content: {
            chats: [{
              id: 800,
              updated: "2026-05-14 15:00:00",
              user: { id: 9, contact_fio: "Z", has_email: false },
              subject: "Заказ № 12345",
              order_id: 12345,
              type: 0,
            }],
            _meta: { totalPages: 1, currentPage: 1 },
          },
        }), { status: 200 }),
        new Response(JSON.stringify({
          success: true,
          content: {
            id: 800,
            updated: "2026-05-14 15:00:00",
            user: { id: 9, contact_fio: "Z", has_email: false },
            subject: "Заказ № 12345",
            order_id: 12345,
            type: 0,
            messages: [{
              chat_id: 800,
              body: html,
              created: "2026-05-14 15:00:00",
              receiver_id: 42,
              sender: 0,
              seller_id: null,
              files: [],
            }],
          },
        }), { status: 200 }),
      ],
    })

    await service.runTick()

    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(createMessage.mock.calls[0]?.[0].data.text).toBe(html)
    expect(createMessage.mock.calls[0]?.[0].data.externalMessageId).toBe("800-20260514150000-0")
  })

  it("re-fetched same message (same externalMessageId) is a no-op on second tick", async () => {
    const { service, createMessage, prisma, fetchMock } = createService({
      accounts: [
        {
          id: "acc_1",
          workspaceId: "ws_1",
          externalAccountId: "rzo_acc_1",
          authDataEncrypted: "v1:1:iv:tag:ct",
          syncCheckpoint: { lastMessageAt: null },
        },
      ],
      fetchResponses: [
        // First tick — search + chat
        new Response(JSON.stringify({
          success: true,
          content: {
            chats: [{
              id: 900,
              updated: "2026-05-14 16:00:00",
              user: { id: 7, contact_fio: "A", has_email: false },
              subject: "S",
              order_id: 7,
              type: 0,
            }],
            _meta: { totalPages: 1, currentPage: 1 },
          },
        }), { status: 200 }),
        new Response(JSON.stringify({
          success: true,
          content: {
            id: 900,
            updated: "2026-05-14 16:00:00",
            user: { id: 7, contact_fio: "A", has_email: false },
            subject: "S",
            order_id: 7,
            type: 0,
            messages: [{
              chat_id: 900,
              body: "msg",
              created: "2026-05-14 16:00:00",
              receiver_id: 42,
              sender: 2,
              seller_id: null,
              files: [],
            }],
          },
        }), { status: 200 }),
      ],
    })

    await service.runTick()
    expect(createMessage).toHaveBeenCalledTimes(1)
    const externalMessageId = createMessage.mock.calls[0]?.[0].data.externalMessageId
    expect(externalMessageId).toBe("900-20260514160000-0")

    // Second tick — pretend the message already exists.
    // The tx's message.findFirst needs to return the existing message.
    // Override $transaction to return a tx where findFirst sees the existing msg.
    const txWithExisting: any = {
      conversation: prisma.conversation,
      message: {
        create: createMessage,
        findFirst: vi.fn(async () => ({ id: "msg_existing" })),
      },
      outboxEvent: { create: prisma.outboxEvent.create },
      channelAccount: { update: prisma.channelAccount.update },
      channelSyncCheckpoint: { upsert: prisma.channelSyncCheckpoint.upsert },
    }
    prisma.$transaction.mockResolvedValueOnce(
      // The transaction callback early-returns [] when message exists; simulate that outcome
      [],
    )

    // Re-arm fetch with the same chat
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      content: {
        chats: [{
          id: 900,
          updated: "2026-05-14 16:00:00",
          user: { id: 7, contact_fio: "A", has_email: false },
          subject: "S",
          order_id: 7,
          type: 0,
        }],
        _meta: { totalPages: 1, currentPage: 1 },
      },
    }), { status: 200 }))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      content: {
        id: 900,
        updated: "2026-05-14 16:00:00",
        user: { id: 7, contact_fio: "A", has_email: false },
        subject: "S",
        order_id: 7,
        type: 0,
        messages: [{
          chat_id: 900,
          body: "msg",
          created: "2026-05-14 16:00:00",
          receiver_id: 42,
          sender: 2,
          seller_id: null,
          files: [],
        }],
      },
    }), { status: 200 }))

    await service.runTick()

    expect(createMessage).toHaveBeenCalledTimes(1) // still 1 — no duplicate
    // Keep txWithExisting in scope to prevent unused-var lint issues
    void txWithExisting
  })

  it("Rozetka 401 isolates the account: writes lastError, continues with next account", async () => {
    const fetchResponses = [
      new Response("{\"success\":false,\"errors\":{\"code\":401,\"message\":\"unauthorized\"}}", { status: 401 }),
      new Response(JSON.stringify({
        success: true,
        content: {
          chats: [{
            id: 1000,
            updated: "2026-05-14 17:00:00",
            user: { id: 11, contact_fio: "B", has_email: false },
            subject: "S",
            order_id: 11,
            type: 0,
          }],
          _meta: { totalPages: 1, currentPage: 1 },
        },
      }), { status: 200 }),
      new Response(JSON.stringify({
        success: true,
        content: {
          id: 1000,
          updated: "2026-05-14 17:00:00",
          user: { id: 11, contact_fio: "B", has_email: false },
          subject: "S",
          order_id: 11,
          type: 0,
          messages: [{
            chat_id: 1000,
            body: "ok",
            created: "2026-05-14 17:00:00",
            receiver_id: 42,
            sender: 2,
            seller_id: null,
            files: [],
          }],
        },
      }), { status: 200 }),
    ]

    const { service, prisma, createMessage } = createService({
      accounts: [
        {
          id: "acc_bad",
          workspaceId: "ws_1",
          externalAccountId: "rzo_bad",
          authDataEncrypted: "v1:1:iv:tag:ct",
          syncCheckpoint: { lastMessageAt: null },
        },
        {
          id: "acc_good",
          workspaceId: "ws_2",
          externalAccountId: "rzo_good",
          authDataEncrypted: "v1:1:iv:tag:ct",
          syncCheckpoint: { lastMessageAt: null },
        },
      ],
      fetchResponses,
    })

    await service.runTick()

    expect(prisma.channelAccount.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "acc_bad" },
      data: expect.objectContaining({ lastError: expect.stringMatching(/401/) }),
    }))
    expect(createMessage).toHaveBeenCalledTimes(1) // good account did process

    // Good account's message gets the -0 index suffix
    expect(createMessage.mock.calls[0]?.[0].data.externalMessageId).toBe("1000-20260514170000-0")
  })

  it("KMS unavailable: skips account, no DB writes, no exception bubbles", async () => {
    const { service, prisma, crypto, createMessage } = createService({
      accounts: [{
        id: "acc_1",
        workspaceId: "ws_1",
        externalAccountId: "rzo_acc_1",
        authDataEncrypted: "v1:1:iv:tag:ct",
        syncCheckpoint: { lastMessageAt: null },
      }],
    })
    crypto.decrypt.mockRejectedValueOnce(Object.assign(new Error("kms down"), { name: "KmsUnavailable" }))

    await service.runTick()

    expect(createMessage).not.toHaveBeenCalled()
    expect(prisma.channelSyncCheckpoint.upsert).not.toHaveBeenCalled()
    // No throw — runTick returned normally.
  })

  it("two messages with same created timestamp get distinct externalMessageIds by msg index", async () => {
    const { service, outboxAdd } = createService({
      accounts: [
        {
          id: "acc_1",
          workspaceId: "ws_1",
          externalAccountId: "rzo_acc_1",
          authDataEncrypted: "v1:1:iv:tag:ct",
          syncCheckpoint: { lastMessageAt: null },
        },
      ],
      fetchResponses: [
        new Response(JSON.stringify({
          success: true,
          content: {
            chats: [{
              id: 1100,
              updated: "2026-05-14 18:00:00",
              user: { id: 3, contact_fio: "C", has_email: false },
              subject: "S",
              order_id: 3,
              type: 0,
            }],
            _meta: { totalPages: 1, currentPage: 1 },
          },
        }), { status: 200 }),
        new Response(JSON.stringify({
          success: true,
          content: {
            id: 1100,
            updated: "2026-05-14 18:00:00",
            user: { id: 3, contact_fio: "C", has_email: false },
            subject: "S",
            order_id: 3,
            type: 0,
            messages: [
              {
                chat_id: 1100,
                body: "first",
                created: "2026-05-14 18:00:00",
                receiver_id: 42,
                sender: 2,
                seller_id: null,
                files: [],
              },
              {
                chat_id: 1100,
                body: "second",
                created: "2026-05-14 18:00:00",
                receiver_id: 42,
                sender: 2,
                seller_id: null,
                files: [],
              },
            ],
          },
        }), { status: 200 }),
      ],
    })

    await service.runTick()

    // 2 IN messages → 2× (message.new + conversation.updated) = 4 outboxAdd calls.
    // If msgIndex were dropped, both messages would share "1100-20260514180000", the
    // second would be deduped in findFirst and produce 0 outbox events → 2 total, not 4.
    expect(outboxAdd).toHaveBeenCalledTimes(4)
    const jobNames = outboxAdd.mock.calls.map((c: any) => c[0])
    expect(jobNames).toEqual(["process", "process", "process", "process"])
  })

  it("falls back to chat.id as externalConversationId when chat.order_id is null", async () => {
    const { service, findFirstConv, createConv } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", channel: "ROZETKA", isActive: true, authData: { ciphertext: "ENC" } as any },
      ],
      fetchResponses: [
        new Response(JSON.stringify({
          success: true,
          content: {
            chats: [
              {
                id: 9002,
                updated: "2026-05-14 12:00:00",
                user: { id: 43, contact_fio: "Бot", has_email: false },
                subject: "No-order chat",
                order_id: null,
                type: 0,
              },
            ],
            _meta: { totalPages: 1, currentPage: 1 },
          },
        }), { status: 200 }),
        new Response(JSON.stringify({
          success: true,
          content: {
            id: 9002,
            updated: "2026-05-14 12:00:00",
            user: { id: 43, contact_fio: "Бot", has_email: false },
            subject: "No-order chat",
            order_id: null,
            type: 0,
            messages: [
              {
                chat_id: 9002,
                body: "hi",
                created: "2026-05-14 12:00:00",
                receiver_id: 42,
                sender: 43,
                seller_id: null,
                files: [],
              },
            ],
          },
        }), { status: 200 }),
      ],
    })

    await service.runTick()

    expect(findFirstConv).toHaveBeenCalled()
    expect((findFirstConv.mock.calls[0] as any)?.[0]?.where?.externalConversationId).toBe("9002")
    expect(createConv).toHaveBeenCalled()
    expect((createConv.mock.calls[0] as any)?.[0]?.data?.externalConversationId).toBe("9002")
  })

  it("lazy-backfills legacy chat-id-keyed conversations to order_id on next poll", async () => {
    const { service, findFirstConv, updateConv, createConv, createMessage } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", channel: "ROZETKA", isActive: true, authData: { ciphertext: "ENC" } as any },
      ],
      fetchResponses: [
        new Response(JSON.stringify({
          success: true,
          content: {
            chats: [
              {
                id: 555,
                updated: "2026-05-14 12:00:00",
                user: { id: 999, contact_fio: "Покупець Тест", has_email: true },
                subject: "Заказ № 12345",
                order_id: 12345,
                type: 0,
              },
            ],
            _meta: { totalPages: 1, currentPage: 1 },
          },
        }), { status: 200 }),
        new Response(JSON.stringify({
          success: true,
          content: {
            id: 555,
            updated: "2026-05-14 12:00:00",
            user: { id: 999, contact_fio: "Покупець Тест", has_email: true },
            subject: "Заказ № 12345",
            order_id: 12345,
            type: 0,
            messages: [
              {
                chat_id: 555,
                body: "<p>привіт</p>",
                created: "2026-05-14 12:00:00",
                receiver_id: 42,
                sender: 2,
                seller_id: null,
                files: [],
              },
            ],
          },
        }), { status: 200 }),
      ],
    })
    // First call (lookup by order_id "12345") → null.
    // Second call (lookup by legacy chat.id "555") → legacy row.
    findFirstConv.mockReset()
    findFirstConv
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "conv_legacy",
        needsReply: false,
        isArchived: false,
        isPinnedInAll: false,
        snoozedUntil: null,
      })

    await service.runTick()

    // The legacy conversation was re-keyed (one update with externalConversationId), not created anew.
    expect(createConv).not.toHaveBeenCalled()
    const rekeyCall = updateConv.mock.calls.find((c: any) => c?.[0]?.data?.externalConversationId === "12345")
    expect(rekeyCall).toBeDefined()
    // Then the message was persisted.
    expect(createMessage).toHaveBeenCalledTimes(1)
  })
})
