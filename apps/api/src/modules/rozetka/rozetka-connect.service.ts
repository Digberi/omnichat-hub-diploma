import { BadGatewayException, BadRequestException, Inject, Injectable } from "@nestjs/common"
import { PinoLogger } from "nestjs-pino"

import { ENVELOPE_CRYPTO } from "@omnichat/kms/nest"
import type { EnvelopeCryptoService } from "@omnichat/kms"
import { ChannelAccountsRepository } from "../channel-accounts/channel-accounts.repository"
import { RozetkaApiError, RozetkaApiService } from "./rozetka-api.service"

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

@Injectable()
export class RozetkaConnectService {
  constructor(
    private readonly repo: ChannelAccountsRepository,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCryptoService,
    private readonly rozetkaApi: RozetkaApiService,
    private readonly logger: PinoLogger,
  ) {}

  async connect(input: {
    workspaceId: string
    userId: string
    alias?: string
    channelAccountId?: string
    apiBaseUrl?: string
    apiToken: string
  }) {
    const token = safeString(input.apiToken)
    if (!token) {
      throw new BadRequestException("ROZETKA API token is required")
    }

    const { baseUrl } = this.rozetkaApi.getRozetkaConfig(input.apiBaseUrl)

    try {
      await this.rozetkaApi.validateToken(baseUrl, token)
    } catch (err) {
      if (err instanceof RozetkaApiError && (err.status === 401 || err.status === 403 || err.code === "invalid_credentials")) {
        this.logger.warn({ status: err.status, code: err.code, body: err.body }, "ROZETKA token validation failed")
        throw new BadRequestException("ROZETKA API token is invalid or revoked")
      }

      if (err instanceof RozetkaApiError && err.code === "access_denied") {
        this.logger.warn({ status: err.status, code: err.code, body: err.body }, "ROZETKA token lacks permissions")
        throw new BadRequestException("ROZETKA token does not have required permissions for correspondence API")
      }

      if (err instanceof RozetkaApiError) {
        this.logger.error({ status: err.status, code: err.code, body: err.body }, "ROZETKA validation request failed")
        throw new BadGatewayException("ROZETKA API is unavailable or returned an unexpected error")
      }

      throw err
    }

    const alias = safeString(input.alias) ?? `ROZETKA ${new Date().toISOString().slice(0, 10)}`

    const authDataEncrypted = await this.crypto.encrypt(input.workspaceId, {
      schemaVersion: 1,
      provider: "ROZETKA",
      workspaceId: input.workspaceId,
      userId: input.userId,
      obtainedAt: new Date().toISOString(),
      apiToken: token,
      apiBaseUrl: baseUrl,
    })

    return this.repo.upsertRozetkaTokenAccount({
      workspaceId: input.workspaceId,
      alias,
      authDataEncrypted,
      ...(input.channelAccountId ? { channelAccountId: input.channelAccountId } : {}),
    })
  }
}
