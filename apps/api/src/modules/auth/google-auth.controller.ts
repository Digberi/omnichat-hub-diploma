import { Body, Controller, Get, Post, Query, Res, Version } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { Response } from "express"
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger"

import { ApiErrorDto } from "../../common/dto/api-error.dto"
import { AuthTokensResponseDto } from "./dto/auth-tokens.response.dto"
import { GoogleExchangeDto } from "./dto/google-exchange.dto"
import { GoogleAuthUrlResponseDto, GoogleStartQueryDto } from "./dto/google-start.dto"
import { GoogleAuthService } from "./google-auth.service"

@ApiTags("auth")
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@Controller("auth/google")
export class GoogleAuthController {
  constructor(
    private readonly google: GoogleAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get("start")
  @Version("1")
  @ApiOkResponse({ type: GoogleAuthUrlResponseDto })
  async start(@Query() query: GoogleStartQueryDto): Promise<GoogleAuthUrlResponseDto> {
    return this.google.start({ ...(query.redirectTo !== undefined ? { redirectTo: query.redirectTo } : {}) })
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
    // This endpoint is navigated by the user's browser and should always redirect back to the web app.
    const redirectFallback = (() => {
      const raw = String(this.config.get<string>("PUBLIC_WEB_URL") ?? "").trim() || "http://localhost:3000"
      try {
        const u = new URL(raw)
        u.pathname = "/login"
        return u.toString()
      } catch {
        return "http://localhost:3000/login"
      }      
    })()

    const redirectToBase = redirectFallback

    const redirectWithError = (message: string) => {
      const u = new URL(redirectToBase)
      u.searchParams.set("oauth", "google")
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
      const out = await this.google.callback({ code, state })
      const u = new URL(out.redirectTo)
      u.searchParams.set("oauth", "google")
      u.searchParams.set("code", out.exchangeCode)
      res.redirect(302, u.toString())
    } catch (err: any) {
      // Avoid leaking internal details in redirect; surface a short message for UX.
      const msg = typeof err?.message === "string" ? err.message : "oauth failed"
      redirectWithError(msg.slice(0, 160))
    }
  }

  @Post("exchange")
  @Version("1")
  @ApiCreatedResponse({ type: AuthTokensResponseDto })
  async exchange(@Body() dto: GoogleExchangeDto): Promise<AuthTokensResponseDto> {
    return this.google.exchange(dto.code)
  }
}
