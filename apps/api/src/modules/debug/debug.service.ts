import { InjectQueue } from "@nestjs/bullmq"
import { Injectable, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { OutboxEventStatus } from "@omnichat/db"
import type { Queue } from "bullmq"

import { PrismaService } from "../prisma/prisma.service"
import type { ListOutboxEventsQueryDto } from "./dto/list-outbox-events.query.dto"
import type { RequeueOutboxDto } from "./dto/requeue-outbox.dto"

type OutboxStatus = OutboxEventStatus

const DEFAULT_REQUEUE_STATUSES: OutboxStatus[] = ["FAILED", "PENDING"]

@Injectable()
export class DebugService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue("outbox.process") private readonly outboxQueue: Queue,
  ) {}

  private ensureEnabled(): void {
    if (String(this.config.get("NODE_ENV") ?? "development") === "production") {
      throw new NotFoundException()
    }
  }

  async getOutboxSummary(input: { workspaceId: string }) {
    this.ensureEnabled()

    const [grouped, staleProcessing, oldestPending] = await Promise.all([
      this.prisma.outboxEvent.groupBy({
        by: ["status"],
        where: { workspaceId: input.workspaceId },
        _count: { _all: true },
      }),
      this.prisma.outboxEvent.count({
        where: {
          workspaceId: input.workspaceId,
          status: "PROCESSING",
          lockedAt: { lt: new Date(Date.now() - 5 * 60_000) },
        },
      }),
      this.prisma.outboxEvent.findFirst({
        where: { workspaceId: input.workspaceId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, nextAttemptAt: true, attempts: true, type: true },
      }),
    ])

    const counts: Record<OutboxStatus, number> = {
      PENDING: 0,
      PROCESSING: 0,
      PROCESSED: 0,
      FAILED: 0,
    }
    for (const row of grouped) {
      counts[row.status] = row._count._all
    }

    return {
      counts,
      staleProcessing,
      oldestPending,
      generatedAt: new Date().toISOString(),
    }
  }

  async listOutboxEvents(input: { workspaceId: string; query: ListOutboxEventsQueryDto }) {
    this.ensureEnabled()

    const limit = Math.max(1, Math.min(200, Number(input.query.limit ?? 50)))
    const status = input.query.status ?? undefined

    return this.prisma.outboxEvent.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        createdAt: true,
        type: true,
        aggregateId: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        processedAt: true,
        wsDeliveredAt: true,
        pushDeliveredAt: true,
        lockedAt: true,
        lockId: true,
        lastError: true,
      },
    })
  }

  async requeueOutbox(input: { workspaceId: string; body: RequeueOutboxDto }) {
    this.ensureEnabled()

    const limit = Math.max(1, Math.min(500, Number(input.body.limit ?? 100)))
    const maxAgeSec = Math.max(30, Math.min(86_400, Number(input.body.maxAgeSec ?? 300)))
    const statuses = (input.body.statuses?.length ? input.body.statuses : DEFAULT_REQUEUE_STATUSES) as OutboxStatus[]

    const now = new Date()
    const staleBefore = new Date(now.getTime() - maxAgeSec * 1000)

    const candidates = await this.prisma.outboxEvent.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          { status: { in: statuses } },
          { status: "PROCESSING", lockedAt: { lt: staleBefore } },
        ],
      },
      orderBy: [{ createdAt: "asc" }],
      take: limit,
      select: { id: true },
    })

    const ids = candidates.map((x) => x.id)
    if (ids.length === 0) {
      return { requested: limit, requeued: 0, queued: 0, ids: [] as string[] }
    }

    await this.prisma.outboxEvent.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "PENDING",
        nextAttemptAt: now,
        lockedAt: null,
        lockId: null,
      },
    })

    await Promise.all(
      ids.map((outboxEventId) =>
        this.outboxQueue.add("process", { outboxEventId }, { removeOnComplete: true, removeOnFail: true }),
      ),
    )

    return { requested: limit, requeued: ids.length, queued: ids.length, ids }
  }
}

