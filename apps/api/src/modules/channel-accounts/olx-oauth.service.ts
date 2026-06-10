import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { randomBytes } from "crypto"
import { PinoLogger } from "nestjs-pino"

import { ENVELOPE_CRYPTO } from "@omnichat/kms/nest"
import type { EnvelopeCryptoService } from "@omnichat/kms"
import { RedisService } from "../redis/redis.service"
import { ChannelAccountsRepository } from "./channel-accounts.repository"

const OAUTH_STATE_TTL_SECONDS = 10 * 60
const REQUEST_TIMEOUT_MS = 10_000

const OLX_OAUTH_AUTHORIZE_PATH = "/oauth/authorize"
const OLX_OAUTH_TOKEN_PATH = "/api/open/oauth/token"
const OLX_USER_INFO_PATH = "/api/partner/users/me"

type OlxOauthState = {
  redirectTo: string
  workspaceId: string
  userId: string
  channelAccountId: string | null
}

type OlxTokenResponse = {
  access_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
  scope?: unknown
  token_type?: unknown
  error?: unknown
  error_description?: unknown
}

type OlxUserMeResponse = {
  data?: {
    id?: unknown
    name?: unknown
    email?: unknown
    phone?: unknown
  } | null
  id?: unknown
  name?: unknown
  email?: unknown
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s.length ? s : null
}

function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    const s = safeString(v)
    if (s) return s
  }
  return null
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "")
  const trimmedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedBase}${trimmedPath}`
}

@Injectable()
export class OlxOauthService {
  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly repo: ChannelAccountsRepository,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCryptoService,
    private readonly logger: PinoLogger,
  ) {}

  private getOlxConfig(): {
    baseUrl: string
    clientId: string
    clientSecret: string
    redirectUrl: string
    scope: string
  } {
    const baseUrl = String(this.config.get<string>("OLX_BASE_URL") ?? "https://www.olx.ua").trim()
    const clientId = String(this.config.get<string>("OLX_CLIENT_ID") ?? "").trim()
    const clientSecret = String(this.config.get<string>("OLX_CLIENT_SECRET") ?? "").trim()
    const redirectUrl = String(this.config.get<string>("OLX_REDIRECT_URL") ?? "").trim()
    const scope = String(this.config.get<string>("OLX_SCOPE") ?? "read write v2").trim()

    if (!clientId || !clientSecret || !redirectUrl) {
      throw new BadRequestException(
        "OLX OAuth is disabled. Configure OLX_CLIENT_ID/OLX_CLIENT_SECRET/OLX_REDIRECT_URL.",
      )
    }

    return { baseUrl, clientId, clientSecret, redirectUrl, scope }
  }

  private defaultRedirectTo(): string {
    const publicWebUrl = String(this.config.get<string>("PUBLIC_WEB_URL") ?? "").trim()
    if (!publicWebUrl) return "http://localhost:3000/settings"
    try {
      const u = new URL(publicWebUrl)
      u.pathname = "/settings"
      return u.toString()
    } catch {
      return "http://localhost:3000/settings"
    }
  }

  private normalizeRedirectTo(raw: string | undefined): string {
    const fallback = this.defaultRedirectTo()
    const candidate = safeString(raw)
    if (!candidate) return fallback

    let url: URL
    try {
      url = new URL(candidate)
    } catch {
      return fallback
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback

    const allowedOrigins = String(this.config.get<string>("CORS_ORIGINS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        try {
          return new URL(s).origin
        } catch {
          return null
        }
      })
      .filter((v): v is string => Boolean(v))

    if (allowedOrigins.length > 0 && !allowedOrigins.includes(url.origin)) {
      return fallback
    }

    return url.toString()
  }

  async start(input: {
    workspaceId: string
    userId: string
    redirectTo?: string
    channelAccountId?: string
  }): Promise<{ url: string }> {
    const { baseUrl, clientId, redirectUrl, scope } = this.getOlxConfig()

    // Quota check applies only to fresh connects. Re-auth flows pass
    // `channelAccountId` (re-binding an existing row) and must always succeed —
    // otherwise a workspace whose limit was lowered below current usage would
    // be unable to refresh tokens on their already-connected accounts.
    if (!input.channelAccountId) {
      const quota = await this.repo.getOlxAccountQuota(input.workspaceId)
      if (quota.current >= quota.max) {
        throw new ForbiddenException(
          `Workspace has ${quota.current} OLX account(s); maximum allowed is ${quota.max}.`,
        )
      }
    }

    const redirectTo = this.normalizeRedirectTo(input.redirectTo)
    const state = randomBytes(32).toString("base64url")

    await this.redis.setJson(
      `oauth:olx:state:${state}`,
      {
        redirectTo,
        workspaceId: input.workspaceId,
        userId: input.userId,
        channelAccountId: input.channelAccountId ?? null,
      } satisfies OlxOauthState,
      OAUTH_STATE_TTL_SECONDS,
    )

    const url = new URL(joinUrl(baseUrl, OLX_OAUTH_AUTHORIZE_PATH))
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("redirect_uri", redirectUrl)
    url.searchParams.set("state", state)
    if (scope.length) url.searchParams.set("scope", scope)

    return { url: url.toString() }
  }

  private async fetchOlxMe(baseUrl: string, accessToken: string): Promise<OlxUserMeResponse | null> {
    const res = await fetch(joinUrl(baseUrl, OLX_USER_INFO_PATH), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        Version: "2.0",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const text = await res.text()
    if (!res.ok) {
      this.logger.warn(
        { status: res.status, body: text.slice(0, 500) },
        "OLX UA /users/me request failed; continuing without profile data",
      )
      return null
    }
    try {
      return JSON.parse(text) as OlxUserMeResponse
    } catch {
      return null
    }
  }

  async callback(input: { code: string; state: string }): Promise<{ redirectTo: string; channelAccountId: string }> {
    const stateKey = `oauth:olx:state:${input.state}`
    const oauthState = await this.redis.getDelJson<OlxOauthState>(stateKey)
    if (!oauthState) {
      throw new BadRequestException("Invalid OAuth state")
    }

    const { baseUrl, clientId, clientSecret, redirectUrl } = this.getOlxConfig()
    const tokenUrl = joinUrl(baseUrl, OLX_OAUTH_TOKEN_PATH)

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUrl,
      }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const tokenText = await tokenRes.text()
    let tokenJson: OlxTokenResponse
    try {
      tokenJson = JSON.parse(tokenText) as OlxTokenResponse
    } catch {
      tokenJson = {}
    }

    if (!tokenRes.ok) {
      this.logger.warn(
        { status: tokenRes.status, body: tokenText.slice(0, 500) },
        "OLX UA token exchange failed",
      )
      throw new BadRequestException("OLX OAuth failed")
    }

    const accessToken = safeString(tokenJson.access_token)
    if (!accessToken) throw new BadRequestException("OLX OAuth failed")

    const me = await this.fetchOlxMe(baseUrl, accessToken)
    const meData = me?.data ?? me
    const externalAccountId = firstString(meData?.id) ?? undefined
    const alias =
      firstString(meData?.name, meData?.email) ??
      `OLX UA ${new Date().toISOString().slice(0, 10)}`

    const authDataEncrypted = await this.crypto.encrypt(oauthState.workspaceId, {
      schemaVersion: 1,
      provider: "OLX",
      workspaceId: oauthState.workspaceId,
      userId: oauthState.userId,
      obtainedAt: new Date().toISOString(),
      accessToken,
      refreshToken: safeString(tokenJson.refresh_token),
      expiresIn: safeNumber(tokenJson.expires_in),
      scope: safeString(tokenJson.scope),
      tokenType: safeString(tokenJson.token_type),
    })

    const channelAccount = await this.repo.upsertOlxOAuthAccount({
      workspaceId: oauthState.workspaceId,
      alias,
      authDataEncrypted,
      ...(oauthState.channelAccountId ? { channelAccountId: oauthState.channelAccountId } : {}),
      ...(externalAccountId ? { externalAccountId } : {}),
    })

    return {
      redirectTo: this.normalizeRedirectTo(oauthState.redirectTo),
      channelAccountId: channelAccount.id,
    }
  }
}
