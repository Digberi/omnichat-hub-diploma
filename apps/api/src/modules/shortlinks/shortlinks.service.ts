import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

import { StorageService } from "../storage/storage.service"
import { ShortLinksRepository } from "./shortlinks.repository"

const EXPIRED_TEXT_UA = "Файл недоступний. Попросіть продавця надіслати ще раз."

@Injectable()
export class ShortLinksService {
  constructor(
    private readonly repo: ShortLinksRepository,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async resolveToken(input: { token: string }): Promise<
    | { kind: "redirect"; url: string }
    | { kind: "expired"; status: number; message: string; html: string; conversationId?: string | null }
  > {
    const row = await this.repo.findByToken(input.token)
    const now = new Date()

    const conversationId = row?.attachment?.message?.conversationId ?? null
    const publicWebUrl = String(this.config.get<string>("PUBLIC_WEB_URL") ?? "").trim()
    const contactUrl = publicWebUrl && conversationId ? `${publicWebUrl.replace(/\/$/, "")}/chat/${conversationId}` : null

    if (!row) {
      return {
        kind: "expired",
        status: 404,
        message: EXPIRED_TEXT_UA,
        conversationId,
        html: this.renderExpiredHtml({ message: EXPIRED_TEXT_UA, contactUrl }),
      }
    }

    if (row.expiresAt <= now) {
      return {
        kind: "expired",
        status: 410,
        message: EXPIRED_TEXT_UA,
        conversationId,
        html: this.renderExpiredHtml({ message: EXPIRED_TEXT_UA, contactUrl }),
      }
    }

    const attachmentExpiresAt = row.attachment.expiresAt ?? null
    if (attachmentExpiresAt && attachmentExpiresAt <= now) {
      return {
        kind: "expired",
        status: 410,
        message: EXPIRED_TEXT_UA,
        conversationId,
        html: this.renderExpiredHtml({ message: EXPIRED_TEXT_UA, contactUrl }),
      }
    }

    const exists = await this.storage.headObject({ key: row.attachment.storageKey })
    if (!exists) {
      return {
        kind: "expired",
        status: 410,
        message: EXPIRED_TEXT_UA,
        conversationId,
        html: this.renderExpiredHtml({ message: EXPIRED_TEXT_UA, contactUrl }),
      }
    }

    // Best-effort access stats.
    void this.repo.markAccessed({ id: row.id })

    const url = await this.storage.getPresignedDownloadUrl({
      key: row.attachment.storageKey,
      expiresInSeconds: 60,
    })

    return { kind: "redirect", url }
  }

  private renderExpiredHtml(input: { message: string; contactUrl: string | null }): string {
    const contact = input.contactUrl
      ? `<p style="margin:16px 0 0"><a href="${input.contactUrl}" style="display:inline-block;padding:10px 14px;border:1px solid #111;border-radius:8px;text-decoration:none;color:#111">Зв\u2019язатися</a></p>`
      : ""

    return `<!doctype html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>\u0424\u0430\u0439\u043b \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0438\u0439</title>
  </head>
  <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:24px;max-width:640px;margin:0 auto">
    <h1 style="margin:0 0 12px;font-size:20px">\u0424\u0430\u0439\u043b \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0438\u0439</h1>
    <p style="margin:0;color:#333;line-height:1.4">${input.message}</p>
    ${contact}
  </body>
</html>`
  }
}
