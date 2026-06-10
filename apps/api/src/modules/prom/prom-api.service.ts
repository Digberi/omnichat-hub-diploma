import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { PinoLogger } from "nestjs-pino"

const REQUEST_TIMEOUT_MS = 10_000

export class PromHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`PROM HTTP ${status}`)
  }
}

export type PromValidationResponse = {
  messages?: unknown[]
  clients?: unknown[]
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

@Injectable()
export class PromApiService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  getPromConfig(inputBaseUrl?: string): { baseUrl: string; timeoutMs: number } {
    const configuredBaseUrl = safeString(inputBaseUrl)
    const baseUrl = configuredBaseUrl ?? String(this.config.get<string>("PROM_API_BASE_URL") ?? "https://my.prom.ua/api/v1").trim()
    const timeoutMs = Number(this.config.get<number>("PROM_REQUEST_TIMEOUT_MS") ?? REQUEST_TIMEOUT_MS)

    return {
      baseUrl,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : REQUEST_TIMEOUT_MS,
    }
  }

  buildPromUrl(baseUrl: string, endpoint: string): URL {
    if (/^https?:\/\//i.test(endpoint)) {
      return new URL(endpoint)
    }

    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
    const normalizedEndpoint = endpoint.replace(/^\/+/, "")
    return new URL(normalizedEndpoint, normalizedBase)
  }

  inferProject(baseUrl: string): "promua" | "biglua" {
    return /bigl/i.test(baseUrl) ? "biglua" : "promua"
  }

  private async request(input: {
    baseUrl: string
    apiToken: string
    endpoint: string
    method?: "GET" | "POST"
    query?: Record<string, string>
    body?: Record<string, unknown>
  }) {
    const { timeoutMs } = this.getPromConfig(input.baseUrl)
    const url = this.buildPromUrl(input.baseUrl, input.endpoint)

    for (const [key, value] of Object.entries(input.query ?? {})) {
      url.searchParams.set(key, value)
    }

    const response = await fetch(url, {
      method: input.method ?? "GET",
      headers: {
        Authorization: `Bearer ${input.apiToken}`,
        "X-LANGUAGE": "uk",
        ...(input.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    })

    const text = await response.text()
    if (!response.ok) {
      throw new PromHttpError(response.status, text.slice(0, 500))
    }

    return text
  }

  async validateToken(baseUrl: string, token: string): Promise<PromValidationResponse> {
    const text = await this.request({
      baseUrl,
      apiToken: token,
      endpoint: "/messages/list",
      query: { limit: "1" },
    })

    try {
      return JSON.parse(text) as PromValidationResponse
    } catch {
      this.logger.warn("PROM validation returned non-JSON response")
      return {}
    }
  }

  async sendChatMessage(input: {
    baseUrl: string
    apiToken: string
    roomIdent: string
    text: string
  }): Promise<{ externalMessageId: string | null; sentAt: Date }> {
    const textBody = await this.request({
      baseUrl: input.baseUrl,
      apiToken: input.apiToken,
      endpoint: "/chat/send_message",
      method: "POST",
      body: {
        room_ident: input.roomIdent,
        body: input.text,
        project: this.inferProject(input.baseUrl),
      },
    })

    let json: unknown
    try {
      json = JSON.parse(textBody)
    } catch {
      json = {}
    }

    const root = asRecord(json)
    const data = asRecord(root?.data)
    const externalMessageId = safeString(root?.message_id) ?? safeString(data?.message_id) ?? null

    return {
      externalMessageId,
      sentAt: new Date(),
    }
  }

  async replyToMessage(input: {
    baseUrl: string
    apiToken: string
    messageId: string
    text: string
  }): Promise<{ externalMessageId: string | null; sentAt: Date }> {
    const numericMessageId = safeNumber(input.messageId)
    const textBody = await this.request({
      baseUrl: input.baseUrl,
      apiToken: input.apiToken,
      endpoint: "/messages/reply",
      method: "POST",
      body: {
        id: numericMessageId ?? input.messageId,
        message: input.text,
      },
    })

    let json: unknown
    try {
      json = JSON.parse(textBody)
    } catch {
      json = {}
    }

    const root = asRecord(json)
    const processedIds = Array.isArray(root?.processed_ids) ? root.processed_ids : []
    const externalMessageId =
      safeString(processedIds.at(0)) ??
      (typeof processedIds.at(0) === "number" ? `${processedIds.at(0)}` : null) ??
      input.messageId

    return {
      externalMessageId,
      sentAt: new Date(),
    }
  }
}
