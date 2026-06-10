import { GoneException, Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Prisma } from "@omnichat/db"
import { randomBytes } from "crypto"

import { StorageService } from "../storage/storage.service"
import { AttachmentsRepository } from "./attachments.repository"

function randomToken(): string {
  return randomBytes(16).toString("base64url")
}

const EXPIRED_TEXT_UA = "Файл недоступний. Попросіть продавця надіслати ще раз."

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly repo: AttachmentsRepository,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  async createShortLink(input: { workspaceId: string; attachmentId: string }) {
    const now = new Date()
    const attachment = await this.repo.getAttachmentOrThrow(input)

    const attachmentTtlDays = this.config.get<number>("ATTACHMENT_TTL_DAYS") ?? 7
    const defaultAttachmentExpiresAt = new Date(now.getTime() + attachmentTtlDays * 24 * 60 * 60 * 1000)
    const attachmentExpiresAt = attachment.expiresAt ?? defaultAttachmentExpiresAt

    // Backfill expiry for older rows (best-effort). This also makes shortlink TTL deterministic.
    if (!attachment.expiresAt) {
      void this.repo.setAttachmentExpiry({ attachmentId: attachment.id, expiresAt: attachmentExpiresAt }).catch(() => undefined)
    }

    if (attachmentExpiresAt <= now) {
      throw new GoneException(EXPIRED_TEXT_UA)
    }

    const exists = await this.storage.headObject({ key: attachment.storageKey })
    if (!exists) {
      throw new GoneException(EXPIRED_TEXT_UA)
    }

    const ttlDays = this.config.get<number>("SHORTLINK_TTL_DAYS") ?? 7
    const ttlExpiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000)
    const expiresAt = attachmentExpiresAt < ttlExpiresAt ? attachmentExpiresAt : ttlExpiresAt

    if (expiresAt <= now) {
      throw new GoneException(EXPIRED_TEXT_UA)
    }

    const existing = await this.repo.findShortLinkByAttachmentId(attachment.id)
    if (existing && existing.expiresAt > now) {
      // Safety: avoid shortlinks that outlive attachment expiry (can happen after config changes).
      if (existing.expiresAt.getTime() > expiresAt.getTime()) {
        const updated = await this.repo.updateShortLinkExpiry({ id: existing.id, expiresAt })
        return {
          token: updated.token,
          expiresAt: updated.expiresAt.toISOString(),
          url: `/v1/s/${updated.token}`,
        }
      }

      return {
        token: existing.token,
        expiresAt: existing.expiresAt.toISOString(),
        url: `/v1/s/${existing.token}`,
      }
    }

    for (let i = 0; i < 5; i += 1) {
      const token = randomToken()
      try {
        const row = existing
          ? await this.repo.rotateShortLink({ id: existing.id, token, expiresAt })
          : await this.repo.createShortLink({
              workspaceId: attachment.workspaceId,
              attachmentId: attachment.id,
              token,
              expiresAt,
            })

        return {
          token: row.token,
          expiresAt: row.expiresAt.toISOString(),
          url: `/v1/s/${row.token}`,
        }
      } catch (err: any) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          continue
        }
        throw err
      }
    }

    throw new Error("Failed to create short link (token collisions)")
  }
}
