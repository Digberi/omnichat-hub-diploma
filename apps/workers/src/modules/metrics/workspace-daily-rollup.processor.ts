import { Processor, WorkerHost } from "@nestjs/bullmq"
import * as Sentry from "@sentry/node"
import type { Job } from "bullmq"
import { PinoLogger } from "nestjs-pino"
import { withQueueSpan } from "@omnichat/observability/node"

import { PrismaService } from "../prisma/prisma.service"

function startOfDayUtc(isoDate: string): Date {
  // isoDate: YYYY-MM-DD
  const [y, m, d] = isoDate.split("-").map((x) => Number(x))
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0))
}

@Processor("metrics.rollup.daily")
export class WorkspaceDailyRollupProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    super()
  }

  async process(job: Job<{ date: string }>): Promise<void> {
    try {
      await withQueueSpan(
        {
          name: "workers.metrics.daily_rollup.process",
          attributes: {
            "messaging.system": "bullmq",
            "messaging.destination": "metrics.rollup.daily",
            "messaging.job_name": job.name,
          },
        },
        async () => {
          if (job.name !== "rollup") return

          const date = job.data?.date
          if (!date) return

          const dayStart = startOfDayUtc(date)
          const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000)

          const workspaces = await this.prisma.workspace.findMany({
            select: { id: true },
            take: 10_000,
          })

          for (const ws of workspaces) {
            const [messagesIn, messagesOut, convCreated] = await Promise.all([
              this.prisma.message.count({
                where: { workspaceId: ws.id, direction: "IN", createdAt: { gte: dayStart, lt: dayEnd } },
              }),
              this.prisma.message.count({
                where: { workspaceId: ws.id, direction: "OUT", createdAt: { gte: dayStart, lt: dayEnd } },
              }),
              this.prisma.conversation.count({
                where: { workspaceId: ws.id, createdAt: { gte: dayStart, lt: dayEnd } },
              }),
            ])

            const responseStats = await this.prisma.$queryRaw<
              Array<{ avgFirstResponseMs: number | null; p95FirstResponseMs: number | null }>
            >`
                WITH conv AS (
                  SELECT c.id
                  FROM "Conversation" c
                  WHERE c."workspaceId" = ${ws.id}
                )
                SELECT
                  AVG(EXTRACT(EPOCH FROM (out_m."createdAt" - in_m."createdAt")) * 1000)::int AS "avgFirstResponseMs",
                  PERCENTILE_CONT(0.95) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (out_m."createdAt" - in_m."createdAt")) * 1000
                  )::int AS "p95FirstResponseMs"
                FROM conv c
                JOIN LATERAL (
                  SELECT m."createdAt"
                  FROM "Message" m
                  WHERE m."conversationId" = c.id AND m.direction = 'IN'
                  ORDER BY m."createdAt" ASC
                  LIMIT 1
                ) in_m ON TRUE
                JOIN LATERAL (
                  SELECT m."createdAt"
                  FROM "Message" m
                  WHERE m."conversationId" = c.id AND m.direction = 'OUT' AND m."createdAt" > in_m."createdAt"
                  ORDER BY m."createdAt" ASC
                  LIMIT 1
                ) out_m ON TRUE
                WHERE in_m."createdAt" >= ${dayStart} AND in_m."createdAt" < ${dayEnd}
              `

            const avgFirstResponseMs = responseStats?.[0]?.avgFirstResponseMs ?? null
            const p95FirstResponseMs = responseStats?.[0]?.p95FirstResponseMs ?? null

            await this.prisma.workspaceDailyRollup.upsert({
              where: { workspaceId_date: { workspaceId: ws.id, date: dayStart } },
              update: {
                messagesIn,
                messagesOut,
                convCreated,
                avgFirstResponseMs,
                p95FirstResponseMs,
              },
              create: {
                workspaceId: ws.id,
                date: dayStart,
                messagesIn,
                messagesOut,
                convCreated,
                avgFirstResponseMs,
                p95FirstResponseMs,
              },
            })
          }

          this.logger.info({ date, workspaces: workspaces.length }, "metrics: daily rollup computed")
        },
      )
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { "workers.module": "metrics", "workers.action": "daily_rollup_process" },
        extra: { jobName: job.name, date: job.data?.date ?? null },
      })
      throw err
    }
  }
}
