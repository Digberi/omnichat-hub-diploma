import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { PinoLogger } from "nestjs-pino"
import { shouldSuppressPush } from "@omnichat/domain"

import { PrismaService } from "../prisma/prisma.service"

type OutboxPayloadV1 = {
  schemaVersion: number
  workspaceId: string
  occurredAt: string
  data: Record<string, unknown>
}

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim()
  return v.length ? v : null
}

@Injectable()
export class PushService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  // Returns true if a push was actually sent.
  async deliverForOutboxEvent(event: { workspaceId: string; type: string; payload: unknown }): Promise<boolean> {
    const payload = event.payload as Partial<OutboxPayloadV1> | null
    const data = payload?.data as any

    if (event.type === "message.new") {
      const conversationId = safeString(data?.conversationId)
      const msg = data?.message as any
      if (!conversationId || !msg) return false

      // Push is only for new incoming messages.
      if (msg.direction !== "IN") return false

      const conversation = await this.prisma.conversation.findFirst({
        where: { id: conversationId, workspaceId: event.workspaceId },
        select: { snoozedUntil: true, buyerDisplayName: true },
      })
      if (!conversation) return false

      if (shouldSuppressPush({ snoozedUntil: conversation.snoozedUntil?.toISOString() ?? null })) {
        return false
      }

      const settings = await this.prisma.workspaceSettings.upsert({
        where: { workspaceId: event.workspaceId },
        update: {},
        create: { workspaceId: event.workspaceId },
      })
      if (!settings.pushNewMessageEnabled) return false

      const tokens = await this.prisma.devicePushToken.findMany({
        where: {
          workspaceId: event.workspaceId,
          isEnabled: true,
          platform: { in: ["IOS", "ANDROID"] },
        },
        select: { token: true },
        take: 1000,
      })
      if (tokens.length === 0) return false

      const title = conversation.buyerDisplayName || "New message"
      const bodyText = safeString(msg.text) ?? "New message"

      await this.sendPush({
        workspaceId: event.workspaceId,
        to: tokens.map((t: (typeof tokens)[number]) => t.token),
        title,
        body: bodyText.slice(0, 180),
        data: {
          kind: "message.new",
          conversationId,
          workspaceId: event.workspaceId,
        },
      })

      return true
    }

    if (event.type === "message.updated") {
      const messageId = safeString(data?.messageId)
      const patch = data?.patch as any
      if (!messageId || !patch) return false

      if (patch.deliveryStatus !== "FAILED") return false

      const message = await this.prisma.message.findFirst({
        where: { id: messageId, workspaceId: event.workspaceId },
        select: {
          id: true,
          direction: true,
          text: true,
          errorCode: true,
          errorMessage: true,
          conversationId: true,
          conversation: { select: { buyerDisplayName: true } },
        },
      })
      if (!message) return false

      // Push send errors only for outgoing messages.
      if (message.direction !== "OUT") return false

      const settings = await this.prisma.workspaceSettings.upsert({
        where: { workspaceId: event.workspaceId },
        update: {},
        create: { workspaceId: event.workspaceId },
      })
      if (!settings.pushSendErrorEnabled) return false

      const tokens = await this.prisma.devicePushToken.findMany({
        where: {
          workspaceId: event.workspaceId,
          isEnabled: true,
          platform: { in: ["IOS", "ANDROID"] },
        },
        select: { token: true },
        take: 1000,
      })
      if (tokens.length === 0) return false

      const title = "Помилка відправки"
      const buyerName = message.conversation?.buyerDisplayName || "Чат"
      const bodyText = safeString(message.errorMessage) ?? safeString(message.text) ?? "Не вдалося надіслати повідомлення"

      await this.sendPush({
        workspaceId: event.workspaceId,
        to: tokens.map((t: (typeof tokens)[number]) => t.token),
        title,
        body: `${buyerName}: ${bodyText}`.slice(0, 180),
        data: {
          kind: "message.send_error",
          conversationId: message.conversationId,
          messageId: message.id,
          workspaceId: event.workspaceId,
          errorCode: message.errorCode ?? null,
        },
      })

      return true
    }

    return false
  }

  private async sendPush(input: {
    workspaceId: string
    to: string[]
    title: string
    body: string
    data: Record<string, unknown>
  }): Promise<void> {
    const provider = this.config.get<string>("PUSH_PROVIDER") ?? "console"

    if (provider === "expo") {
      await this.sendExpoPush(input)
      return
    }

    this.logger.info(
      { tokens: input.to.length, title: input.title, body: input.body },
      "push notification (console provider)",
    )
  }

  private async sendExpoPush(input: {
    workspaceId: string
    to: string[]
    title: string
    body: string
    data: Record<string, unknown>
  }): Promise<void> {
    const accessToken = String(this.config.get<string>("EXPO_ACCESS_TOKEN") ?? "").trim()

    const messages = input.to.map((token) => ({
      to: token,
      title: input.title,
      body: input.body,
      data: input.data,
    }))

    // Expo push API supports up to 100 notifications per request.
    const batchSize = 100
    for (let start = 0; start < messages.length; start += batchSize) {
      const batch = messages.slice(start, start + batchSize)

      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(10_000),
      })

      const text = await res.text()
      if (!res.ok) {
        throw new Error(`expo push failed: ${res.status} ${text}`)
      }

      let json: any
      try {
        json = JSON.parse(text) as any
      } catch (err: any) {
        throw new Error(`expo push bad response: ${String(err?.message ?? err)}; body=${text}`)
      }

      const data = Array.isArray(json?.data) ? json.data : []
      const hardErrors: string[] = []
      const disableTokens: string[] = []
      const ticketIds: string[] = []
      const tokenByTicketId = new Map<string, string>()
      let okTickets = 0

      for (let i = 0; i < data.length; i += 1) {
        const row = data[i]
        const token = safeString(batch[i]?.to)

        if (row?.status === "ok") {
          okTickets += 1
          const id = safeString(row?.id)
          if (id && token) {
            ticketIds.push(id)
            tokenByTicketId.set(id, token)
          }
          continue
        }

        if (row?.status !== "error") continue

        const detailsError = safeString(row?.details?.error)
        const msg = safeString(row?.message) ?? "expo push error"

        if (detailsError === "DeviceNotRegistered") {
          if (token) disableTokens.push(token)
          continue
        }

        hardErrors.push(detailsError ? `${detailsError}: ${msg}` : msg)
      }

      if (disableTokens.length > 0) {
        await this.prisma.devicePushToken.updateMany({
          where: { workspaceId: input.workspaceId, token: { in: disableTokens } },
          data: { isEnabled: false },
        })
      }

      if (hardErrors.length > 0 && okTickets === 0) {
        // Nothing was accepted by Expo, so it's safe to fail and let Outbox retry.
        throw new Error(`expo push errors: ${hardErrors.join("; ")}`)
      }

      if (ticketIds.length > 0) {
        // Optional reliability: check receipts to disable invalid tokens and surface delivery errors.
        const receiptsRes = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ ids: ticketIds }),
          signal: AbortSignal.timeout(10_000),
        })

        const receiptsText = await receiptsRes.text()
        if (!receiptsRes.ok) {
          // If we already have ok tickets, don't fail the whole outbox event just because receipt polling failed.
          // This avoids duplicate pushes. We'll rely on future jobs/monitoring to surface issues.
          if (okTickets === 0) {
            throw new Error(`expo receipts failed: ${receiptsRes.status} ${receiptsText}`)
          }
        } else {
          let receiptsJson: any
          try {
            receiptsJson = JSON.parse(receiptsText) as any
          } catch (err: any) {
            if (okTickets === 0) {
              throw new Error(`expo receipts bad response: ${String(err?.message ?? err)}; body=${receiptsText}`)
            }
            receiptsJson = null
          }

          const receipts = receiptsJson?.data ?? null
          const receiptHardErrors: string[] = []
          const receiptDisableTokens: string[] = []
          let receiptErrors = 0

          if (receipts && typeof receipts === "object") {
            for (const ticketId of ticketIds) {
              const r = (receipts as any)[ticketId]
              if (!r || typeof r !== "object") continue
              if (r.status !== "error") continue
              receiptErrors += 1

              const detailsError = safeString(r?.details?.error)
              const msg = safeString(r?.message) ?? "expo receipt error"

              if (detailsError === "DeviceNotRegistered") {
                const token = tokenByTicketId.get(ticketId)
                if (token) receiptDisableTokens.push(token)
                continue
              }

              receiptHardErrors.push(detailsError ? `${detailsError}: ${msg}` : msg)
            }
          }

          if (receiptDisableTokens.length > 0) {
            await this.prisma.devicePushToken.updateMany({
              where: { workspaceId: input.workspaceId, token: { in: receiptDisableTokens } },
              data: { isEnabled: false },
            })
          }

          // If everything errored at receipt stage, treat it as a failed delivery.
          if (receiptErrors > 0 && receiptErrors === ticketIds.length) {
            throw new Error(`expo push receipts errors: ${[...receiptHardErrors].join("; ") || "all receipts errored"}`)
          }

          // If we have only partial receipt errors, do not fail the whole outbox event (avoid duplicate pushes).
          if (receiptHardErrors.length > 0) {
            this.logger.warn({ errors: receiptHardErrors }, "expo push receipt errors (partial)")
          }
        }
      }
    }
  }
}
