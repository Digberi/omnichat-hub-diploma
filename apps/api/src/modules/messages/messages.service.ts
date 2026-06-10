import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectQueue } from "@nestjs/bullmq"
import type { Queue } from "bullmq"
import { applySellerReplySuccessEffects } from "@omnichat/domain"
import { Prisma } from "@omnichat/db"
import { randomUUID } from "crypto"
import { ENVELOPE_CRYPTO } from "@omnichat/kms/nest"
import type { EnvelopeCryptoService } from "@omnichat/kms"

import { MessagesRepository } from "./messages.repository"
import { PromApiService, PromHttpError } from "../prom/prom-api.service"
import { PrismaService } from "../prisma/prisma.service"
import { StorageService } from "../storage/storage.service"

type DecryptedAuthData = {
  accessToken: string
  refreshToken?: string | null
  expiresIn?: number | null
  scope?: string | null
  tokenType?: string | null
  obtainedAt?: string | null
}

type DecryptedPromAuthData = {
  apiToken: string
  apiBaseUrl?: string | null
}

type OutboxMessageDto = {
  id: string
  conversationId: string
  direction: string
  text: string | null
  clientMessageId: string | null
  createdAt: string
  sentAt: string | null
  deliveryStatus: string
  errorCode: string | null
  errorMessage: string | null
  attachments?: Array<{
    id: string
    kind: string
    mimeType: string
    sizeBytes: number
    originalName: string | null
  }>
}

class OlxHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`OLX HTTP ${status}`)
  }
}

// OLX CDN serves attachment images via paths like
// `https://ireland.apollo.olxcdn.com/v1/files/{JWT}/image`. The JWT has
// ~1h `exp` and payload `{ exp, fn }` — once expired the CDN responds with
// a JSON body containing "IDENTIFIER_HAS_WRONG_FORMAT" / "INVALID_PAYLOAD"
// (the user-visible "broken image" symptom). decodeJwtExp parses out the
// expiry so we can refresh URLs before they bite.
function decodeJwtExp(jwt: string): number | null {
  const parts = jwt.split(".")
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/")
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4))
    const json = Buffer.from(b64 + pad, "base64").toString("utf8")
    const obj = JSON.parse(json) as { exp?: unknown }
    return typeof obj.exp === "number" ? obj.exp : null
  } catch {
    return null
  }
}

const OLX_FILES_URL_RE = /\/v1\/files\/([^/]+)\//

export function extractOlxJwtExp(url: string): number | null {
  const m = OLX_FILES_URL_RE.exec(url)
  if (!m) return null
  return decodeJwtExp(m[1]!)
}

type OlxAttachmentItem = {
  name: string | null
  url: string
  kind: "attachment" | "cv"
}

type OlxAttachmentMeta = {
  kind: "olx_message_attachments"
  schemaVersion: 1
  items: OlxAttachmentItem[]
}

function isOlxAttachmentMeta(meta: unknown): meta is OlxAttachmentMeta {
  if (!meta || typeof meta !== "object") return false
  const m = meta as { kind?: unknown; schemaVersion?: unknown; items?: unknown }
  if (m.kind !== "olx_message_attachments" || m.schemaVersion !== 1) return false
  return Array.isArray(m.items)
}

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = safeString(value)
    if (parsed) return parsed
  }
  return null
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name)
  constructor(
    private readonly repo: MessagesRepository,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly promApi: PromApiService,
    @InjectQueue("outbox.process") private readonly outboxQueue: Queue,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCryptoService,
  ) {}

  /**
   * Mint a 7-day presigned download URL for every IMAGE/VIDEO attachment
   * row so the web inbox can render the media inline without doing an
   * extra round-trip per bubble. AWS S3 / DO Spaces signature is local
   * (HMAC, no network), so the cost is microseconds per attachment.
   *
   * DOCUMENT kind is intentionally skipped — operators don't need inline
   * preview for arbitrary file types, the existing "Відкрити" short-link
   * flow stays the click path for them.
   *
   * Mutates rows in place via assigning `previewUrl` next to the existing
   * row shape; the mapper then picks it up.
   */
  private async enrichPreviewUrls<T extends { attachments?: Array<{ kind: string; storageKey: string; previewUrl?: string | null }> }>(
    items: T[],
  ): Promise<void> {
    const tasks: Array<Promise<void>> = []
    for (const item of items) {
      if (!Array.isArray(item.attachments)) continue
      for (const att of item.attachments) {
        if (att.kind !== "IMAGE" && att.kind !== "VIDEO") continue
        if (!att.storageKey) continue
        tasks.push(
          this.storage
            .getPresignedDownloadUrl({ key: att.storageKey, expiresInSeconds: 7 * 24 * 3600 })
            .then((url) => {
              att.previewUrl = url
            })
            .catch(() => {
              att.previewUrl = null
            }),
        )
      }
    }
    await Promise.all(tasks)
  }

  async list(input: {
    workspaceId: string
    conversationId: string
    limit?: number
    cursor?: string
  }) {
    const res = await this.repo.list({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      limit: input.limit ?? 50,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    })
    await this.refreshStaleOlxAttachmentUrls(input.workspaceId, res.items)
    await this.enrichPreviewUrls(res.items as Array<{ attachments?: any[] }>)
    return res
  }

  async around(input: { workspaceId: string; conversationId: string; messageId: string; limit?: number }) {
    const res = await this.repo.around({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      limit: input.limit ?? 50,
    })
    if (!res) throw new NotFoundException("Message not found")
    await this.refreshStaleOlxAttachmentUrls(input.workspaceId, res.items)
    await this.enrichPreviewUrls(res.items as Array<{ attachments?: any[] }>)
    return res
  }

  /**
   * OLX attachment URLs embed a JWT in their CDN path with ~1h expiry.
   * Once expired the browser sees "broken image" with a CDN error
   * payload like `IDENTIFIER_HAS_WRONG_FORMAT / INVALID_PAYLOAD`. The
   * worker only re-writes URLs when it polls the thread, so threads
   * without recent inbound stay stale.
   *
   * On every list/around call we scan the returned messages, decode any
   * embedded JWT exp, and if any URL is within 5 min of expiry (or
   * already past it) we re-fetch the thread's messages from OLX once
   * and patch the metadata for every affected row in that thread.
   * Persisting back to DB means the next request stays cheap until the
   * fresh JWT in turn ages out.
   *
   * Best-effort: any failure leaves the (possibly stale) DB metadata
   * in place. Logs the cause for triage but never throws.
   */
  private async refreshStaleOlxAttachmentUrls(
    workspaceId: string,
    items: Array<{
      id: string
      conversationId: string
      externalMessageId: string | null
      metadata: unknown
    }>,
  ): Promise<void> {
    const STALE_SOON_SEC = 300
    const nowSec = Math.floor(Date.now() / 1000)

    type Stale = {
      conversationId: string
      messageIds: Set<string>
    }
    const staleByConversation = new Map<string, Stale>()

    for (const item of items) {
      if (!isOlxAttachmentMeta(item.metadata)) continue
      if (!item.externalMessageId) continue
      const expiringSoon = item.metadata.items.some((it) => {
        const exp = extractOlxJwtExp(it.url)
        if (exp == null) return false
        return exp - nowSec <= STALE_SOON_SEC
      })
      if (!expiringSoon) continue
      let bucket = staleByConversation.get(item.conversationId)
      if (!bucket) {
        bucket = { conversationId: item.conversationId, messageIds: new Set() }
        staleByConversation.set(item.conversationId, bucket)
      }
      bucket.messageIds.add(item.externalMessageId)
    }

    if (staleByConversation.size === 0) return

    for (const stale of staleByConversation.values()) {
      try {
        await this.refreshOneConversationOlxUrls(workspaceId, stale.conversationId, stale.messageIds, items)
      } catch (err) {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err), conversationId: stale.conversationId },
          "refreshStaleOlxAttachmentUrls: conversation refresh failed",
        )
      }
    }
  }

  private async refreshOneConversationOlxUrls(
    workspaceId: string,
    conversationId: string,
    targetExternalIds: Set<string>,
    items: Array<{ id: string; conversationId: string; externalMessageId: string | null; metadata: unknown }>,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      select: { id: true, channel: true, externalConversationId: true, channelAccountId: true },
    })
    if (!conversation || conversation.channel !== "OLX" || !conversation.externalConversationId) return

    const account = await this.prisma.channelAccount.findFirst({
      where: { id: conversation.channelAccountId, workspaceId, channel: "OLX" },
      select: { id: true, authType: true, authDataEncrypted: true },
    })
    if (!account || account.authType !== "OAUTH" || !account.authDataEncrypted) return

    let auth = (await this.crypto.decrypt(workspaceId, account.authDataEncrypted)) as DecryptedAuthData
    const cfg = this.getOlxConfig()
    const threadId = encodeURIComponent(conversation.externalConversationId)
    const url = `${cfg.baseUrl.replace(/\/+$/, "")}/api/partner/threads/${threadId}/messages`

    const doFetch = async (token: string): Promise<Response> =>
      fetch(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          version: "2.0",
        },
        signal: AbortSignal.timeout(cfg.timeoutMs),
      })

    let res = await doFetch(auth.accessToken)
    if (res.status === 401 && auth.refreshToken) {
      const refreshed = await this.refreshOlxAccessToken({ refreshToken: auth.refreshToken })
      await this.prisma.channelAccount.update({
        where: { id: account.id },
        data: {
          authDataEncrypted: await this.crypto.encrypt(workspaceId, {
            schemaVersion: 1,
            provider: "OLX",
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken ?? auth.refreshToken,
            expiresIn: refreshed.expiresIn ?? null,
            scope: refreshed.scope ?? null,
            tokenType: refreshed.tokenType ?? null,
            obtainedAt: refreshed.obtainedAt ?? new Date().toISOString(),
          }),
        },
      })
      auth = refreshed
      res = await doFetch(refreshed.accessToken)
    }
    if (!res.ok) {
      this.logger.warn(
        { status: res.status, conversationId },
        "refreshOneConversationOlxUrls: OLX returned non-2xx",
      )
      return
    }

    const body = (await res.json()) as { data?: Array<Record<string, unknown>> }
    const olxMessages = Array.isArray(body.data) ? body.data : []

    const freshByExternalId = new Map<string, OlxAttachmentItem[]>()
    for (const m of olxMessages) {
      const id = safeString(m.id) ?? (typeof m.id === "number" ? String(m.id) : null)
      if (!id) continue
      const fresh: OlxAttachmentItem[] = []
      const push = (
        ref: { name?: unknown; url?: unknown } | null | undefined,
        kind: "attachment" | "cv",
      ) => {
        if (!ref) return
        const url = typeof ref.url === "string" ? ref.url.trim() : ""
        if (!url) return
        const name = typeof ref.name === "string" && ref.name.trim() ? ref.name.trim() : null
        fresh.push({ name, url, kind })
      }
      for (const a of Array.isArray(m.attachments) ? (m.attachments as Array<{ name?: unknown; url?: unknown }>) : []) {
        push(a, "attachment")
      }
      for (const a of Array.isArray(m.cvs) ? (m.cvs as Array<{ name?: unknown; url?: unknown }>) : []) {
        push(a, "cv")
      }
      freshByExternalId.set(id, fresh)
    }

    // Patch in-memory items + persist refreshed metadata back to DB.
    // OLX's listing typically returns ~50 most-recent thread messages;
    // older messages not in the response stay stale and will get
    // re-refreshed on the next request that still surfaces them.
    const updates: Array<Promise<unknown>> = []
    for (const item of items) {
      if (item.conversationId !== conversationId) continue
      if (!item.externalMessageId) continue
      if (!targetExternalIds.has(item.externalMessageId)) continue
      const fresh = freshByExternalId.get(item.externalMessageId)
      if (!fresh || fresh.length === 0) continue
      const newMeta: OlxAttachmentMeta = {
        kind: "olx_message_attachments",
        schemaVersion: 1,
        items: fresh,
      }
      ;(item as { metadata: unknown }).metadata = newMeta
      updates.push(
        this.prisma.message.update({
          where: { id: item.id },
          data: { metadata: newMeta as unknown as Prisma.InputJsonValue },
        }),
      )
    }
    await Promise.all(updates)
  }

  private buildOutboxMessageDto(message: any): OutboxMessageDto {
    return {
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction,
      text: message.text ?? null,
      clientMessageId: message.clientMessageId ?? null,
      createdAt: message.createdAt.toISOString(),
      sentAt: message.sentAt ? message.sentAt.toISOString() : null,
      deliveryStatus: message.deliveryStatus,
      errorCode: message.errorCode ?? null,
      errorMessage: message.errorMessage ?? null,
      ...(Array.isArray(message.attachments)
        ? {
            attachments: message.attachments.map((a: any) => ({
              id: a.id,
              kind: a.kind,
              mimeType: a.mimeType,
              sizeBytes: a.sizeBytes,
              originalName: a.originalName ?? null,
            })),
          }
        : {}),
    }
  }

  private async enqueueOutbox(outboxIds: string[]): Promise<void> {
    if (outboxIds.length === 0) return
    await Promise.all(
      outboxIds.map((outboxEventId) =>
        this.outboxQueue.add(
          "process",
          { outboxEventId },
          {
            removeOnComplete: true,
            removeOnFail: true,
          },
        ),
      ),
    )
  }

  private getOlxConfig() {
    const baseUrl = String(this.config.get<string>("OLX_BASE_URL") ?? "https://www.olx.ua").trim()
    const clientId = String(this.config.get<string>("OLX_CLIENT_ID") ?? "").trim()
    const clientSecret = String(this.config.get<string>("OLX_CLIENT_SECRET") ?? "").trim()
    const timeoutMs = Number(this.config.get<number>("OLX_REQUEST_TIMEOUT_MS") ?? 10_000)

    return {
      baseUrl,
      clientId,
      clientSecret,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : 10_000,
    }
  }

  private isOlxUnauthorized(err: unknown): boolean {
    return err instanceof OlxHttpError && (err.status === 401 || err.status === 403)
  }

  private isPromUnauthorized(err: unknown): boolean {
    return err instanceof PromHttpError && (err.status === 401 || err.status === 403)
  }

  private async refreshOlxAccessToken(input: {
    refreshToken: string
  }): Promise<DecryptedAuthData> {
    const cfg = this.getOlxConfig()
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new Error("OLX OAuth credentials are not configured")
    }
    const url = new URL(`${cfg.baseUrl.replace(/\/+$/, "")}/api/open/oauth/token`)
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    })

    const text = await res.text()
    if (!res.ok) {
      throw new OlxHttpError(res.status, text.slice(0, 500))
    }

    let json: Record<string, unknown>
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch {
      json = {}
    }

    const accessToken = safeString(json.access_token)
    if (!accessToken) {
      throw new Error("OLX refresh response does not include access_token")
    }

    return {
      accessToken,
      refreshToken: safeString(json.refresh_token) ?? input.refreshToken,
      expiresIn: safeNumber(json.expires_in),
      scope: safeString(json.scope),
      tokenType: safeString(json.token_type),
      obtainedAt: new Date().toISOString(),
    }
  }

  private async sendOlxMessage(input: {
    accessToken: string
    externalConversationId: string
    text: string
    messageId: string
    // OLX UA Partner v2 Message schema mirrors the inbound `attachments[]`
    // shape: `[{ name, url }]` where `url` is publicly fetchable. We pass
    // the long-lived Spaces presigned URL here; OLX downloads server-side
    // and re-hosts on its own CDN, so the URL TTL only needs to cover
    // OLX's fetch window (seconds–minutes in practice; we ship 7 days as
    // belt-and-suspenders).
    attachments?: Array<{ name: string; url: string }>
  }): Promise<{ externalMessageId: string | null; sentAt: Date }> {
    const cfg = this.getOlxConfig()
    // OLX UA partner API: POST /api/partner/threads/{threadId}/messages
    // externalConversationId is the thread id (set by OlxUaSyncService on inbound).
    const url = new URL(
      `${cfg.baseUrl.replace(/\/+$/, "")}/api/partner/threads/${encodeURIComponent(input.externalConversationId)}/messages`,
    )

    const body: { text: string; attachments?: Array<{ name: string; url: string }> } = {
      text: input.text,
    }
    if (input.attachments && input.attachments.length > 0) {
      body.attachments = input.attachments
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.accessToken}`,
        accept: "application/json",
        version: "2.0",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    })
    const text = await res.text()

    if (!res.ok) {
      throw new OlxHttpError(res.status, text.slice(0, 500))
    }

    let json: unknown
    try {
      json = JSON.parse(text) as unknown
    } catch {
      json = {}
    }

    const root = asRecord(json)
    const nested = asRecord(root?.data)
    // OLX UA returns numeric ids on message create; firstString() drops them.
    // Stringify here so externalMessageId matches what the inbound poll later
    // observes, otherwise the next poll re-inserts the same outgoing message
    // because dedup keys on externalMessageId.
    const stringifyId = (v: unknown): string | null => {
      if (typeof v === "number" && Number.isFinite(v)) return String(v)
      if (typeof v === "string") return v.trim() || null
      return null
    }
    const externalMessageId =
      stringifyId(nested?.id) ??
      stringifyId(root?.id) ??
      stringifyId(root?.messageId) ??
      stringifyId(root?.message_id) ??
      input.messageId
    const sentAtRaw = firstString(
      nested?.created_at,
      nested?.createdAt,
      root?.created_at,
      root?.createdAt,
    )
    const sentAt = sentAtRaw ? new Date(sentAtRaw) : new Date()
    return {
      externalMessageId,
      sentAt: Number.isNaN(sentAt.getTime()) ? new Date() : sentAt,
    }
  }

  private async finalizeOutgoingSuccess(input: {
    workspaceId: string
    messageId: string
    sentAt: Date
    externalMessageId?: string | null
  }) {
    const now = new Date()
    const result = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.findFirst({
        where: { id: input.messageId, workspaceId: input.workspaceId },
      })
      if (!message) throw new NotFoundException("Message not found")

      const conversation = await tx.conversation.findFirst({
        where: { id: message.conversationId, workspaceId: input.workspaceId },
      })
      if (!conversation) throw new NotFoundException("Conversation not found")

      const updatedMessage = await tx.message.update({
        where: { id: message.id },
        data: {
          deliveryStatus: "SENT",
          sentAt: input.sentAt,
          failedAt: null,
          errorCode: null,
          errorMessage: null,
          ...(input.externalMessageId ? { externalMessageId: input.externalMessageId } : {}),
        },
        include: { attachments: true },
      })

      const next = applySellerReplySuccessEffects(
        {
          id: conversation.id,
          needsReply: conversation.needsReply,
          isArchived: conversation.isArchived,
          isPinnedInAll: conversation.isPinnedInAll,
          snoozedUntil: conversation.snoozedUntil ? conversation.snoozedUntil.toISOString() : null,
          tagIds: [],
        },
        { direction: "OUT" },
        now,
      )

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          needsReply: next.needsReply,
          lastSellerReplyAt: now,
          lastActivityAt: now,
        },
      })

      const occurredAt = now.toISOString()
      const messagePatch = {
        deliveryStatus: updatedMessage.deliveryStatus,
        sentAt: updatedMessage.sentAt ? updatedMessage.sentAt.toISOString() : null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        ...(input.externalMessageId ? { externalMessageId: input.externalMessageId } : {}),
      } satisfies Prisma.InputJsonObject

      const outboxMessage = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "message.updated",
          aggregateId: updatedMessage.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt,
            data: {
              messageId: updatedMessage.id,
              patch: messagePatch,
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      const outboxConversation = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt,
            data: {
              conversationId: conversation.id,
              patch: {
                needsReply: next.needsReply,
                lastSellerReplyAt: now.toISOString(),
                lastActivityAt: now.toISOString(),
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { message: updatedMessage, outboxIds: [outboxMessage.id, outboxConversation.id] }
    })

    await this.enqueueOutbox(result.outboxIds)
    return result.message
  }

  private async finalizeOutgoingFailed(input: {
    workspaceId: string
    messageId: string
    errorCode: string
    errorMessage: string
  }) {
    const now = new Date()
    const result = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.findFirst({
        where: { id: input.messageId, workspaceId: input.workspaceId },
      })
      if (!message) throw new NotFoundException("Message not found")

      const updatedMessage = await tx.message.update({
        where: { id: message.id },
        data: {
          deliveryStatus: "FAILED",
          failedAt: now,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
        },
        include: { attachments: true },
      })

      const outbox = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "message.updated",
          aggregateId: updatedMessage.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt: now.toISOString(),
            data: {
              messageId: updatedMessage.id,
              patch: {
                deliveryStatus: updatedMessage.deliveryStatus,
                failedAt: updatedMessage.failedAt ? updatedMessage.failedAt.toISOString() : null,
                errorCode: updatedMessage.errorCode ?? null,
                errorMessage: updatedMessage.errorMessage ?? null,
              } satisfies Prisma.InputJsonObject,
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { message: updatedMessage, outboxIds: [outbox.id] }
    })

    await this.enqueueOutbox(result.outboxIds)
    return result.message
  }

  private async markMessageSending(input: { workspaceId: string; messageId: string }) {
    const now = new Date()
    const result = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.findFirst({
        where: { id: input.messageId, workspaceId: input.workspaceId },
      })
      if (!message) throw new NotFoundException("Message not found")

      const updatedMessage = await tx.message.update({
        where: { id: message.id },
        data: {
          deliveryStatus: "SENDING",
          failedAt: null,
          errorCode: null,
          errorMessage: null,
        },
        include: { attachments: true },
      })

      const outbox = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "message.updated",
          aggregateId: updatedMessage.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt: now.toISOString(),
            data: {
              messageId: updatedMessage.id,
              patch: {
                deliveryStatus: "SENDING",
                failedAt: null,
                errorCode: null,
                errorMessage: null,
              } satisfies Prisma.InputJsonObject,
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { message: updatedMessage, outboxIds: [outbox.id] }
    })

    await this.enqueueOutbox(result.outboxIds)
    return result.message
  }

  private async dispatchToOlx(input: {
    workspaceId: string
    messageId: string
    conversationId: string
    text: string
    externalConversationId: string | null
    channelAccountId: string
    // Outbound attachment storage refs from the Attachment table. Each
    // gets a 7-day presigned download URL minted at dispatch time; OLX
    // server-side downloads and re-hosts on its CDN, so the URL's TTL
    // only needs to outlive OLX's fetch window. 7 days is the S3 ceiling
    // and gives us plenty of headroom even for queued/retried sends.
    attachments?: Array<{ storageKey: string; originalName: string | null }>
  }): Promise<{ externalMessageId: string | null; sentAt: Date }> {
    if (!input.externalConversationId) {
      throw new Error("OLX conversation is missing externalConversationId")
    }

    const account = await this.prisma.channelAccount.findFirst({
      where: {
        id: input.channelAccountId,
        workspaceId: input.workspaceId,
        channel: "OLX",
      },
      select: {
        id: true,
        authType: true,
        authDataEncrypted: true,
      },
    })
    if (!account || account.authType !== "OAUTH" || !account.authDataEncrypted) {
      throw new Error("OLX account is not linked")
    }

    const auth = (await this.crypto.decrypt(input.workspaceId, account.authDataEncrypted)) as DecryptedAuthData

    // Presign every attachment storage key with a 7-day TTL. Done in
    // parallel because each `getSignedUrl` is a no-network SDK call
    // (just HMAC signing against the request) — but the await pattern
    // keeps the code symmetric with future remote-signer setups.
    let resolvedAttachments: Array<{ name: string; url: string }> | undefined
    if (input.attachments && input.attachments.length > 0) {
      resolvedAttachments = await Promise.all(
        input.attachments.map(async (a) => ({
          name: a.originalName ?? a.storageKey.split("/").pop() ?? "attachment",
          url: await this.storage.getPresignedDownloadUrl({
            key: a.storageKey,
            expiresInSeconds: 7 * 24 * 3600,
          }),
        })),
      )
    }

    const trySend = async (accessToken: string) =>
      this.sendOlxMessage({
        accessToken,
        externalConversationId: input.externalConversationId!,
        text: input.text,
        messageId: input.messageId,
        ...(resolvedAttachments ? { attachments: resolvedAttachments } : {}),
      })

    try {
      const delivered = await trySend(auth.accessToken)
      await this.prisma.channelAccount.update({
        where: { id: account.id },
        data: { lastError: null, lastSyncAt: new Date() },
      })
      return delivered
    } catch (err: unknown) {
      if (!this.isOlxUnauthorized(err) || !auth.refreshToken) {
        throw err
      }

      const refreshed = await this.refreshOlxAccessToken({ refreshToken: auth.refreshToken })
      await this.prisma.channelAccount.update({
        where: { id: account.id },
        data: {
          authDataEncrypted: await this.crypto.encrypt(input.workspaceId, {
            schemaVersion: 1,
            provider: "OLX",
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken ?? null,
            expiresIn: refreshed.expiresIn ?? null,
            scope: refreshed.scope ?? null,
            tokenType: refreshed.tokenType ?? null,
            obtainedAt: refreshed.obtainedAt ?? new Date().toISOString(),
          }),
          lastError: null,
          lastSyncAt: new Date(),
        },
      })
      return trySend(refreshed.accessToken)
    }
  }

  private async dispatchToProm(input: {
    workspaceId: string
    messageId: string
    conversationId: string
    text: string
    externalConversationId: string | null
    channelAccountId: string
  }): Promise<{ externalMessageId: string | null; sentAt: Date }> {
    const account = await this.prisma.channelAccount.findFirst({
      where: {
        id: input.channelAccountId,
        workspaceId: input.workspaceId,
        channel: "PROM",
      },
      select: {
        id: true,
        authType: true,
        authDataEncrypted: true,
      },
    })
    if (!account || account.authType !== "TOKEN" || !account.authDataEncrypted) {
      throw new Error("PROM account is not linked")
    }

    const auth = (await this.crypto.decrypt(input.workspaceId, account.authDataEncrypted)) as DecryptedPromAuthData
    const { baseUrl } = this.promApi.getPromConfig(auth.apiBaseUrl ?? undefined)

    const fallbackReplyByMessageId = async () => {
      const latestIncoming = await this.prisma.message.findFirst({
        where: {
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
          direction: "IN",
          externalMessageId: { not: null },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { externalMessageId: true },
      })

      const externalMessageId = safeString(latestIncoming?.externalMessageId)
      if (!externalMessageId) {
        throw new Error("PROM conversation is missing reply target")
      }

      return this.promApi.replyToMessage({
        baseUrl,
        apiToken: auth.apiToken,
        messageId: externalMessageId,
        text: input.text,
      })
    }

    try {
      const delivered = input.externalConversationId
        ? await this.promApi.sendChatMessage({
            baseUrl,
            apiToken: auth.apiToken,
            roomIdent: input.externalConversationId,
            text: input.text,
          })
        : await fallbackReplyByMessageId()

      await this.prisma.channelAccount.update({
        where: { id: account.id },
        data: { lastError: null, lastSyncAt: new Date() },
      })

      return delivered
    } catch (err: unknown) {
      if (input.externalConversationId && err instanceof PromHttpError && [400, 404, 422].includes(err.status)) {
        return fallbackReplyByMessageId()
      }
      throw err
    }
  }

  private async createOutgoingMessage(input: {
    workspaceId: string
    conversationId: string
    clientMessageId: string
    now: Date
    text: string | null
    attachmentCreate?: {
      id: string
      kind: "IMAGE" | "VIDEO" | "DOCUMENT"
      mimeType: string
      sizeBytes: number
      originalName: string
      storageKey: string
      expiresAt: Date
    }
  }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
        select: {
          id: true,
          workspaceId: true,
          channel: true,
          externalConversationId: true,
          needsReply: true,
          isArchived: true,
          isPinnedInAll: true,
          snoozedUntil: true,
          channelAccountId: true,
        },
      })
      if (!conversation) {
        throw new NotFoundException("Conversation not found")
      }

      const createdMessage = await tx.message.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
          direction: "OUT",
          text: input.text,
          clientMessageId: input.clientMessageId,
          deliveryStatus: "SENDING",
        },
      })

      if (input.attachmentCreate) {
        await tx.attachment.create({
          data: {
            id: input.attachmentCreate.id,
            workspaceId: input.workspaceId,
            messageId: createdMessage.id,
            kind: input.attachmentCreate.kind,
            mimeType: input.attachmentCreate.mimeType,
            sizeBytes: input.attachmentCreate.sizeBytes,
            originalName: input.attachmentCreate.originalName,
            storageKey: input.attachmentCreate.storageKey,
            expiresAt: input.attachmentCreate.expiresAt,
          },
        })
      }

      const message = await tx.message.findUniqueOrThrow({
        where: { id: createdMessage.id },
        include: { attachments: true },
      })

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastActivityAt: input.now,
        },
      })

      const occurredAt = input.now.toISOString()
      const outboxMessage = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "message.new",
          aggregateId: message.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt,
            data: {
              conversationId: input.conversationId,
              message: this.buildOutboxMessageDto(message),
            },
          },
          status: "PENDING",
          nextAttemptAt: input.now,
        },
      })

      const outboxConversation = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt,
            data: {
              conversationId: conversation.id,
              patch: {
                lastActivityAt: input.now.toISOString(),
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: input.now,
        },
      })

      return {
        message,
        conversation,
        outboxIds: [outboxMessage.id, outboxConversation.id],
      }
    })

    await this.enqueueOutbox(result.outboxIds)
    return result
  }

  async sendText(input: {
    workspaceId: string
    conversationId: string
    clientMessageId: string
    text: string
  }) {
    const existing = await this.prisma.message.findFirst({
      where: {
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      },
      include: { attachments: true },
    })
    if (existing) return existing

    const now = new Date()
    let created: Awaited<ReturnType<typeof this.createOutgoingMessage>>
    try {
      created = await this.createOutgoingMessage({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
        now,
        text: input.text,
      })
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existingAfter = await this.prisma.message.findFirst({
          where: {
            workspaceId: input.workspaceId,
            conversationId: input.conversationId,
            clientMessageId: input.clientMessageId,
          },
          include: { attachments: true },
        })
        if (existingAfter) return existingAfter
      }
      throw err
    }

    if (created.conversation.channel !== "OLX" && created.conversation.channel !== "PROM") {
      return this.finalizeOutgoingSuccess({
        workspaceId: input.workspaceId,
        messageId: created.message.id,
        sentAt: now,
      })
    }

    if (created.conversation.channel === "PROM") {
      try {
        const delivered = await this.dispatchToProm({
          workspaceId: input.workspaceId,
          messageId: created.message.id,
          conversationId: created.conversation.id,
          text: input.text,
          externalConversationId: created.conversation.externalConversationId,
          channelAccountId: created.conversation.channelAccountId,
        })
        return this.finalizeOutgoingSuccess({
          workspaceId: input.workspaceId,
          messageId: created.message.id,
          sentAt: delivered.sentAt,
          externalMessageId: delivered.externalMessageId,
        })
      } catch (err: unknown) {
        const message = this.isPromUnauthorized(err)
          ? "PROM auth failed. Reconnect channel account."
          : String((err as any)?.message ?? err)
        return this.finalizeOutgoingFailed({
          workspaceId: input.workspaceId,
          messageId: created.message.id,
          errorCode: "PROM_SEND_FAILED",
          errorMessage: message.slice(0, 500),
        })
      }
    }

    try {
      const delivered = await this.dispatchToOlx({
        workspaceId: input.workspaceId,
        messageId: created.message.id,
        conversationId: created.conversation.id,
        text: input.text,
        externalConversationId: created.conversation.externalConversationId,
        channelAccountId: created.conversation.channelAccountId,
      })
      return this.finalizeOutgoingSuccess({
        workspaceId: input.workspaceId,
        messageId: created.message.id,
        sentAt: delivered.sentAt,
        externalMessageId: delivered.externalMessageId,
      })
    } catch (err: unknown) {
      const message = this.isOlxUnauthorized(err)
        ? "OLX auth failed. Reconnect channel account."
        : String((err as any)?.message ?? err)
      return this.finalizeOutgoingFailed({
        workspaceId: input.workspaceId,
        messageId: created.message.id,
        errorCode: "OLX_SEND_FAILED",
        errorMessage: message.slice(0, 500),
      })
    }
  }

  async retry(input: { workspaceId: string; messageId: string }) {
    const message = await this.prisma.message.findFirst({
      where: { id: input.messageId, workspaceId: input.workspaceId },
      include: {
        attachments: true,
        conversation: {
          select: {
            id: true,
            channel: true,
            externalConversationId: true,
            channelAccountId: true,
          },
        },
      },
    })
    if (!message) throw new NotFoundException("Message not found")
    if (message.direction !== "OUT") throw new BadRequestException("Only outgoing messages can be retried")
    if (message.deliveryStatus !== "FAILED") {
      throw new BadRequestException("Only failed messages can be retried")
    }

    await this.markMessageSending({ workspaceId: input.workspaceId, messageId: message.id })

    if (message.conversation.channel === "OLX") {
      // OLX requires text OR attachments. Block only the truly-empty
      // case; an attachments-only message (empty text) is valid.
      if ((!message.text || message.text.trim().length === 0) && message.attachments.length === 0) {
        return this.finalizeOutgoingFailed({
          workspaceId: input.workspaceId,
          messageId: message.id,
          errorCode: "OLX_SEND_FAILED",
          errorMessage: "OLX message must have text or at least one attachment",
        })
      }

      try {
        const delivered = await this.dispatchToOlx({
          workspaceId: input.workspaceId,
          messageId: message.id,
          conversationId: message.conversation.id,
          text: message.text ?? "",
          externalConversationId: message.conversation.externalConversationId,
          channelAccountId: message.conversation.channelAccountId,
          attachments: message.attachments.map((a) => ({
            storageKey: a.storageKey,
            originalName: a.originalName,
          })),
        })
        return this.finalizeOutgoingSuccess({
          workspaceId: input.workspaceId,
          messageId: message.id,
          sentAt: delivered.sentAt,
          externalMessageId: delivered.externalMessageId,
        })
      } catch (err: unknown) {
        const errorMessage = this.isOlxUnauthorized(err)
          ? "OLX auth failed. Reconnect channel account."
          : String((err as any)?.message ?? err)
        return this.finalizeOutgoingFailed({
          workspaceId: input.workspaceId,
          messageId: message.id,
          errorCode: "OLX_SEND_FAILED",
          errorMessage: errorMessage.slice(0, 500),
        })
      }
    }

    if (message.conversation.channel === "PROM") {
      if (message.attachments.length > 0) {
        return this.finalizeOutgoingFailed({
          workspaceId: input.workspaceId,
          messageId: message.id,
          errorCode: "PROM_ATTACHMENT_NOT_SUPPORTED",
          errorMessage: "PROM attachment send is not implemented yet",
        })
      }
      if (!message.text || message.text.trim().length === 0) {
        return this.finalizeOutgoingFailed({
          workspaceId: input.workspaceId,
          messageId: message.id,
          errorCode: "PROM_SEND_FAILED",
          errorMessage: "PROM requires non-empty text message",
        })
      }

      try {
        const delivered = await this.dispatchToProm({
          workspaceId: input.workspaceId,
          messageId: message.id,
          conversationId: message.conversation.id,
          text: message.text,
          externalConversationId: message.conversation.externalConversationId,
          channelAccountId: message.conversation.channelAccountId,
        })
        return this.finalizeOutgoingSuccess({
          workspaceId: input.workspaceId,
          messageId: message.id,
          sentAt: delivered.sentAt,
          externalMessageId: delivered.externalMessageId,
        })
      } catch (err: unknown) {
        const errorMessage = this.isPromUnauthorized(err)
          ? "PROM auth failed. Reconnect channel account."
          : String((err as any)?.message ?? err)
        return this.finalizeOutgoingFailed({
          workspaceId: input.workspaceId,
          messageId: message.id,
          errorCode: "PROM_SEND_FAILED",
          errorMessage: errorMessage.slice(0, 500),
        })
      }
    }

    return this.finalizeOutgoingSuccess({
      workspaceId: input.workspaceId,
      messageId: message.id,
      sentAt: new Date(),
    })
  }

  async updateDeliveryStatus(input: {
    workspaceId: string
    messageId: string
    deliveryStatus: "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED"
    errorCode?: string
    errorMessage?: string
  }) {
    const now = new Date()

    const existing = await this.prisma.message.findFirst({
      where: { id: input.messageId, workspaceId: input.workspaceId },
    })
    if (!existing) throw new NotFoundException("Message not found")

    const updateData: any = {
      deliveryStatus: input.deliveryStatus,
      ...(input.deliveryStatus === "DELIVERED" ? { deliveredAt: now } : {}),
      ...(input.deliveryStatus === "READ" ? { readAt: now } : {}),
      ...(input.deliveryStatus === "FAILED"
        ? {
            failedAt: now,
            errorCode: input.errorCode ?? null,
            errorMessage: input.errorMessage ?? null,
          }
        : { errorCode: null, errorMessage: null }),
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.update({
        where: { id: existing.id },
        data: updateData,
        include: { attachments: true },
      })

      const occurredAt = now.toISOString()
      const patch = {
        deliveryStatus: message.deliveryStatus,
        deliveredAt: message.deliveredAt ? message.deliveredAt.toISOString() : null,
        readAt: message.readAt ? message.readAt.toISOString() : null,
        failedAt: message.failedAt ? message.failedAt.toISOString() : null,
        errorCode: message.errorCode ?? null,
        errorMessage: message.errorMessage ?? null,
      } satisfies Prisma.InputJsonObject

      const outbox = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "message.updated",
          aggregateId: message.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt,
            data: {
              messageId: message.id,
              patch,
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { message, outboxId: outbox.id }
    })

    await this.outboxQueue.add(
      "process",
      { outboxEventId: result.outboxId },
      { removeOnComplete: true, removeOnFail: true },
    )

    return result.message
  }

  async sendAttachment(input: {
    workspaceId: string
    conversationId: string
    clientMessageId: string
    file: {
      originalName: string
      mimeType: string
      sizeBytes: number
      buffer: Buffer
    }
  }) {
    const existing = await this.prisma.message.findFirst({
      where: {
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      },
      include: { attachments: true },
    })
    if (existing) return existing

    const now = new Date()
    const attachmentId = randomUUID()
    const storageKey = `attachments/${attachmentId}`
    const attachmentTtlDays = this.config.get<number>("ATTACHMENT_TTL_DAYS") ?? 7
    const attachmentExpiresAt = new Date(now.getTime() + attachmentTtlDays * 24 * 60 * 60_000)

    const mimeType = input.file.mimeType || "application/octet-stream"
    const kind = mimeType.startsWith("image/") ? "IMAGE" : mimeType.startsWith("video/") ? "VIDEO" : "DOCUMENT"

    await this.storage.putObject({
      key: storageKey,
      body: input.file.buffer,
      contentType: mimeType,
      originalName: input.file.originalName,
    })

    let created: Awaited<ReturnType<typeof this.createOutgoingMessage>>
    try {
      created = await this.createOutgoingMessage({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
        now,
        text: null,
        attachmentCreate: {
          id: attachmentId,
          kind,
          mimeType,
          sizeBytes: input.file.sizeBytes,
          originalName: input.file.originalName,
          storageKey,
          expiresAt: attachmentExpiresAt,
        },
      })
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existingAfter = await this.prisma.message.findFirst({
          where: {
            workspaceId: input.workspaceId,
            conversationId: input.conversationId,
            clientMessageId: input.clientMessageId,
          },
          include: { attachments: true },
        })
        if (existingAfter) return existingAfter
      }
      throw err
    }

    if (created.conversation.channel === "OLX") {
      try {
        const delivered = await this.dispatchToOlx({
          workspaceId: input.workspaceId,
          messageId: created.message.id,
          conversationId: created.conversation.id,
          text: "",
          externalConversationId: created.conversation.externalConversationId,
          channelAccountId: created.conversation.channelAccountId,
          attachments: [
            {
              storageKey,
              originalName: input.file.originalName,
            },
          ],
        })
        return this.finalizeOutgoingSuccess({
          workspaceId: input.workspaceId,
          messageId: created.message.id,
          sentAt: delivered.sentAt,
          externalMessageId: delivered.externalMessageId,
        })
      } catch (err: unknown) {
        const errorMessage = this.isOlxUnauthorized(err)
          ? "OLX auth failed. Reconnect channel account."
          : String((err as any)?.message ?? err)
        return this.finalizeOutgoingFailed({
          workspaceId: input.workspaceId,
          messageId: created.message.id,
          errorCode: "OLX_SEND_FAILED",
          errorMessage: errorMessage.slice(0, 500),
        })
      }
    }

    if (created.conversation.channel === "PROM") {
      return this.finalizeOutgoingFailed({
        workspaceId: input.workspaceId,
        messageId: created.message.id,
        errorCode: "PROM_ATTACHMENT_NOT_SUPPORTED",
        errorMessage: "PROM attachment send is not implemented yet",
      })
    }

    return this.finalizeOutgoingSuccess({
      workspaceId: input.workspaceId,
      messageId: created.message.id,
      sentAt: now,
    })
  }
}
