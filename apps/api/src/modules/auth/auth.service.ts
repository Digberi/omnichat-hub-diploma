import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto"

import { PrismaService } from "../prisma/prisma.service"
import { EmailService } from "../email/email.service"
import type { AccessTokenPayload } from "./types/auth.types"

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex")
  const bb = Buffer.from(b, "hex")
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
  ) {}

  async me(input: { userId: string; workspaceId: string }): Promise<{
    userId: string
    workspaceId: string
    displayName: string | null
    email: string | null
    role: "OWNER" | "ADMIN" | "MEMBER"
  }> {
    const [user, membership] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: input.userId },
        select: { id: true, displayName: true },
      }),
      this.prisma.membership.findFirst({
        where: { userId: input.userId, workspaceId: input.workspaceId },
        select: { role: true },
      }),
    ])

    // membership should be enforced by guard, but keep it safe in service too
    if (!user || !membership) throw new UnauthorizedException()

    const emailIdentity = await this.prisma.identity.findFirst({
      where: { userId: input.userId, provider: "EMAIL" },
      select: { email: true },
      orderBy: { createdAt: "asc" },
    })

    return {
      userId: user.id,
      workspaceId: input.workspaceId,
      displayName: user.displayName ?? null,
      email: emailIdentity?.email ?? null,
      role: membership.role,
    }
  }

  async startEmailLogin(rawEmail: string): Promise<{ ok: true }> {
    const email = normalizeEmail(rawEmail)
    const fixedCodeRaw = this.config.get<string>("AUTH_OTP_FIXED_CODE")
    const fixedCode = fixedCodeRaw && fixedCodeRaw.trim().length > 0 ? fixedCodeRaw.trim() : undefined
    const code = fixedCode ?? String(randomInt(0, 1_000_000)).padStart(6, "0")

    const pepper = this.config.getOrThrow<string>("AUTH_OTP_PEPPER")
    const codeHash = sha256Hex(`${email}:${code}:${pepper}`)

    const ttlMin = this.config.get<number>("AUTH_OTP_TTL_MIN") ?? 10
    const expiresAt = new Date(Date.now() + ttlMin * 60_000)

    const otp = await this.prisma.emailOtp.create({
      data: {
        email,
        codeHash,
        expiresAt,
      },
    })

    try {
      await this.email.sendAuthOtp({
        to: email,
        code,
        ttlMin,
        idempotencyKey: `auth-otp/${otp.id}`,
      })
    } catch (error) {
      await this.prisma.emailOtp.delete({ where: { id: otp.id } }).catch(() => undefined)
      throw new ServiceUnavailableException("Failed to deliver OTP email")
    }

    return { ok: true }
  }

  async verifyEmailLogin(rawEmail: string, code: string): Promise<{
    accessToken: string
    refreshToken: string
  }> {
    const email = normalizeEmail(rawEmail)
    const now = new Date()

    const otp = await this.prisma.emailOtp.findFirst({
      where: {
        email,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    })

    if (!otp) {
      throw new UnauthorizedException("OTP expired or not found")
    }

    const maxAttempts = this.config.get<number>("AUTH_OTP_MAX_ATTEMPTS") ?? 5
    if (otp.attempts >= maxAttempts) {
      throw new HttpException("Too many attempts", HttpStatus.TOO_MANY_REQUESTS)
    }

    const pepper = this.config.getOrThrow<string>("AUTH_OTP_PEPPER")
    const expectedHash = sha256Hex(`${email}:${code}:${pepper}`)
    const ok = safeEqualHex(otp.codeHash, expectedHash)

    if (!ok) {
      await this.prisma.emailOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      })
      throw new UnauthorizedException("Invalid code")
    }

    const refreshTtlDays = this.config.get<number>("JWT_REFRESH_TTL_DAYS") ?? 30
    const refreshToken = randomBytes(32).toString("base64url")
    const refreshTokenHash = sha256Hex(`${refreshToken}:${pepper}`)
    const refreshExpiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60_000)

    const accessTtlMin = this.config.get<number>("JWT_ACCESS_TTL_MIN") ?? 15

    const { userId, sessionId, workspaceId } = await this.prisma.$transaction(async (tx) => {
      await tx.emailOtp.update({
        where: { id: otp.id },
        data: { consumedAt: now },
      })

      // Find existing user via identity, or create a new user+workspace.
      const existingIdentity = await tx.identity.findFirst({
        where: {
          provider: "EMAIL",
          providerAccountId: email,
        },
        include: { user: true },
      })

      let userId: string
      let wid: string

      if (existingIdentity) {
        userId = existingIdentity.userId
        wid = existingIdentity.user.defaultWorkspaceId ?? ""
        if (!wid) {
          const ws = await tx.workspace.create({
            data: { name: "Workspace" },
          })
          wid = ws.id
          await tx.membership.create({
            data: { userId, workspaceId: wid, role: "OWNER" },
          })
          await tx.user.update({ where: { id: userId }, data: { defaultWorkspaceId: wid } })
        }
      } else {
        const ws = await tx.workspace.create({
          data: { name: "Workspace" },
        })
        const user = await tx.user.create({
          data: {
            defaultWorkspaceId: ws.id,
            identities: {
              create: {
                provider: "EMAIL",
                providerAccountId: email,
                email,
                emailVerifiedAt: now,
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

      const session = await tx.session.create({
        data: {
          userId,
          refreshTokenHash,
          expiresAt: refreshExpiresAt,
        },
      })

      return { userId, sessionId: session.id, workspaceId: wid }
    })

    if (!workspaceId) {
      throw new BadRequestException("Workspace missing")
    }

    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId, wid: workspaceId } satisfies AccessTokenPayload,
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: `${accessTtlMin}m`,
      },
    )

    return { accessToken, refreshToken }
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const pepper = this.config.getOrThrow<string>("AUTH_OTP_PEPPER")
    const refreshTokenHash = sha256Hex(`${refreshToken}:${pepper}`)
    const now = new Date()

    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: { user: true },
    })

    if (!session) {
      throw new UnauthorizedException()
    }

    const newRefreshToken = randomBytes(32).toString("base64url")
    const newRefreshTokenHash = sha256Hex(`${newRefreshToken}:${pepper}`)
    const refreshTtlDays = this.config.get<number>("JWT_REFRESH_TTL_DAYS") ?? 30
    const refreshExpiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60_000)

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: refreshExpiresAt,
      },
    })

    const accessTtlMin = this.config.get<number>("JWT_ACCESS_TTL_MIN") ?? 15
    const wid = session.user.defaultWorkspaceId ?? ""
    if (!wid) throw new BadRequestException("Workspace missing")
    const accessToken = await this.jwt.signAsync(
      { sub: session.userId, sid: session.id, wid },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: `${accessTtlMin}m`,
      },
    )

    return { accessToken, refreshToken: newRefreshToken }
  }

  async logout(payload: AccessTokenPayload): Promise<{ ok: true }> {
    const now = new Date()
    await this.prisma.session.updateMany({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null },
      data: { revokedAt: now },
    })
    return { ok: true }
  }

  async logoutAll(payload: AccessTokenPayload): Promise<{ ok: true; revoked: number }> {
    const now = new Date()
    const res = await this.prisma.session.updateMany({
      where: { userId: payload.sub, revokedAt: null },
      data: { revokedAt: now },
    })
    return { ok: true, revoked: res.count }
  }
}
