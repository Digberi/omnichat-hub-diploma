import { Controller, Get, Query, Res, UseGuards, Version } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { Response } from "express"
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger"

import { CurrentUser } from "../../common/decorators/current-user.decorator"
import { ApiErrorDto } from "../../common/dto/api-error.dto"
import type { AccessTokenPayload } from "../auth/types/auth.types"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { WorkspaceMembershipGuard } from "../auth/guards/workspace-membership.guard"
import { OlxAuthUrlResponseDto, OlxStartQueryDto } from "./dto/olx-start.dto"
import { OlxOauthService } from "./olx-oauth.service"

@ApiTags("channel-accounts")
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@Controller("channel-accounts/olx")
export class OlxOauthController {
  constructor(
    private readonly olx: OlxOauthService,
    private readonly config: ConfigService,
  ) {}

  @Get("start")
  @Version("1")
  @UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ type: ApiErrorDto })
  @ApiForbiddenResponse({ type: ApiErrorDto })
  @ApiOkResponse({ type: OlxAuthUrlResponseDto })
  async start(@CurrentUser() user: AccessTokenPayload, @Query() query: OlxStartQueryDto): Promise<OlxAuthUrlResponseDto> {
    return this.olx.start({
      workspaceId: user.wid,
      userId: user.sub,
      ...(query.redirectTo !== undefined ? { redirectTo: query.redirectTo } : {}),
      ...(query.channelAccountId !== undefined ? { channelAccountId: query.channelAccountId } : {}),
    })
  }

  @Get("callback")
  @Version("1")
  @ApiExcludeEndpoint()
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Query("error_description") errorDescription: string | undefined,
    @Res() res: Response,
  ) {
    const redirectBase = (() => {
      const raw = String(this.config.get<string>("PUBLIC_WEB_URL") ?? "").trim() || "http://localhost:3000"
      try {
        const u = new URL(raw)
        u.pathname = "/settings"
        return u.toString()
      } catch {
        return "http://localhost:3000/settings"
      }
    })()

    const redirectWithError = (message: string) => {
      const u = new URL(redirectBase)
      u.searchParams.set("oauth", "olx")
      u.searchParams.set("error", message)
      res.redirect(302, u.toString())
    }

    if (error) {
      redirectWithError(errorDescription ? `${error}: ${errorDescription}` : error)
      return
    }

    if (!code || !state) {
      redirectWithError("missing code/state")
      return
    }

    try {
      const out = await this.olx.callback({ code, state })
      const u = new URL(out.redirectTo)
      u.searchParams.set("oauth", "olx")
      u.searchParams.set("status", "linked")
      u.searchParams.set("channelAccountId", out.channelAccountId)
      res.redirect(302, u.toString())
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "oauth failed"
      redirectWithError(msg.slice(0, 160))
    }
  }
}
