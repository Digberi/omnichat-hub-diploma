import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"
import { createHash, randomBytes } from "crypto"
import { PinoLogger } from "nestjs-pino"

import { PrismaService } from "../prisma/prisma.service"
import { RedisService } from "../redis/redis.service"
import type { AccessTokenPayload } from "./types/auth.types"

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s.length ? s : null
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

type GoogleTokenResponse = {
  access_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
  id_token?: string
  refresh_token?: string
  error?: string
  error_description?: string
}

type GoogleUserInfo = {
  sub?: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}

type GoogleOauthState = {
  redirectTo: string
}

type OauthExchangePayload = {
  accessToken: string
  refreshToken: string
}

@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly logger: PinoLogger,
  ) {}

  private getGoogleConfig(): { clientId: string; clientSecret: string; callbackUrl: string } {
    const clientId = String(this.config.get<string>("GOOGLE_CLIENT_ID") ?? "").trim()
    const clientSecret = String(this.config.get<string>("GOOGLE_CLIENT_SECRET") ?? "").trim()
    const callbackUrl = String(this.config.get<string>("GOOGLE_CALLBACK_URL") ?? "").trim()
    if (!clientId || !clientSecret || !callbackUrl) {
      throw new BadRequestException("Google OAuth is disabled. Configure GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_CALLBACK_URL.")
    }
    return { clientId, clientSecret, callbackUrl }
  }

  private defaultRedirectTo(): string {
    const publicWebUrl = String(this.config.get<string>("PUBLIC_WEB_URL") ?? "").trim()
    if (!publicWebUrl) return "http://localhost:3000/login"
    try {
      const u = new URL(publicWebUrl)
      u.pathname = "/login"
      return u.toString()
    } catch {
      return "http://localhost:3000/login"
    }
  }

  private normalizeRedirectTo(raw: string | undefined): string {
    const candidate = safeString(raw)
    const fallback = this.defaultRedirectTo()
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

  async start(input: { redirectTo?: string }): Promise<{ url: string }> {
    const { clientId, callbackUrl } = this.getGoogleConfig()

    const redirectTo = this.normalizeRedirectTo(input.redirectTo)
    const state = randomBytes(32).toString("base64url")

    await this.redis.setJson(`oauth:google:state:${state}`, { redirectTo } satisfies GoogleOauthState, 10 * 60)

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("redirect_uri", callbackUrl)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", "openid email profile")
    url.searchParams.set("state", state)
    url.searchParams.set("prompt", "select_account")

    return { url: url.toString() }
  }

  async callback(input: { code: string; state: string }): Promise<{ redirectTo: string; exchangeCode: string }> {
    const stateKey = `oauth:google:state:${input.state}`
    const state = await this.redis.getDelJson<GoogleOauthState>(stateKey)
    const redirectTo = this.normalizeRedirectTo(state?.redirectTo)

    if (!state?.redirectTo) {
      throw new BadRequestException("Invalid OAuth state")
    }

    const { clientId, clientSecret, callbackUrl } = this.getGoogleConfig()

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    })

    const tokenText = await tokenRes.text()
    let tokenJson: GoogleTokenResponse
    try {
      tokenJson = JSON.parse(tokenText) as GoogleTokenResponse
    } catch {
      tokenJson = {}
    }

    if (!tokenRes.ok) {
      this.logger.warn(
        { status: tokenRes.status, body: tokenText.slice(0, 500) },
        "Google OAuth token exchange failed",
      )
      throw new BadRequestException("Google OAuth failed")
    }

    const accessToken = safeString(tokenJson.access_token)
    if (!accessToken) {
      throw new BadRequestException("Google OAuth failed")
    }

    const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    })

    const userInfoText = await userInfoRes.text()
    let userInfo: GoogleUserInfo
    try {
      userInfo = JSON.parse(userInfoText) as GoogleUserInfo
    } catch {
      userInfo = {}
    }

    if (!userInfoRes.ok) {
      this.logger.warn(
        { status: userInfoRes.status, body: userInfoText.slice(0, 500) },
        "Google OAuth userinfo failed",
      )
      throw new BadRequestException("Google OAuth failed")
    }

    const sub = safeString(userInfo.sub)
    if (!sub) throw new BadRequestException("Google OAuth failed")

    const email = userInfo.email ? normalizeEmail(userInfo.email) : null
    const emailVerified = Boolean(userInfo.email_verified)
    const name = safeString(userInfo.name)

    const now = new Date()
    const pepper = this.config.getOrThrow<string>("AUTH_OTP_PEPPER")

    const refreshTtlDays = this.config.get<number>("JWT_REFRESH_TTL_DAYS") ?? 30
    const refreshToken = randomBytes(32).toString("base64url")
    const refreshTokenHash = sha256Hex(`${refreshToken}:${pepper}`)
    const refreshExpiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60_000)

    const accessTtlMin = this.config.get<number>("JWT_ACCESS_TTL_MIN") ?? 15

    const { userId, sessionId, workspaceId } = await this.prisma.$transaction(async (tx) => {
      const existingGoogle = await tx.identity.findFirst({
        where: { provider: "GOOGLE", providerAccountId: sub },
        include: { user: true },
      })

      let userId: string
      let wid: string

      if (existingGoogle) {
        userId = existingGoogle.userId
        wid = existingGoogle.user.defaultWorkspaceId ?? ""
        if (!wid) {
          const ws = await tx.workspace.create({ data: { name: "Workspace" } })
          wid = ws.id
          await tx.membership.create({ data: { userId, workspaceId: wid, role: "OWNER" } })
          await tx.user.update({ where: { id: userId }, data: { defaultWorkspaceId: wid } })
        }
      } else {
        const existingEmail = email
          ? await tx.identity.findFirst({
              where: {
                provider: "EMAIL",
                providerAccountId: email,
                emailVerifiedAt: { not: null },
              },
              include: { user: true },
            })
          : null

        if (existingEmail) {
          userId = existingEmail.userId
          wid = existingEmail.user.defaultWorkspaceId ?? ""
          if (!wid) {
            const ws = await tx.workspace.create({ data: { name: "Workspace" } })
            wid = ws.id
            await tx.membership.create({ data: { userId, workspaceId: wid, role: "OWNER" } })
            await tx.user.update({ where: { id: userId }, data: { defaultWorkspaceId: wid } })
          }

          await tx.identity.create({
            data: {
              provider: "GOOGLE",
              providerAccountId: sub,
              email: email ?? null,
              emailVerifiedAt: emailVerified ? now : null,
              userId,
            },
          })

          if (name) {
            await tx.user.update({
              where: { id: userId },
              data: { displayName: existingEmail.user.displayName ?? name },
            })
          }
        } else {
          const ws = await tx.workspace.create({ data: { name: "Workspace" } })
          const user = await tx.user.create({
            data: {
              defaultWorkspaceId: ws.id,
              displayName: name ?? null,
              identities: {
                create: {
                  provider: "GOOGLE",
                  providerAccountId: sub,
                  email: email ?? null,
                  emailVerifiedAt: emailVerified ? now : null,
                },
              },
              memberships: {
                create: { workspaceId: ws.id, role: "OWNER" },
              },
            },
          })
          userId = user.id
          wid = ws.id
        }
      }

      // Ensure membership exists.
      await tx.membership.upsert({
        where: { workspaceId_userId: { workspaceId: wid, userId } },
        update: {},
        create: { workspaceId: wid, userId, role: "MEMBER" },
      })

      const session = await tx.session.create({
        data: {
          userId,
          refreshTokenHash,
          expiresAt: refreshExpiresAt,
        },
      })

      return { userId, sessionId: session.id, workspaceId: wid }
    })

    if (!workspaceId) throw new UnauthorizedException()

    const apiAccessToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId, wid: workspaceId } satisfies AccessTokenPayload,
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: `${accessTtlMin}m`,
      },
    )

    const exchangeCode = randomBytes(16).toString("base64url")
    await this.redis.setJson(
      `oauth:exchange:${exchangeCode}`,
      { accessToken: apiAccessToken, refreshToken } satisfies OauthExchangePayload,
      2 * 60,
    )

    return { redirectTo, exchangeCode }
  }

  async exchange(code: string): Promise<OauthExchangePayload> {
    const payload = await this.redis.getDelJson<OauthExchangePayload>(`oauth:exchange:${code}`)
    if (!payload?.accessToken || !payload?.refreshToken) {
      throw new UnauthorizedException()
    }
    return payload
  }
}
