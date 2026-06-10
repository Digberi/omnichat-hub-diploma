import { BadGatewayException, BadRequestException, Inject, Injectable } from "@nestjs/common"
import { PinoLogger } from "nestjs-pino"

import { ENVELOPE_CRYPTO } from "@omnichat/kms/nest"
import type { EnvelopeCryptoService } from "@omnichat/kms"
import { ChannelAccountsRepository } from "../channel-accounts/channel-accounts.repository"
import { PromApiService, PromHttpError } from "./prom-api.service"

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

@Injectable()
export class PromConnectService {
  constructor(
    private readonly repo: ChannelAccountsRepository,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCryptoService,
    private readonly promApi: PromApiService,
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
      throw new BadRequestException("PROM API token is required")
    }

    const { baseUrl } = this.promApi.getPromConfig(input.apiBaseUrl)

    try {
      await this.promApi.validateToken(baseUrl, token)
    } catch (err) {
      if (err instanceof PromHttpError && (err.status === 401 || err.status === 403)) {
        this.logger.warn({ status: err.status, body: err.body }, "PROM token validation failed")
        throw new BadRequestException("PROM API token is invalid or revoked")
      }

      if (err instanceof PromHttpError) {
        this.logger.error({ status: err.status, body: err.body }, "PROM validation request failed")
        throw new BadGatewayException("PROM API is unavailable or returned an unexpected error")
      }

      throw err
    }

    const alias = safeString(input.alias) ?? `PROM ${new Date().toISOString().slice(0, 10)}`

    const authDataEncrypted = await this.crypto.encrypt(input.workspaceId, {
      schemaVersion: 1,
      provider: "PROM",
      workspaceId: input.workspaceId,
      userId: input.userId,
      obtainedAt: new Date().toISOString(),
      apiToken: token,
      apiBaseUrl: baseUrl,
    })

    return this.repo.upsertPromTokenAccount({
      workspaceId: input.workspaceId,
      alias,
      authDataEncrypted,
      ...(input.channelAccountId ? { channelAccountId: input.channelAccountId } : {}),
    })
  }
}
