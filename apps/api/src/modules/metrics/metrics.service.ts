import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

import { PrismaService } from "../prisma/prisma.service"
import { InboxMetricsDto } from "./dto/inbox-metrics.dto"
import { StorageMetricsDto } from "./dto/storage-metrics.dto"
import { StorageHealthDto } from "./dto/storage-health.dto"
import { StorageService } from "../storage/storage.service"

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  async getInboxMetrics(input: { workspaceId: string }): Promise<InboxMetricsDto> {
    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 60 * 60_000)

    const days = this.config.get<number>("SEARCH_DEFAULT_DAYS") ?? 7
    const sinceDays = new Date(now.getTime() - days * 24 * 60 * 60_000)

    const hourlyRows = await this.prisma.$queryRaw<Array<{ h: number; c: number }>>`
      WITH hours AS (
        SELECT generate_series(0, 23) AS h
      ),
      counts AS (
        SELECT
          EXTRACT(HOUR FROM m."createdAt")::int AS h,
          COUNT(*)::int AS c
        FROM "Message" m
        WHERE m."workspaceId" = ${input.workspaceId}
          AND m."createdAt" >= ${since24h}
        GROUP BY 1
      )
      SELECT hours.h, COALESCE(counts.c, 0)::int AS c
      FROM hours
      LEFT JOIN counts USING (h)
      ORDER BY hours.h ASC
    `

    const hourlyActivity = Array.from({ length: 24 }, (_, i) => {
      const row = hourlyRows.find((r) => r.h === i)
      return row ? Number(row.c) : 0
    })

    const rollupStart = startOfDayUtc(new Date(now.getTime() - (days - 1) * 24 * 60 * 60_000))
    const rollups = await this.prisma.workspaceDailyRollup.findMany({
      where: { workspaceId: input.workspaceId, date: { gte: rollupStart } },
      select: { avgFirstResponseMs: true },
      take: 31,
    })

    let avgFirstResponseMs: number | null = null
    const nonNull = rollups.map((r) => r.avgFirstResponseMs).filter((n): n is number => typeof n === "number")
    if (nonNull.length > 0) {
      avgFirstResponseMs = Math.round(nonNull.reduce((a, b) => a + b, 0) / nonNull.length)
    } else {
      const rows = await this.prisma.$queryRaw<Array<{ avgMs: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM (c."lastSellerReplyAt" - c."lastIncomingAt")) * 1000)::int AS "avgMs"
        FROM "Conversation" c
        WHERE c."workspaceId" = ${input.workspaceId}
          AND c."lastIncomingAt" IS NOT NULL
          AND c."lastSellerReplyAt" IS NOT NULL
          AND c."lastSellerReplyAt" > c."lastIncomingAt"
          AND c."lastIncomingAt" >= ${sinceDays}
      `
      avgFirstResponseMs = rows?.[0]?.avgMs ?? null
    }

    const avgResponseMin = avgFirstResponseMs != null ? Math.max(0, Math.round(avgFirstResponseMs / 60_000)) : null

    return {
      avgResponseMin,
      hourlyActivity,
    }
  }

  async getStorageMetrics(): Promise<StorageMetricsDto> {
    return this.storage.getMetrics()
  }

  async getStorageHealth(): Promise<StorageHealthDto> {
    const metrics = this.storage.getMetrics()
    const num = (v: string | number | undefined, fallback: number) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : fallback
    }

    const pingMaxAgeMs = num(this.config.get("STORAGE_ALERT_PING_MAX_AGE_MS"), 120_000)
    const failureRateWarn = num(this.config.get("STORAGE_ALERT_FAILURE_RATE_WARN_PCT"), 5)
    const failureRateCritical = num(this.config.get("STORAGE_ALERT_FAILURE_RATE_CRITICAL_PCT"), 20)
    const avgDurationWarnMs = num(this.config.get("STORAGE_ALERT_AVG_DURATION_WARN_MS"), 1500)
    const avgDurationCriticalMs = num(this.config.get("STORAGE_ALERT_AVG_DURATION_CRITICAL_MS"), 4000)

    const now = Date.now()
    const reasons: string[] = []
    const operations: StorageHealthDto["operations"] = []
    let status: StorageHealthDto["status"] = "ok"
    let hasWarning = false

    const pingAgeInvalid =
      metrics.lastPingAt == null || Number.isNaN(Date.parse(metrics.lastPingAt)) || now - Date.parse(metrics.lastPingAt) > pingMaxAgeMs
    if (pingAgeInvalid) {
      status = "degraded"
      hasWarning = true
      reasons.push(`Storage ping unavailable or older than ${pingMaxAgeMs}ms`)
    }

    for (const [operation, stat] of Object.entries(metrics.operations ?? {})) {
      const total = stat.total ?? 0
      const failures = stat.failed ?? 0
      const failureRatePct = total > 0 ? Number(((failures / total) * 100).toFixed(2)) : 0
      const avgDurationMs = stat.avgDurationMs ?? null

      operations.push({
        operation,
        total,
        failures,
        failureRatePct,
        avgDurationMs,
      })

      if (failureRatePct >= failureRateCritical && total > 0) {
        status = "critical"
        reasons.push(`Operation "${operation}" critical failure rate: ${failureRatePct}%`)
        continue
      }

      if (failureRatePct >= failureRateWarn && total > 0) {
        status = hasWarning ? "critical" : "degraded"
        hasWarning = true
        reasons.push(`Operation "${operation}" elevated failure rate: ${failureRatePct}%`)
      }

      if (avgDurationMs != null && avgDurationMs >= avgDurationCriticalMs) {
        status = "critical"
        reasons.push(`Operation "${operation}" critical avg duration: ${avgDurationMs}ms`)
      } else if (avgDurationMs != null && avgDurationMs >= avgDurationWarnMs) {
        status = hasWarning || status === "critical" ? status : "degraded"
        hasWarning = true
        reasons.push(`Operation "${operation}" elevated avg duration: ${avgDurationMs}ms`)
      }
    }

    if (operations.length === 0) {
      operations.push({
        operation: "all",
        total: 0,
        failures: 0,
        failureRatePct: 0,
        avgDurationMs: null,
      })
      status = status === "ok" ? "degraded" : status
      reasons.push("No storage operations recorded yet")
    }

    if (status === "ok") {
      reasons.push("ok")
    } else if (status === "critical" || status === "degraded") {
      // keep explicit reasons only
    }

    return {
      status,
      reasons,
      operations,
      lastPingAt: metrics.lastPingAt,
    }
  }
}
