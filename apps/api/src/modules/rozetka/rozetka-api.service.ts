import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { PinoLogger } from "nestjs-pino"

const REQUEST_TIMEOUT_MS = 10_000

export class RozetkaApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly body: string,
  ) {
    super(`ROZETKA HTTP ${status}${code ? ` ${code}` : ""}`)
  }
}

type RozetkaEnvelope = {
  success?: boolean
  content?: unknown
  errors?: {
    message?: string
    code?: unknown
  }
}

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

@Injectable()
export class RozetkaApiService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  getRozetkaConfig(inputBaseUrl?: string): { baseUrl: string; timeoutMs: number } {
    const configuredBaseUrl = safeString(inputBaseUrl)
    const baseUrl =
      configuredBaseUrl ??
      String(this.config.get<string>("ROZETKA_API_BASE_URL") ?? "https://api-seller.rozetka.com.ua").trim()
    const timeoutMs = Number(this.config.get<number>("ROZETKA_REQUEST_TIMEOUT_MS") ?? REQUEST_TIMEOUT_MS)

    return {
      baseUrl,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : REQUEST_TIMEOUT_MS,
    }
  }

  buildRozetkaUrl(baseUrl: string, endpoint: string): URL {
    if (/^https?:\/\//i.test(endpoint)) {
      return new URL(endpoint)
    }

    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
    const normalizedEndpoint = endpoint.replace(/^\/+/, "")
    return new URL(normalizedEndpoint, normalizedBase)
  }

  private parseEnvelope(bodyText: string): RozetkaEnvelope {
    try {
      return JSON.parse(bodyText) as RozetkaEnvelope
    } catch {
      this.logger.warn("ROZETKA API returned non-JSON response")
      return {}
    }
  }

  private async request(input: {
    baseUrl: string
    apiToken: string
    endpoint: string
    query?: Record<string, string>
  }) {
    const { timeoutMs } = this.getRozetkaConfig(input.baseUrl)
    const url = this.buildRozetkaUrl(input.baseUrl, input.endpoint)

    for (const [key, value] of Object.entries(input.query ?? {})) {
      url.searchParams.set(key, value)
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.apiToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    const text = await response.text()
    const envelope = this.parseEnvelope(text)
    const errorCode = safeString(envelope.errors?.message) ?? safeString(asRecord(envelope.errors)?.code)

    if (!response.ok) {
      throw new RozetkaApiError(response.status, errorCode, text.slice(0, 500))
    }

    if (envelope.success === false) {
      throw new RozetkaApiError(response.status, errorCode, text.slice(0, 500))
    }

    return envelope
  }

  async validateToken(baseUrl: string, token: string): Promise<RozetkaEnvelope> {
    return this.request({
      baseUrl,
      apiToken: token,
      endpoint: "/messages/search",
      query: {
        page: "1",
        msgType: "orders",
      },
    })
  }
}
