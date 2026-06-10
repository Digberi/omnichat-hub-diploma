import { randomBytes } from "node:crypto"
import { Prisma, type PrismaClient } from "@prisma/client"

import { defaultClock, type Clock, type InfisicalKmsClient } from "./types"
import { DekVersionMissing } from "./errors"
import { metrics, trace, type Span } from "@opentelemetry/api"

const tracer = trace.getTracer("@omnichat/kms")
const meter = metrics.getMeter("@omnichat/kms")
const cacheCounter = meter.createCounter("omnichat_kms_dek_cache_total", {
  description: "DEK cache hit/miss",
})
const unwrapHistogram = meter.createHistogram("omnichat_kms_unwrap_duration_ms", {
  description: "DEK unwrap latency (ms)",
})
const unwrapErrorCounter = meter.createCounter("omnichat_kms_unwrap_errors_total", {
  description: "DEK unwrap failures",
})

export interface DekManagerOptions {
  prisma: PrismaClient
  kmsClient: InfisicalKmsClient
  clock?: Clock
  cacheMaxEntries?: number
  cacheTtlMs?: number
}

interface CacheEntry {
  dek: Buffer
  version: number
  kekKeyId: string
  expiresAt: number
}

export interface ActiveDek {
  dek: Buffer
  version: number
  kekKeyId: string
}

export class DekManager {
  private readonly prisma: PrismaClient
  private readonly kmsClient: InfisicalKmsClient
  private readonly clock: Clock
  private readonly cacheMaxEntries: number
  private readonly cacheTtlMs: number
  private readonly cache = new Map<string, CacheEntry>()

  constructor(opts: DekManagerOptions) {
    this.prisma = opts.prisma
    this.kmsClient = opts.kmsClient
    this.clock = opts.clock ?? defaultClock
    this.cacheMaxEntries = opts.cacheMaxEntries ?? 100
    this.cacheTtlMs = opts.cacheTtlMs ?? 5 * 60_000
  }

  async getActiveDek(workspaceId: string): Promise<ActiveDek> {
    return tracer.startActiveSpan("kms.dek.unwrap", async (span: Span) => {
      try {
        span.setAttribute("omnichat.workspace_id", workspaceId)
        const cached = this.lookupCache(workspaceId, "active")
        if (cached) {
          span.setAttribute("omnichat.dek.version", cached.version)
          span.setAttribute("omnichat.kms.cache_hit", true)
          cacheCounter.add(1, { result: "hit" })
          return { dek: cached.dek, version: cached.version, kekKeyId: cached.kekKeyId }
        }
        span.setAttribute("omnichat.kms.cache_hit", false)
        cacheCounter.add(1, { result: "miss" })

        const existing = await this.prisma.channelDek.findFirst({
          where: { workspaceId, isActive: true },
          orderBy: { version: "desc" },
        })

        if (existing) {
          const t0 = this.clock()
          try {
            const dek = await this.kmsClient.unwrapDek(existing.encryptedDek, existing.kekKeyId)
            unwrapHistogram.record(this.clock() - t0)
            this.storeCache(workspaceId, "active", dek, existing.version, existing.kekKeyId)
            this.storeCache(workspaceId, String(existing.version), dek, existing.version, existing.kekKeyId)
            span.setAttribute("omnichat.dek.version", existing.version)
            return { dek, version: existing.version, kekKeyId: existing.kekKeyId }
          } catch (err) {
            unwrapErrorCounter.add(1, { reason: classifyKmsError(err) })
            throw err
          }
        }

        const newDek = randomBytes(32)
        const wrapped = await this.kmsClient.wrapDek(newDek)
        await this.prisma.channelDek.create({
          data: {
            workspaceId,
            version: 1,
            encryptedDek: wrapped.encryptedDek,
            kekKeyId: wrapped.kekKeyId,
            isActive: true,
          },
        })
        await this.prisma.auditLog.create({
          data: {
            workspaceId,
            action: "dek.create",
            entityType: "ChannelDek",
            payload: { version: 1, kekKeyId: wrapped.kekKeyId },
          },
        })
        this.storeCache(workspaceId, "active", newDek, 1, wrapped.kekKeyId)
        this.storeCache(workspaceId, "1", newDek, 1, wrapped.kekKeyId)
        span.setAttribute("omnichat.dek.version", 1)
        return { dek: newDek, version: 1, kekKeyId: wrapped.kekKeyId }
      } finally {
        span.end()
      }
    })
  }

  async rotate(workspaceId: string): Promise<void> {
    return tracer.startActiveSpan("kms.dek.wrap", async (span: Span) => {
      try {
        span.setAttribute("omnichat.workspace_id", workspaceId)
        const newDek = randomBytes(32)
        const wrapped = await this.kmsClient.wrapDek(newDek)

        const { previousVersion, nextVersion } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const current = await tx.channelDek.findFirst({
            where: { workspaceId, isActive: true },
            orderBy: { version: "desc" },
          })
          const nextVersion = (current?.version ?? 0) + 1
          await tx.channelDek.updateMany({
            where: { workspaceId, isActive: true },
            data: { isActive: false, rotatedAt: new Date() },
          })
          await tx.channelDek.create({
            data: {
              workspaceId,
              version: nextVersion,
              encryptedDek: wrapped.encryptedDek,
              kekKeyId: wrapped.kekKeyId,
              isActive: true,
            },
          })
          return { previousVersion: current?.version ?? 0, nextVersion }
        })

        await this.prisma.auditLog.create({
          data: {
            workspaceId,
            action: "dek.rotate",
            entityType: "ChannelDek",
            payload: { fromVersion: previousVersion, toVersion: nextVersion, kekKeyId: wrapped.kekKeyId },
          },
        })
        span.setAttribute("omnichat.dek.version", nextVersion)
        this.invalidateWorkspaceCache(workspaceId)
      } finally {
        span.end()
      }
    })
  }

  private invalidateWorkspaceCache(workspaceId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${workspaceId}:`)) this.cache.delete(key)
    }
  }

  async getDekByVersion(workspaceId: string, version: number): Promise<Buffer> {
    return tracer.startActiveSpan("kms.dek.unwrap", async (span: Span) => {
      try {
        span.setAttribute("omnichat.workspace_id", workspaceId)
        span.setAttribute("omnichat.dek.version", version)
        const cached = this.lookupCache(workspaceId, String(version))
        if (cached) {
          span.setAttribute("omnichat.kms.cache_hit", true)
          cacheCounter.add(1, { result: "hit" })
          return cached.dek
        }
        span.setAttribute("omnichat.kms.cache_hit", false)
        cacheCounter.add(1, { result: "miss" })

        const row = await this.prisma.channelDek.findFirst({
          where: { workspaceId, version },
        })
        if (!row) {
          unwrapErrorCounter.add(1, { reason: "version_missing" })
          throw new DekVersionMissing(workspaceId, version)
        }
        const t0 = this.clock()
        try {
          const dek = await this.kmsClient.unwrapDek(row.encryptedDek, row.kekKeyId)
          unwrapHistogram.record(this.clock() - t0)
          this.storeCache(workspaceId, String(version), dek, row.version, row.kekKeyId)
          if (row.isActive === false) {
            await this.prisma.auditLog.create({
              data: {
                workspaceId,
                action: "dek.unwrap_legacy_version",
                entityType: "ChannelDek",
                payload: { version: row.version, kekKeyId: row.kekKeyId },
              },
            })
          }
          return dek
        } catch (err) {
          unwrapErrorCounter.add(1, { reason: classifyKmsError(err) })
          throw err
        }
      } finally {
        span.end()
      }
    })
  }

  private cacheKey(workspaceId: string, slot: string): string {
    return `${workspaceId}:${slot}`
  }

  private lookupCache(workspaceId: string, slot: string): CacheEntry | null {
    const key = this.cacheKey(workspaceId, slot)
    const entry = this.cache.get(key)
    if (!entry) return null
    if (entry.expiresAt <= this.clock()) {
      this.cache.delete(key)
      return null
    }
    return entry
  }

  private storeCache(workspaceId: string, slot: string, dek: Buffer, version: number, kekKeyId: string): void {
    if (this.cache.size >= this.cacheMaxEntries) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) this.cache.delete(firstKey)
    }
    this.cache.set(this.cacheKey(workspaceId, slot), {
      dek,
      version,
      kekKeyId,
      expiresAt: this.clock() + this.cacheTtlMs,
    })
  }
}

function classifyKmsError(err: unknown): string {
  const name = (err as any)?.name ?? ""
  if (name === "KmsUnavailable") return "unavailable"
  if (name === "DekVersionMissing") return "version_missing"
  if (name === "CiphertextTampered") return "tampered"
  return "other"
}
