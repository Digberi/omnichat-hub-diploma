import { Body, Controller, Get, Post, UseGuards, Version } from "@nestjs/common"
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger"
import { Throttle, ThrottlerGuard } from "@nestjs/throttler"

import { StartEmailLoginDto } from "./dto/start-email-login.dto"
import { VerifyEmailLoginDto } from "./dto/verify-email-login.dto"
import { RefreshDto } from "./dto/refresh.dto"
import { StartEmailLoginResponseDto } from "./dto/start-email-login.response.dto"
import { AuthTokensResponseDto } from "./dto/auth-tokens.response.dto"
import { AuthService } from "./auth.service"
import { ApiErrorDto } from "../../common/dto/api-error.dto"
import { JwtAuthGuard } from "./guards/jwt-auth.guard"
import { WorkspaceMembershipGuard } from "./guards/workspace-membership.guard"
import { CurrentUser } from "../../common/decorators/current-user.decorator"
import type { AccessTokenPayload } from "./types/auth.types"
import { AuthMeResponseDto } from "./dto/me.response.dto"
import { LogoutAllResponseDto, LogoutResponseDto } from "./dto/logout.response.dto"

@ApiTags("auth")
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiTooManyRequestsResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("me")
  @Version("1")
  @ApiBearerAuth()
  @ApiForbiddenResponse({ type: ApiErrorDto })
  @ApiOkResponse({ type: AuthMeResponseDto })
  @UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
  async me(@CurrentUser() user: AccessTokenPayload): Promise<AuthMeResponseDto> {
    return this.auth.me({ userId: user.sub, workspaceId: user.wid })
  }

  @Post("start-email-login")
  @Version("1")
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 60 } })
  @ApiCreatedResponse({ type: StartEmailLoginResponseDto })
  async startEmailLogin(@Body() dto: StartEmailLoginDto): Promise<StartEmailLoginResponseDto> {
    return this.auth.startEmailLogin(dto.email)
  }

  @Post("verify-email-login")
  @Version("1")
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 20, ttl: 60 } })
  @ApiCreatedResponse({ type: AuthTokensResponseDto })
  async verifyEmailLogin(@Body() dto: VerifyEmailLoginDto): Promise<AuthTokensResponseDto> {
    return this.auth.verifyEmailLogin(dto.email, dto.code)
  }

  @Post("refresh")
  @Version("1")
  @ApiCreatedResponse({ type: AuthTokensResponseDto })
  async refresh(@Body() dto: RefreshDto): Promise<AuthTokensResponseDto> {
    return this.auth.refresh(dto.refreshToken)
  }

  @Post("logout")
  @Version("1")
  @ApiBearerAuth()
  @ApiForbiddenResponse({ type: ApiErrorDto })
  @ApiOkResponse({ type: LogoutResponseDto })
  @UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
  async logout(@CurrentUser() user: AccessTokenPayload): Promise<LogoutResponseDto> {
    return this.auth.logout(user)
  }

  @Post("logout-all")
  @Version("1")
  @ApiBearerAuth()
  @ApiForbiddenResponse({ type: ApiErrorDto })
  @ApiOkResponse({ type: LogoutAllResponseDto })
  @UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
  async logoutAll(@CurrentUser() user: AccessTokenPayload): Promise<LogoutAllResponseDto> {
    return this.auth.logoutAll(user)
  }
}
