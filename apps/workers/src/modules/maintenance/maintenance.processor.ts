import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq"
import { ConfigService } from "@nestjs/config"
import { DeleteObjectsCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3"
import * as Sentry from "@sentry/node"
import type { Job, Queue } from "bullmq"
import { PinoLogger } from "nestjs-pino"
import { withQueueSpan } from "@omnichat/observability/node"

import { Prisma } from "@omnichat/db"

import { PrismaService } from "../prisma/prisma.service"

@Processor("maintenance")
export class MaintenanceProcessor extends WorkerHost {
  private readonly bucket: string
  private readonly storageEnabled: boolean
  private readonly storageClient: S3Client

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue("outbox.process") private readonly outboxQueue: Queue,
    private readonly logger: PinoLogger,
    private readonly config: ConfigService,
  ) {
    super()

    const endpoint = this.nonEmptyOr(this.config.get<string>("STORAGE_ENDPOINT"), "http://localhost:9000")
    const region = this.nonEmptyOr(this.config.get<string>("STORAGE_REGION"), "us-east-1")
    const accessKeyId = this.nonEmptyOr(this.config.get<string>("STORAGE_ACCESS_KEY"), "minioadmin")
    const secretAccessKey = this.nonEmptyOr(this.config.get<string>("STORAGE_SECRET_KEY"), "minioadmin")

    this.bucket = this.nonEmptyOr(this.config.get<string>("STORAGE_BUCKET"), "omnichat")
    this.storageEnabled = Boolean(this.config.get<string>("STORAGE_ENDPOINT"))

    this.storageClient = new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
  }

  private nonEmptyOr(value: string | undefined, fallback: string): string {
    const v = typeof value === "string" ? value.trim() : ""
    return v.length > 0 ? v : fallback
  }

  private async ensureStorageBucket(): Promise<void> {
    if (!this.storageEnabled) return

    try {
      await this.storageClient.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch {
      // Storage cleanup can continue without strict enforcement of bucket readiness.
    }
  }

  private async deleteStorageObjects(keys: string[]): Promise<void> {
    if (!this.storageEnabled) return
    const unique = Array.from(new Set(keys.filter((k) => typeof k === "string" && k.length > 0)))
    if (unique.length === 0) return

    await this.ensureStorageBucket()

    for (let i = 0; i < unique.length; i += 1000) {
      const chunk = unique.slice(i, i + 1000)
      await this.storageClient.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      )
    }
  }

  async process(job: Job): Promise<void> {
    try {
      await withQueueSpan(
        {
          name: "workers.maintenance.process",
          attributes: {
            "messaging.system": "bullmq",
            "messaging.destination": "maintenance",
            "messaging.job_name": job.name,
          },
        },
        async () => {
          if (job.name === "cleanupExpiredShortLinks") {
            await this.cleanupExpiredShortLinks()
            return
          }

          if (job.name === "autoArchiveConversations") {
            await this.autoArchiveConversations()
            return
          }
        },
      )
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { "workers.module": "maintenance", "workers.action": "process_job" },
        extra: { jobName: job.name },
      })
      throw err
    }
  }

  private async cleanupExpiredShortLinks(): Promise<void> {
    const now = new Date()
    const expiredShortLinks = await this.prisma.shortLink.findMany({
      where: { expiresAt: { lt: now } },
      orderBy: { expiresAt: "asc" },
      take: 500,
      include: {
        attachment: {
          select: {
            storageKey: true,
            id: true,
          },
        },
      },
    })
    if (expiredShortLinks.length > 0) {
      const attachmentKeys = expiredShortLinks
        .map((link: (typeof expiredShortLinks)[number]) => link.attachment?.storageKey)
        .filter((key: string | null | undefined): key is string => Boolean(key))
      const shortLinkIds = expiredShortLinks.map((link: (typeof expiredShortLinks)[number]) => link.id)

      const removedDb = await this.prisma.shortLink.deleteMany({ where: { id: { in: shortLinkIds } } })
      await this.deleteStorageObjects(attachmentKeys)

      if (removedDb.count > 0) {
        this.logger.info(
          { removed: removedDb.count, attachmentKeysDeleted: attachmentKeys.length, storageEnabled: this.storageEnabled },
          "maintenance: cleaned up expired short links",
        )
      }
    }

    // Extra cleanup for attachments with explicit attachment TTL.
    const expiredAttachments = await this.prisma.attachment.findMany({
      where: { expiresAt: { lte: now } },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true,
        storageKey: true,
      },
    })

    if (expiredAttachments.length === 0) return

    const attachmentIds = expiredAttachments.map((row: (typeof expiredAttachments)[number]) => row.id)
    const attachmentKeysForExpired = expiredAttachments.map((row: (typeof expiredAttachments)[number]) => row.storageKey)

    const deletedAttachments = await this.prisma.attachment.deleteMany({
      where: { id: { in: attachmentIds }, expiresAt: { lte: now } },
    })

    if (deletedAttachments.count > 0) {
      await this.deleteStorageObjects(attachmentKeysForExpired)
      this.logger.info(
        { removedAttachments: deletedAttachments.count, storageEnabled: this.storageEnabled },
        "maintenance: cleaned up expired attachments",
      )
    }
  }

  private async autoArchiveConversations(): Promise<void> {
    const now = new Date()

    const workspaces = await this.prisma.workspace.findMany({
      select: {
        id: true,
        settings: { select: { autoArchiveDays: true } },
      },
    })
    if (workspaces.length === 0) return

    let archived = 0
    let outboxCreated = 0

    for (const ws of workspaces) {
      const autoArchiveDays = ws.settings?.autoArchiveDays ?? 7
      if (!Number.isFinite(autoArchiveDays) || autoArchiveDays <= 0) continue

      const cutoff = new Date(now.getTime() - autoArchiveDays * 24 * 60 * 60 * 1000)

      const candidates = await this.prisma.conversation.findMany({
        where: {
          workspaceId: ws.id,
          isArchived: false,
          needsReply: false,
          isPinnedInAll: false,
          lastSellerReplyAt: { lte: cutoff },
        },
        orderBy: [{ lastSellerReplyAt: "asc" }, { id: "asc" }],
        take: 200,
        select: { id: true },
      })
      if (candidates.length === 0) continue

      for (const c of candidates) {
        const outboxId = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const updated = await tx.conversation.updateMany({
            where: { id: c.id, workspaceId: ws.id, isArchived: false },
            data: {
              isArchived: true,
              archivedAt: now,
              isPinnedInAll: false,
              pinnedAt: null,
            },
          })
          if (updated.count === 0) return null

          const outbox = await tx.outboxEvent.create({
            data: {
              workspaceId: ws.id,
              type: "conversation.updated",
              aggregateId: c.id,
              payload: {
                schemaVersion: 1,
                workspaceId: ws.id,
                occurredAt: now.toISOString(),
                data: {
                  conversationId: c.id,
                  patch: {
                    isArchived: true,
                    archivedAt: now.toISOString(),
                    isPinnedInAll: false,
                    pinnedAt: null,
                  },
                },
              },
              status: "PENDING",
              nextAttemptAt: now,
            },
            select: { id: true },
          })

          return outbox.id
        })

        if (!outboxId) continue

        archived += 1
        outboxCreated += 1

        await this.outboxQueue.add(
          "process",
          { outboxEventId: outboxId },
          { removeOnComplete: true, removeOnFail: true },
        )
      }
    }

    if (archived > 0) {
      this.logger.info(
        { archived, outbox: outboxCreated },
        "maintenance: auto archived conversations",
      )
    }
  }
}
