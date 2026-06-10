import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { ConfigService } from "@nestjs/config"
import type { Request } from "express"

import type { AccessTokenPayload } from "../types/auth.types"

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>()

    const auth = req.headers.authorization
    if (!auth || !auth.startsWith("Bearer ")) {
      throw new UnauthorizedException()
    }

    const token = auth.slice("Bearer ".length)
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      })
      req.user = payload
      return true
    } catch {
      throw new UnauthorizedException()
    }
  }
}

