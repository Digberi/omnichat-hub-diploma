import { beforeEach, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { MaintenanceProcessor } from "./maintenance.processor"

const mockSend = vi.fn()

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: vi.fn(() => ({ send: mockSend })),
    HeadBucketCommand: vi.fn(),
    DeleteObjectsCommand: vi.fn(),
  }
})

function createProcessor(input: {
  workspaces: Array<{ id: string; autoArchiveDays?: number | null }>
  candidatesByWorkspace: Record<string, Array<{ id: string }>>
  shortLinks: Array<{ id: string; attachment?: { storageKey?: string | null } | null }>
  expiredAttachments: Array<{ id: string; storageKey: string }>
  updateCountByConversationId?: Record<string, number>
}) {
  let outboxSeq = 0

  const workspaceFindMany = vi.fn(async () =>
    input.workspaces.map((w) => ({
      id: w.id,
      settings: w.autoArchiveDays == null ? null : { autoArchiveDays: w.autoArchiveDays },
    })),
  )

  const conversationFindMany = vi.fn(async (args: any) => {
    const wsId = args?.where?.workspaceId as string
    return input.candidatesByWorkspace[wsId] ?? []
  })

  const conversationUpdateMany = vi.fn(async (args: any) => {
    const id = args?.where?.id as string
    const count = input.updateCountByConversationId?.[id] ?? 1
    return { count }
  })

  const outboxCreate = vi.fn(async () => {
    outboxSeq += 1
    return { id: `e${outboxSeq}` }
  })

  const shortLinkFindMany = vi.fn(async () => input.shortLinks)
  const shortLinkDeleteMany = vi.fn(async () => ({ count: input.shortLinks.length }))
  const attachmentFindMany = vi.fn(async () => input.expiredAttachments)
  const attachmentDeleteMany = vi.fn(async () => ({ count: input.expiredAttachments.length }))

  const prisma: any = {
    workspace: { findMany: workspaceFindMany },
    conversation: { findMany: conversationFindMany, updateMany: conversationUpdateMany },
    outboxEvent: { create: outboxCreate },
    shortLink: { findMany: shortLinkFindMany, deleteMany: shortLinkDeleteMany },
    attachment: { findMany: attachmentFindMany, deleteMany: attachmentDeleteMany },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  }

  const outboxQueue: any = {
    add: vi.fn(async () => ({})),
  }

  const config: any = {
    get: vi.fn((_: string, fallback?: string) => {
      if (_ === "STORAGE_ENDPOINT") return "http://localhost:9000"
      if (_ === "STORAGE_REGION") return "us-east-1"
      if (_ === "STORAGE_ACCESS_KEY") return "minioadmin"
      if (_ === "STORAGE_SECRET_KEY") return "minioadmin"
      if (_ === "STORAGE_BUCKET") return "omnichat"
      if (_ === "STORAGE_APPLY_LIFECYCLE") return false
      return fallback
    }),
  }

  const logger: any = {
    info: vi.fn(),
  }

  const processor = new MaintenanceProcessor(prisma, outboxQueue, logger, config)

  return {
    processor,
    prisma,
    outboxQueue,
    logger,
    shortLinkFindMany,
    shortLinkDeleteMany,
    attachmentFindMany,
    attachmentDeleteMany,
  }
}

describe("MaintenanceProcessor", () => {
  beforeAll(() => {
    mockSend.mockResolvedValue({})
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("ignores unknown job names", async () => {
    const { processor, prisma, outboxQueue } = createProcessor({
      workspaces: [],
      candidatesByWorkspace: {},
      shortLinks: [],
      expiredAttachments: [],
    })

    await processor.process({ name: "nope" } as any)

    expect(prisma.workspace.findMany).not.toHaveBeenCalled()
    expect(outboxQueue.add).not.toHaveBeenCalled()
  })

  it("auto-archives eligible conversations and enqueues outbox processing", async () => {
    const { processor, prisma, outboxQueue } = createProcessor({
      workspaces: [{ id: "w1", autoArchiveDays: 7 }],
      candidatesByWorkspace: { w1: [{ id: "c1" }, { id: "c2" }] },
      shortLinks: [],
      expiredAttachments: [],
    })

    await processor.process({ name: "autoArchiveConversations" } as any)

    expect(prisma.workspace.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.conversation.findMany).toHaveBeenCalledTimes(1)

    const convFindArgs = (prisma.conversation.findMany as any).mock.calls[0]?.[0]
    expect(convFindArgs.where).toMatchObject({
      workspaceId: "w1",
      isArchived: false,
      needsReply: false,
      isPinnedInAll: false,
    })
    expect(convFindArgs.where.lastSellerReplyAt).toMatchObject({
      lte: new Date("2025-12-25T12:00:00.000Z"),
    })

    expect(prisma.conversation.updateMany).toHaveBeenCalledTimes(2)
    expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(2)
    expect(outboxQueue.add).toHaveBeenCalledTimes(2)

    const adds = (outboxQueue.add as any).mock.calls.map((c: any[]) => c[1]?.outboxEventId)
    expect(adds).toEqual(["e1", "e2"])
  })

  it("does not enqueue when conversation update did not apply (already archived)", async () => {
    const { processor, prisma, outboxQueue } = createProcessor({
      workspaces: [{ id: "w1", autoArchiveDays: 7 }],
      candidatesByWorkspace: { w1: [{ id: "c1" }, { id: "c2" }] },
      shortLinks: [],
      expiredAttachments: [],
      updateCountByConversationId: { c1: 0, c2: 1 },
    })

    await processor.process({ name: "autoArchiveConversations" } as any)

    expect(prisma.conversation.updateMany).toHaveBeenCalledTimes(2)
    expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(1)
    expect(outboxQueue.add).toHaveBeenCalledTimes(1)
  })

  it("cleans up expired short links and expired attachments", async () => {
    const { processor, prisma, shortLinkFindMany, shortLinkDeleteMany, attachmentFindMany, attachmentDeleteMany } = createProcessor(
      {
        workspaces: [],
        candidatesByWorkspace: {},
        shortLinks: [
          { id: "sl-1", attachment: { storageKey: "attachments/a1" } },
          { id: "sl-2", attachment: { storageKey: "attachments/a2" } },
        ],
        expiredAttachments: [{ id: "att-1", storageKey: "attachments/old-a3" }],
      },
    )

    await processor.process({ name: "cleanupExpiredShortLinks" } as any)

    expect(shortLinkFindMany).toHaveBeenCalledTimes(1)
    expect(shortLinkDeleteMany).toHaveBeenCalledTimes(1)
    expect(attachmentFindMany).toHaveBeenCalledTimes(1)
    expect(attachmentDeleteMany).toHaveBeenCalledTimes(1)

    const expectedDeleted = prisma.shortLink.deleteMany.mock.calls[0]?.[0]
    const expectedAttachmentsDeleted = prisma.attachment.deleteMany.mock.calls[0]?.[0]

    expect(expectedDeleted).toMatchObject({
      where: { id: { in: ["sl-1", "sl-2"] } },
    })
    expect(expectedAttachmentsDeleted).toMatchObject({
      where: { id: { in: ["att-1"] }, expiresAt: { lte: expect.any(Date) } },
    })

    expect(mockSend).toHaveBeenCalled()
  })

  it("no storage call when no candidates", async () => {
    const { processor, shortLinkFindMany, attachmentFindMany } = createProcessor({
      workspaces: [],
      candidatesByWorkspace: {},
      shortLinks: [],
      expiredAttachments: [],
    })

    await processor.process({ name: "cleanupExpiredShortLinks" } as any)

    expect(shortLinkFindMany).toHaveBeenCalledTimes(1)
    expect(attachmentFindMany).toHaveBeenCalledTimes(1)
    expect(mockSend).not.toHaveBeenCalled()
  })
})
