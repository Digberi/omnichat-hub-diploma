import { describe, expect, it, vi } from "vitest"

import { OlxUaSyncService } from "./olx-ua-sync.service"

const jsonResponse = (body: unknown, init: ResponseInit = { status: 200 }): Response =>
  new Response(JSON.stringify(body), init)

const defaultConfig: Record<string, unknown> = {
  CHANNEL_SYNC_OLX_MAX_ACCOUNTS: 50,
  CHANNEL_SYNC_OLX_LIMIT: 100,
  OLX_BASE_URL: "https://www.olx.ua",
  OLX_REQUEST_TIMEOUT_MS: 10000,
  OLX_CLIENT_ID: "cid",
  OLX_CLIENT_SECRET: "csec",
}

type CreateInput = {
  accounts?: any[]
  fetchResponses?: Response[]
  configValues?: Record<string, unknown>
  existingConversation?: {
    id: string
    needsReply: boolean
    isArchived: boolean
    isPinnedInAll: boolean
    snoozedUntil: Date | null
  } | null
  decryptResult?: { accessToken: string; refreshToken?: string | null }
}

function createService(input: CreateInput = {}) {
  const findManyAccounts = vi.fn(async () => input.accounts ?? [])
  const updateAccount = vi.fn(async () => ({}))
  const findFirstConv = vi.fn(async () => input.existingConversation as any)
  const createConv = vi.fn(async ({ data }: any) => ({
    id: "conv-new",
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
  const createOutbox = vi.fn(async ({ data }: any) => ({
    id: `out_${Math.random().toString(36).slice(2, 8)}`,
    ...data,
  }))
  const checkpointUpsert = vi.fn(async () => ({}))

  const tx = {
    conversation: { findFirst: findFirstConv, create: createConv, update: updateConv },
    message: { findFirst: findFirstMsg, create: createMessage },
    outboxEvent: { create: createOutbox },
    channelSyncCheckpoint: { upsert: checkpointUpsert },
  }
  // Top-level `prisma.conversation.findFirst` is the read-only pre-check the
  // service runs to decide whether to fetch the OLX advert for context fill.
  // Mirrors `findFirstConv` so the same `existingConversation` fixture works
  // for both call sites (pre-tx and inside-tx).
  const findFirstConvTopLevel = vi.fn(async () => {
    const ex = input.existingConversation as any
    return ex ? { contextType: ex.contextType ?? null } : null
  })
  const prisma: any = {
    channelAccount: { findMany: findManyAccounts, update: updateAccount },
    channelSyncCheckpoint: { upsert: checkpointUpsert },
    conversation: { findFirst: findFirstConvTopLevel },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  }

  const cryptoDecrypt = vi.fn(async () => input.decryptResult ?? { accessToken: "TOKEN", refreshToken: "REFRESH" })
  const cryptoEncrypt = vi.fn(async () => "REENC")
  const crypto: any = { decrypt: cryptoDecrypt, encrypt: cryptoEncrypt }

  const fetchMock = vi.fn()
  for (const r of input.fetchResponses ?? []) fetchMock.mockResolvedValueOnce(r)

  const config: any = {
    get: vi.fn((k: string) => (input.configValues?.[k] ?? defaultConfig[k])),
  }
  const logger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), setContext: vi.fn() }
  const outboxAdd = vi.fn(async () => ({}))
  const outboxQueue: any = { add: outboxAdd }

  const service = new OlxUaSyncService(prisma, crypto, config, logger, outboxQueue)
  service.setFetch(fetchMock as any)
  return {
    service,
    findManyAccounts,
    updateAccount,
    findFirstConv,
    createConv,
    updateConv,
    createMessage,
    createOutbox,
    checkpointUpsert,
    fetchMock,
    cryptoDecrypt,
    cryptoEncrypt,
    outboxAdd,
  }
}

describe("OlxUaSyncService", () => {
  it("returns without fetching when no OLX accounts are active", async () => {
    const { service, findManyAccounts, fetchMock } = createService({ accounts: [] })
    await service.runTick()
    expect(findManyAccounts).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("creates conversation + IN message for a new OLX thread", async () => {
    const { service, createConv, createMessage, outboxAdd, fetchMock } = createService({
      accounts: [
        {
          id: "acc-1",
          workspaceId: "ws-1",
          externalAccountId: "user-9",
          authDataEncrypted: "ENC",
          syncCheckpoint: null,
        },
      ],
      fetchResponses: [
        jsonResponse({
          data: [{ id: 4242, interlocutor: { id: 555, name: "Buyer Test" }, advert: { id: 999, title: "ad" } }],
          links: { next: null },
        }),
        jsonResponse({
          data: [
            {
              id: 700001,
              thread_id: 4242,
              type: "received",
              text: "Привіт",
              created_at: "2026-05-14T18:00:00+03:00",
            },
          ],
        }),
      ],
    })

    await service.runTick()

    const firstCall = fetchMock.mock.calls[0]
    expect(String(firstCall?.[0])).toContain("/api/partner/threads")
    expect((firstCall?.[1] as any)?.headers?.Authorization).toBe("Bearer TOKEN")
    expect((firstCall?.[1] as any)?.headers?.Version).toBe("2.0")

    expect(createConv).toHaveBeenCalledTimes(1)
    expect((createConv.mock.calls[0] as any)?.[0]?.data?.externalConversationId).toBe("4242")
    expect((createConv.mock.calls[0] as any)?.[0]?.data?.buyerDisplayName).toBe("Buyer Test")
    expect(createMessage).toHaveBeenCalledTimes(1)
    const created = (createMessage.mock.calls[0] as any)?.[0]?.data
    expect(created.direction).toBe("IN")
    expect(created.externalMessageId).toBe("700001")
    expect(created.text).toBe("Привіт")
    expect(outboxAdd).toHaveBeenCalled()
  })

  it("reads flat advert_id from OLX v2 threads listing (real production shape)", async () => {
    const { service, createConv, fetchMock } = createService({
      accounts: [
        { id: "acc-1", workspaceId: "ws-1", externalAccountId: "user-9", authDataEncrypted: "ENC", syncCheckpoint: null },
      ],
      fetchResponses: [
        // 1) GET /threads — OLX v2 returns flat `advert_id` + `interlocutor_id`, NOT nested objects.
        jsonResponse({
          data: [{ id: 4242, advert_id: 777, interlocutor_id: 123 }],
          links: { next: null },
        }),
        // 2) GET /threads/4242/messages
        jsonResponse({
          data: [
            { id: 700001, thread_id: 4242, type: "received", text: "Hi", created_at: "2026-05-14T18:00:00+03:00" },
          ],
        }),
        // 3) GET /adverts/777 (resolved from flat advert_id)
        jsonResponse({
          data: { id: 777, title: "Real prod ad", url: "https://www.olx.ua/d/x.html", images: [{ url: "https://apollo.olxcdn.com/x.jpg" }], price: { value: 500, currency: "UAH" } },
        }),
      ],
    })

    await service.runTick()

    // Confirm advertId was extracted from flat `advert_id` (not nested) and used.
    const advertFetch = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/partner/adverts/777"))
    expect(advertFetch).toBeTruthy()

    expect(createConv).toHaveBeenCalledTimes(1)
    const createData = (createConv.mock.calls[0] as any)?.[0]?.data
    expect(createData.contextTitle).toBe("Real prod ad")
    expect(createData.contextExternalId).toBe("777")
    // Interlocutor name is unavailable in flat shape — buyerName falls back
    // to "OLX buyer {id}". This is the current expected behavior on prod.
    expect(createData.buyerDisplayName).toBe("OLX buyer 123")
    expect(createData.externalBuyerId).toBe("123")
  })

  it("falls back to GET /threads/{id} when listing omits advert_id", async () => {
    const { service, createConv, fetchMock } = createService({
      accounts: [
        { id: "acc-1", workspaceId: "ws-1", externalAccountId: "user-9", authDataEncrypted: "ENC", syncCheckpoint: null },
      ],
      fetchResponses: [
        // 1) GET /threads — listing without advert_id (some OLX accounts/scopes trim it)
        jsonResponse({
          data: [{ id: 4242, interlocutor_id: 123 }],
          links: { next: null },
        }),
        // 2) GET /threads/4242/messages
        jsonResponse({
          data: [
            { id: 700001, thread_id: 4242, type: "received", text: "Hi", created_at: "2026-05-14T18:00:00+03:00" },
          ],
        }),
        // 3) GET /threads/4242 (per-thread fallback) — returns advert_id
        jsonResponse({ data: { id: 4242, advert_id: 888, interlocutor_id: 123 } }),
        // 4) GET /adverts/888
        jsonResponse({
          data: { id: 888, title: "Recovered via fallback", url: null, images: [], price: { value: 100, currency: "UAH" } },
        }),
      ],
    })

    await service.runTick()

    const fallback = fetchMock.mock.calls.find(
      (c) => String(c[0]).endsWith("/api/partner/threads/4242"),
    )
    expect(fallback).toBeTruthy()
    expect(createConv).toHaveBeenCalledTimes(1)
    expect((createConv.mock.calls[0] as any)?.[0]?.data?.contextExternalId).toBe("888")
  })

  it("populates Conversation.context* on create when thread.advert exists and /adverts/{id} returns details", async () => {
    const { service, createConv, updateConv, fetchMock } = createService({
      accounts: [
        {
          id: "acc-1",
          workspaceId: "ws-1",
          externalAccountId: "user-9",
          authDataEncrypted: "ENC",
          syncCheckpoint: null,
        },
      ],
      fetchResponses: [
        // 1) GET /threads
        jsonResponse({
          data: [{ id: 4242, interlocutor: { id: 555, name: "Buyer" }, advert: { id: 999, title: "ad" } }],
          links: { next: null },
        }),
        // 2) GET /threads/4242/messages
        jsonResponse({
          data: [
            {
              id: 700001,
              thread_id: 4242,
              type: "received",
              text: "Привіт",
              created_at: "2026-05-14T18:00:00+03:00",
            },
          ],
        }),
        // 3) GET /adverts/999 (called once, shared between delivery-card path and context fill)
        jsonResponse({
          data: {
            id: 999,
            title: "Дитячі кросівки Nike, 32 розмір",
            url: "https://www.olx.ua/d/uk/obyavlenie/-IDexample.html",
            images: [{ url: "https://apollo.olxcdn.com/v1/files/abc.jpg" }],
            price: { value: 750, currency: "UAH" },
          },
        }),
      ],
    })

    await service.runTick()

    expect(createConv).toHaveBeenCalledTimes(1)
    const createData = (createConv.mock.calls[0] as any)?.[0]?.data
    expect(createData.contextType).toBe("LISTING")
    expect(createData.contextTitle).toBe("Дитячі кросівки Nike, 32 розмір")
    expect(createData.contextPrice).toBe(750)
    expect(createData.contextCurrency).toBe("UAH")
    expect(createData.contextThumbUrl).toBe("https://apollo.olxcdn.com/v1/files/abc.jpg")
    expect(createData.contextExternalUrl).toBe("https://www.olx.ua/d/uk/obyavlenie/-IDexample.html")
    expect(createData.contextExternalId).toBe("999")

    // Verify the advert fetch hit /adverts/999 exactly once (shared call,
    // not duplicated for delivery-notice + context).
    const advertCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/partner/adverts/999"),
    )
    expect(advertCalls.length).toBe(1)

    // No lazy-fill update because context was inlined into the create.
    // (The IN-message handler does call conversation.update once to bump
    // lastIncomingAt/needsReply; that's expected and unrelated to context.)
    const contextUpdate = updateConv.mock.calls.find(
      (c: any) => c?.[0]?.data?.contextType === "LISTING",
    )
    expect(contextUpdate).toBeUndefined()
  })

  it("lazy-fills context on an existing OLX conversation that has contextType=null", async () => {
    const { service, createConv, updateConv } = createService({
      accounts: [
        {
          id: "acc-1",
          workspaceId: "ws-1",
          externalAccountId: "user-9",
          authDataEncrypted: "ENC",
          syncCheckpoint: null,
        },
      ],
      existingConversation: {
        id: "conv-existing",
        needsReply: false,
        isArchived: false,
        isPinnedInAll: false,
        snoozedUntil: null,
        // contextType is undefined → mock returns { contextType: null }
      } as any,
      fetchResponses: [
        jsonResponse({
          data: [{ id: 4242, interlocutor: { id: 555, name: "Buyer" }, advert: { id: 999, title: "ad" } }],
          links: { next: null },
        }),
        jsonResponse({
          data: [
            {
              id: 700001,
              thread_id: 4242,
              type: "received",
              text: "Hi",
              created_at: "2026-05-14T18:00:00+03:00",
            },
          ],
        }),
        jsonResponse({
          data: {
            id: 999,
            title: "Older listing",
            url: "https://www.olx.ua/d/uk/obyavlenie/-IDold.html",
            images: [{ url: "https://apollo.olxcdn.com/v1/files/old.jpg" }],
            price: { value: 200, currency: "UAH" },
          },
        }),
      ],
    })

    await service.runTick()

    expect(createConv).not.toHaveBeenCalled()
    // The first update is the context lazy-fill; subsequent update is the
    // standard lastIncomingAt/needsReply bump. Find the context one.
    const contextFillCall = updateConv.mock.calls.find((c: any) => c?.[0]?.data?.contextType === "LISTING")
    expect(contextFillCall).toBeTruthy()
    const fillData = (contextFillCall as any)[0].data
    expect(fillData.contextTitle).toBe("Older listing")
    expect(fillData.contextPrice).toBe(200)
    expect(fillData.contextExternalId).toBe("999")
  })

  it("skips advert fetch entirely when conversation already has context (no thread.advert OR contextType set)", async () => {
    const { service, fetchMock } = createService({
      accounts: [
        {
          id: "acc-1",
          workspaceId: "ws-1",
          externalAccountId: "user-9",
          authDataEncrypted: "ENC",
          syncCheckpoint: null,
        },
      ],
      existingConversation: {
        id: "conv-existing",
        needsReply: false,
        isArchived: false,
        isPinnedInAll: false,
        snoozedUntil: null,
        contextType: "LISTING",
      } as any,
      fetchResponses: [
        jsonResponse({
          data: [{ id: 4242, interlocutor: { id: 555, name: "Buyer" }, advert: { id: 999, title: "ad" } }],
          links: { next: null },
        }),
        jsonResponse({
          data: [
            {
              id: 700001,
              thread_id: 4242,
              type: "received",
              text: "Hi",
              created_at: "2026-05-14T18:00:00+03:00",
            },
          ],
        }),
      ],
    })

    await service.runTick()

    const advertCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/partner/adverts/"),
    )
    expect(advertCalls.length).toBe(0)
  })

  it("classifies message as OUT when type is \"sent\"", async () => {
    const { service, createMessage, outboxAdd } = createService({
      accounts: [
        {
          id: "acc-1",
          workspaceId: "ws-1",
          externalAccountId: "u-9",
          authDataEncrypted: "ENC",
          syncCheckpoint: null,
        },
      ],
      existingConversation: {
        id: "conv-existing",
        needsReply: false,
        isArchived: false,
        isPinnedInAll: false,
        snoozedUntil: null,
      },
      fetchResponses: [
        jsonResponse({ data: [{ id: 1, interlocutor: { id: 5, name: "B" } }] }),
        jsonResponse({
          data: [
            {
              id: 999,
              thread_id: 1,
              type: "sent",
              text: "Hello back",
              created_at: "2026-05-14T18:00:00+03:00",
            },
          ],
        }),
      ],
    })

    await service.runTick()
    expect(createMessage).toHaveBeenCalledTimes(1)
    expect((createMessage.mock.calls[0] as any)?.[0]?.data?.direction).toBe("OUT")
    // OUT path still skips message.new (we didn't author this through our app)
    // but DOES emit a single conversation.updated so connected web clients
    // clear the needsReply badge in real time when the seller replies via OLX.
    expect(outboxAdd).toHaveBeenCalledTimes(1)
  })

  it("isolates per-account failures: 401 on account A does not stop account B", async () => {
    const { service, createMessage, updateAccount, cryptoDecrypt } = createService({
      accounts: [
        { id: "acc-A", workspaceId: "ws-1", externalAccountId: "u-A", authDataEncrypted: "ENCA", syncCheckpoint: null },
        { id: "acc-B", workspaceId: "ws-1", externalAccountId: "u-B", authDataEncrypted: "ENCB", syncCheckpoint: null },
      ],
      // For account A: 401 from threads + no refresh token → fatal for that account
      // For account B: success
      fetchResponses: [
        new Response("unauth", { status: 401 }),
        jsonResponse({ data: [{ id: 7, interlocutor: { id: 1, name: "B" } }] }),
        jsonResponse({
          data: [
            {
              id: 88,
              thread_id: 7,
              type: "received",
              text: "hi",
              created_at: "2026-05-14T18:00:00+03:00",
            },
          ],
        }),
      ],
    })
    // Account A has NO refreshToken → 401 propagates as error
    cryptoDecrypt
      .mockReset()
      .mockResolvedValueOnce({ accessToken: "T-A" })
      .mockResolvedValueOnce({ accessToken: "T-B", refreshToken: "R-B" })

    await service.runTick()
    expect(createMessage).toHaveBeenCalledTimes(1)
    const errorCalls = updateAccount.mock.calls.filter((c: any) => c?.[0]?.data?.lastError)
    expect(errorCalls.length).toBeGreaterThanOrEqual(1)
  })

  it("refreshes the access token once and retries when threads call returns 401", async () => {
    const { service, fetchMock, updateAccount, cryptoEncrypt } = createService({
      accounts: [
        { id: "acc-1", workspaceId: "ws-1", externalAccountId: "u-1", authDataEncrypted: "ENC", syncCheckpoint: null },
      ],
      fetchResponses: [
        new Response("unauth", { status: 401 }),
        jsonResponse({
          access_token: "NEW",
          refresh_token: "REFRESH2",
          expires_in: 3600,
          token_type: "bearer",
          scope: "read write v2",
        }),
        jsonResponse({ data: [{ id: 1, interlocutor: { id: 1, name: "B" } }] }),
        jsonResponse({
          data: [
            {
              id: 2,
              thread_id: 1,
              type: "received",
              text: "hi",
              created_at: "2026-05-14T18:00:00+03:00",
            },
          ],
        }),
      ],
    })

    await service.runTick()

    // 2nd call was the refresh
    const refreshCall = fetchMock.mock.calls[1]
    expect(String(refreshCall?.[0])).toContain("/api/open/oauth/token")
    expect(String((refreshCall?.[1] as any)?.body)).toContain("grant_type=refresh_token")

    // 3rd call (retry) used the NEW token
    const retryCall = fetchMock.mock.calls[2]
    expect((retryCall?.[1] as any)?.headers?.Authorization).toBe("Bearer NEW")

    // crypto.encrypt was called with the new token blob; channelAccount.update persisted it
    expect(cryptoEncrypt).toHaveBeenCalled()
    const persistCalls = updateAccount.mock.calls.filter((c: any) => c?.[0]?.data?.authDataEncrypted)
    expect(persistCalls.length).toBeGreaterThanOrEqual(1)
  })

  it("skips messages older than the sync checkpoint", async () => {
    const since = new Date("2026-05-14T17:00:00+03:00")
    const { service, createMessage } = createService({
      accounts: [
        {
          id: "acc-1",
          workspaceId: "ws-1",
          externalAccountId: "u-1",
          authDataEncrypted: "ENC",
          syncCheckpoint: { lastMessageAt: since },
        },
      ],
      fetchResponses: [
        jsonResponse({ data: [{ id: 1, interlocutor: { id: 5, name: "B" } }] }),
        jsonResponse({
          data: [
            {
              id: 100,
              thread_id: 1,
              type: "received",
              text: "old",
              created_at: "2026-05-14T16:00:00+03:00",
            },
            {
              id: 101,
              thread_id: 1,
              type: "received",
              text: "new",
              created_at: "2026-05-14T18:00:00+03:00",
            },
          ],
        }),
      ],
    })

    await service.runTick()
    expect(createMessage).toHaveBeenCalledTimes(1)
    expect((createMessage.mock.calls[0] as any)?.[0]?.data?.externalMessageId).toBe("101")
  })
})
