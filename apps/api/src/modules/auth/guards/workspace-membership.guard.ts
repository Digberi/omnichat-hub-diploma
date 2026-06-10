import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common"
import type { Request } from "express"

import { PrismaService } from "../../prisma/prisma.service"
import type { AccessTokenPayload } from "../types/auth.types"

@Injectable()
export class WorkspaceMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>()
    const user = req.user
    if (!user) throw new UnauthorizedException()

    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: user.sub,
        workspaceId: user.wid,
      },
      select: { id: true },
    })

    if (!membership) {
      throw new ForbiddenException("Workspace access denied")
    }

    return true
  }
}

