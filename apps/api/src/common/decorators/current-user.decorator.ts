import { createParamDecorator, type ExecutionContext } from "@nestjs/common"
import type { Request } from "express"

import type { AccessTokenPayload } from "../../modules/auth/types/auth.types"

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>()
  return req.user
})

