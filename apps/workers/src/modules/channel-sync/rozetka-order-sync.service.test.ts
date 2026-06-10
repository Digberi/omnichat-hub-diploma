import { describe, expect, it, vi } from "vitest"

import { RozetkaOrderSyncService } from "./rozetka-order-sync.service"

type ServiceInput = {
  accounts?: any[]
  fetchResponses?: Response[]
  configValues?: Record<string, unknown>
  /** override the lastSeenStatus returned by findUnique on rozetkaOrderState */
  prevState?: { lastSeenStatus: string } | null
  /** override conversation findFirst result (default null = create new) */
  existingConversation?: {
    id: string
    needsReply: boolean
    isArchived: boolean
    isPinnedInAll: boolean
    snoozedUntil: Date | null
  } | null
  /** make crypto.decrypt fail once, then succeed */
  cryptoFailOnce?: boolean
}

function createService(input: ServiceInput = {}) {
  const findManyAccounts = vi.fn(async () => input.accounts ?? [])
  const updateAccount = vi.fn(async () => ({}))

  const findFirstConv = vi.fn(async () => input.existingConversation as any)
  const createConv = vi.fn(async ({ data }: any) => ({
    id: "conv_new",
    needsReply: false,
    isArchived: false,
    isPinnedInAll: false,
    snoozedUntil: null,
    ...data,
  }))
  const updateConv = vi.fn(async () => ({}))
  const findFirstMsg = vi.fn(async () => null as any)
  const createMessage = vi.fn(async ({ data }: any) => ({
    id: `msg_${Math.random().toString(36).slice(2, 8)}`,
    conversationId: data.conversationId,
    direction: data.direction,
    text: data.text,
    clientMessageId: null,
    createdAt: new Date(),
    sentAt: data.sentAt ?? new Date(),
    deliveryStatus: data.deliveryStatus ?? "DELIVERED",
    errorCode: null,
    errorMessage: null,
    ...data,
  }))
  const findUniqueState = vi.fn(async () => input.prevState as any)
  const upsertState = vi.fn(async () => ({}))
  const createOutbox = vi.fn(async ({ data }: any) => ({
    id: `out_${Math.random().toString(36).slice(2, 8)}`,
    ...data,
  }))

  const tx = {
    conversation: { findFirst: findFirstConv, create: createConv, update: updateConv },
    message: { findFirst: findFirstMsg, create: createMessage },
    rozetkaOrderState: { findUnique: findUniqueState, upsert: upsertState },
    outboxEvent: { create: createOutbox },
  }

  const prisma: any = {
    channelAccount: { findMany: findManyAccounts, update: updateAccount },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  }

  let cryptoCallCount = 0
  const crypto: any = {
    decrypt: vi.fn(async () => {
      cryptoCallCount += 1
      if (input.cryptoFailOnce && cryptoCallCount === 1) {
        throw new Error("kms unavailable")
      }
      return { apiToken: "fake-token", apiBaseUrl: "https://api-seller.rozetka.com.ua" }
    }),
  }

  const fetchMock = vi.fn()
  for (const r of input.fetchResponses ?? []) fetchMock.mockResolvedValueOnce(r)

  const config: any = {
    get: vi.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        CHANNEL_SYNC_ROZETKA_MAX_ACCOUNTS: 50,
        CHANNEL_SYNC_ROZETKA_ORDERS_LIMIT: 50,
        ROZETKA_REQUEST_TIMEOUT_MS: 8000,
      }
      return input.configValues?.[key] ?? defaults[key]
    }),
  }

  const logger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), setContext: vi.fn() }
  const outboxAdd = vi.fn(async () => ({}))
  const outboxQueue: any = { add: outboxAdd }

  const service = new RozetkaOrderSyncService(prisma, crypto, config, logger, outboxQueue)
  service.setFetch(fetchMock as any)
  return {
    service,
    findManyAccounts,
    updateAccount,
    findFirstConv,
    createConv,
    updateConv,
    findFirstMsg,
    createMessage,
    findUniqueState,
    upsertState,
    createOutbox,
    outboxAdd,
    fetchMock,
    crypto,
  }
}

const orderJsonResponse = (orders: any[]): Response =>
  new Response(JSON.stringify({ success: true, content: { orders } }), { status: 200 })

const statusJsonResponse = (statuses: Array<{ id: number; name_uk?: string; name?: string }> = []): Response =>
  new Response(JSON.stringify({ success: true, content: { orderStatus: statuses } }), { status: 200 })

describe("RozetkaOrderSyncService", () => {
  it("returns without calling fetch when there are no Rozetka accounts", async () => {
    const { service, findManyAccounts, fetchMock } = createService({ accounts: [] })
    await service.runTick()
    expect(findManyAccounts).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("creates conversation + IN 'order created' message for a new order", async () => {
    const { service, createConv, createMessage, upsertState, outboxAdd } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", externalAccountId: "ext_1", authDataEncrypted: "ENC" },
      ],
      fetchResponses: [
        orderJsonResponse([
          {
            id: 7777,
            status: 1,
            amount: "1250.00",
            cost_with_discount: "1200.00",
            created: "2026-05-14 10:00:00",
            user_title: { full_name: "Іван Тест" },
            user_phone: "+380501234567",
            purchases: [
              { item_name: "Чохол", quantity: 2 },
              { item_name: "Скло", quantity: 1 },
            ],
          },
        ]),
        statusJsonResponse([
          { id: 1, name_uk: "Новий" },
          { id: 26, name_uk: "Очікує оплати" },
        ]),
      ],
    })

    await service.runTick()

    expect(createConv).toHaveBeenCalledTimes(1)
    expect((createConv.mock.calls[0] as any)?.[0]?.data?.externalConversationId).toBe("7777")
    expect((createConv.mock.calls[0] as any)?.[0]?.data?.buyerDisplayName).toBe("Іван Тест")
    expect(createMessage).toHaveBeenCalledTimes(1)
    const created = (createMessage.mock.calls[0] as any)?.[0]?.data
    expect(created.direction).toBe("IN")
    expect(created.externalMessageId).toBe("order:7777:created")
    expect(created.text).toContain("Замовлення #7777")
    expect(created.text).toContain("Чохол ×2")
    expect(created.text).toContain("Скло ×1")
    expect(created.text).toContain("1200.00")
    expect(created.text).toContain("Новий (1)")
    expect(created.text).toContain("Адмінка: https://seller.rozetka.com.ua/main/orders/edit/7777")
    // Plain text only — no HTML tags would render literally in the inbox.
    expect(created.text).not.toContain("<")
    // Structured metadata is also persisted alongside text so the web inbox
    // can render a card without parsing the text body.
    const meta = (createMessage.mock.calls[0] as any)?.[0]?.data?.metadata
    expect(meta).toMatchObject({
      kind: "rozetka_order_created",
      schemaVersion: 1,
      orderId: "7777",
      amount: "1200.00",
      status: { id: "1", name: "Новий" },
      photoUrl: null,
      adminUrl: "https://seller.rozetka.com.ua/main/orders/edit/7777",
    })
    expect(meta.items).toEqual([
      { name: "Чохол", quantity: 2 },
      { name: "Скло", quantity: 1 },
    ])
    expect(upsertState).toHaveBeenCalled()
    expect(outboxAdd).toHaveBeenCalled()
  })

  it("includes the first item photo as a plain URL line when items_photos is present", async () => {
    const { service, createMessage } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", externalAccountId: "ext_1", authDataEncrypted: "ENC" },
      ],
      fetchResponses: [
        orderJsonResponse([
          {
            id: 9999,
            status: 1,
            amount: "500.00",
            created: "2026-05-14 10:00:00",
            purchases: [{ item_name: "Чохол", quantity: 1 }],
            items_photos: [
              { id: 100, url: "https://content.rozetka.com.ua/goods/photo.jpg", item_name: "Чохол" },
              { id: 101, url: "https://content.rozetka.com.ua/goods/photo2.jpg", item_name: "Інше" },
            ],
          },
        ]),
        statusJsonResponse(),
      ],
    })

    await service.runTick()
    const text = (createMessage.mock.calls[0] as any)?.[0]?.data?.text as string
    expect(text).toContain("Фото: https://content.rozetka.com.ua/goods/photo.jpg")
    // Only the first photo is shown.
    expect(text).not.toContain("photo2.jpg")
  })

  it("omits the photo line when items_photos is empty or missing", async () => {
    const { service, createMessage } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", externalAccountId: "ext_1", authDataEncrypted: "ENC" },
      ],
      fetchResponses: [
        orderJsonResponse([
          {
            id: 7777,
            status: 1,
            amount: "100.00",
            created: "2026-05-14 10:00:00",
            purchases: [],
          },
        ]),
        statusJsonResponse(),
      ],
    })

    await service.runTick()
    const text = (createMessage.mock.calls[0] as any)?.[0]?.data?.text as string
    expect(text).not.toContain("Фото:")
  })

  it("sets sentAt to the order's created timestamp (parsed from Kyiv-local) for new-order messages", async () => {
    const { service, createMessage } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", externalAccountId: "ext_1", authDataEncrypted: "ENC" },
      ],
      fetchResponses: [
        orderJsonResponse([
          {
            id: 7777,
            status: 1,
            amount: "1250.00",
            created: "2026-05-12 18:03:18",
            purchases: [],
          },
        ]),
        statusJsonResponse(),
      ],
    })

    await service.runTick()
    expect(createMessage).toHaveBeenCalledTimes(1)
    const sentAt = (createMessage.mock.calls[0] as any)?.[0]?.data?.sentAt as Date
    // 18:03:18 Kyiv (+02:00) → 16:03:18 UTC
    // 18:03:18 Kyiv-local (EEST = +03:00 in May) → 15:03:18 UTC.
    expect(sentAt.toISOString()).toBe("2026-05-12T15:03:18.000Z")
  })

  it("emits no message when an order is seen again with the same status", async () => {
    const { service, createMessage, upsertState } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", externalAccountId: "ext_1", authDataEncrypted: "ENC" },
      ],
      prevState: { lastSeenStatus: "1" },
      existingConversation: {
        id: "conv_existing",
        needsReply: false,
        isArchived: false,
        isPinnedInAll: false,
        snoozedUntil: null,
      },
      fetchResponses: [
        orderJsonResponse([
          { id: 7777, status: 1, amount: "1250.00", created: "2026-05-14 10:00:00", purchases: [] },
        ]),
      ],
    })

    await service.runTick()
    expect(createMessage).not.toHaveBeenCalled()
    expect(upsertState).toHaveBeenCalled()
  })

  it("emits a 'status changed' IN message when order status differs from lastSeenStatus", async () => {
    const { service, createMessage } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", externalAccountId: "ext_1", authDataEncrypted: "ENC" },
      ],
      prevState: { lastSeenStatus: "1" },
      existingConversation: {
        id: "conv_existing",
        needsReply: false,
        isArchived: false,
        isPinnedInAll: false,
        snoozedUntil: null,
      },
      fetchResponses: [
        orderJsonResponse([
          { id: 7777, status: 3, amount: "1250.00", created: "2026-05-14 10:00:00", purchases: [] },
        ]),
        statusJsonResponse(),
      ],
    })

    await service.runTick()
    expect(createMessage).toHaveBeenCalledTimes(1)
    const created = (createMessage.mock.calls[0] as any)?.[0]?.data
    expect(created.externalMessageId).toMatch(/^order:7777:status:3:\d+$/)
    expect(created.text).toContain("1")
    expect(created.text).toContain("3")
    expect(created.text).toContain("Замовлення")
    // Structured metadata for status-change events.
    expect(created.metadata).toMatchObject({
      kind: "rozetka_order_status_changed",
      schemaVersion: 1,
      orderId: "7777",
      from: { id: "1", name: "Нове замовлення" },
      // Status 3 IS in the canonical Rozetka §9.1 table (Передано службі
      // доставки) — older test expected null because we hadn't filled that
      // id in the previous fallback map.
      to: { id: "3", name: "Передано службі доставки" },
      adminUrl: "https://seller.rozetka.com.ua/main/orders/edit/7777",
    })
  })

  it("isolates a 401 on one account from another account", async () => {
    const { service, createMessage } = createService({
      accounts: [
        { id: "acc_A", workspaceId: "ws_1", externalAccountId: "ext_A", authDataEncrypted: "ENCA" },
        { id: "acc_B", workspaceId: "ws_1", externalAccountId: "ext_B", authDataEncrypted: "ENCB" },
      ],
      fetchResponses: [
        new Response("Unauthorized", { status: 401 }),
        orderJsonResponse([
          { id: 9001, status: 1, amount: "50.00", created: "2026-05-14 10:00:00", purchases: [] },
        ]),
        statusJsonResponse(),
      ],
    })

    await service.runTick()
    expect(createMessage).toHaveBeenCalledTimes(1)
    const created = (createMessage.mock.calls[0] as any)?.[0]?.data
    expect(created.externalMessageId).toBe("order:9001:created")
  })

  it("skips an account when KMS decrypt fails and continues to the next", async () => {
    const { service, createMessage, fetchMock } = createService({
      accounts: [
        { id: "acc_A", workspaceId: "ws_1", externalAccountId: "ext_A", authDataEncrypted: "ENCA" },
        { id: "acc_B", workspaceId: "ws_1", externalAccountId: "ext_B", authDataEncrypted: "ENCB" },
      ],
      cryptoFailOnce: true,
      fetchResponses: [
        orderJsonResponse([
          { id: 9002, status: 1, amount: "50.00", created: "2026-05-14 10:00:00", purchases: [] },
        ]),
        statusJsonResponse(),
      ],
    })

    await service.runTick()
    // Account A skipped (KMS); account B fetches orders + statuses.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(createMessage).toHaveBeenCalledTimes(1)
  })

  it("treats {success: false} from Rozetka as a hard error (writes lastError, no message)", async () => {
    const { service, updateAccount, createMessage } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", externalAccountId: "ext_1", authDataEncrypted: "ENC" },
      ],
      fetchResponses: [
        new Response(JSON.stringify({ success: false, content: { orders: [] }, errors: ["forbidden"] }), {
          status: 200,
        }),
      ],
    })

    await service.runTick()
    expect(createMessage).not.toHaveBeenCalled()
    // updateAccount was called with lastError set (the catch-block branch)
    const calls = updateAccount.mock.calls.map((c: any) => c[0])
    const errorCall = calls.find((c: any) => c?.data?.lastError)
    expect(errorCall).toBeDefined()
    expect(String(errorCall.data.lastError)).toContain("success=false")
  })

  it("fetches /orders/search filtered by changed_from = today-1 sorted by -changed", async () => {
    const { service, fetchMock } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", externalAccountId: "ext_1", authDataEncrypted: "ENC" },
      ],
      fetchResponses: [orderJsonResponse([])],
    })

    await service.runTick()
    expect(fetchMock).toHaveBeenCalled()
    const url = String(fetchMock.mock.calls[0]?.[0] ?? "")
    expect(url).toMatch(/sort=-changed/)
    expect(url).toMatch(/changed_from=\d{4}-\d{2}-\d{2}/)
    // Without types=1 the API silently filters out cancelled orders (status_group=3),
    // because the singular `type` parameter defaults to 1 ("Processing"). See PDF §8.2.
    expect(url).toMatch(/types=1\b/)
  })

  it("populates Conversation.context* on create from order purchases + items_photos", async () => {
    const { service, createConv } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", externalAccountId: "ext_1", authDataEncrypted: "ENC" },
      ],
      fetchResponses: [
        orderJsonResponse([
          {
            id: 12345,
            status: 1,
            amount: "750.00",
            created: "2026-05-14 10:00:00",
            purchases: [{ item_name: "Кросівки Nike дитячі 32р.", quantity: 1 }],
            items_photos: [
              {
                id: 555,
                url: "https://cdn.rozetka.ua/img/abc.jpg",
                item_name: "Кросівки Nike дитячі 32р.",
                item_url: "https://rozetka.com.ua/krossovki_nike/p123/",
                item_price: "750",
              },
            ],
          },
        ]),
        statusJsonResponse(),
      ],
    })

    await service.runTick()
    expect(createConv).toHaveBeenCalledTimes(1)
    const data = (createConv.mock.calls[0] as any)?.[0]?.data
    expect(data.contextType).toBe("ORDER")
    expect(data.contextTitle).toBe("Кросівки Nike дитячі 32р.")
    expect(data.contextPrice).toBe(750)
    expect(data.contextCurrency).toBe("UAH")
    expect(data.contextThumbUrl).toBe("https://cdn.rozetka.ua/img/abc.jpg")
    expect(data.contextExternalUrl).toBe("https://rozetka.com.ua/krossovki_nike/p123/")
    expect(data.contextExternalId).toBe("12345")
  })

  it("lazy-fills Conversation.context* on an existing conversation with contextType=null", async () => {
    const { service, createConv, updateConv } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", externalAccountId: "ext_1", authDataEncrypted: "ENC" },
      ],
      existingConversation: {
        id: "conv_existing",
        needsReply: false,
        isArchived: false,
        isPinnedInAll: false,
        snoozedUntil: null,
        contextType: null,
      } as any,
      fetchResponses: [
        orderJsonResponse([
          {
            id: 8888,
            status: 1,
            amount: "200.00",
            created: "2026-05-14 10:00:00",
            purchases: [{ item_name: "Тапки", quantity: 2 }],
            items_photos: [
              { id: 99, url: "https://cdn.rozetka.ua/img/tapki.jpg", item_name: "Тапки", item_price: "100" },
            ],
          },
        ]),
        statusJsonResponse(),
      ],
    })

    await service.runTick()
    expect(createConv).not.toHaveBeenCalled()
    // The lazy-fill update will be the one with contextType="ORDER" — there's
    // also an activity bump (lastIncomingAt) call but that doesn't set context.
    const ctxFill = updateConv.mock.calls.find((c: any) => c?.[0]?.data?.contextType === "ORDER")
    expect(ctxFill).toBeTruthy()
    expect((ctxFill as any)[0].data.contextTitle).toBe("Тапки")
    expect((ctxFill as any)[0].data.contextPrice).toBe(100)
  })

  it("reuses an existing conversation when one already exists (e.g. created by chat sync)", async () => {
    const { service, createConv, updateConv } = createService({
      accounts: [
        { id: "acc_1", workspaceId: "ws_1", externalAccountId: "ext_1", authDataEncrypted: "ENC" },
      ],
      existingConversation: {
        id: "conv_existing",
        needsReply: false,
        isArchived: false,
        isPinnedInAll: false,
        snoozedUntil: null,
      },
      fetchResponses: [
        orderJsonResponse([
          { id: 8888, status: 1, amount: "99.00", created: "2026-05-14 10:00:00", purchases: [] },
        ]),
        statusJsonResponse(),
      ],
    })

    await service.runTick()
    expect(createConv).not.toHaveBeenCalled()
    expect(updateConv).toHaveBeenCalled()
  })
})
