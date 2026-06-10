import { Body, Controller, Post, UseGuards, Version } from "@nestjs/common"
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { toChannelAccountDto } from "../channel-accounts/channel-accounts.mapper"
import { ChannelAccountDto } from "../channel-accounts/dto/channel-account.dto"
import { RozetkaConnectDto } from "./dto/rozetka-connect.dto"
import { RozetkaConnectService } from "./rozetka-connect.service"

@ApiTags("channel-accounts")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("channel-accounts/rozetka")
export class RozetkaConnectController {
  constructor(private readonly rozetka: RozetkaConnectService) {}

  @Post("connect")
  @Version("1")
  @ApiOkResponse({ type: ChannelAccountDto })
  async connect(@CurrentUser() user: AccessTokenPayload, @Body() body: RozetkaConnectDto) {
    const account = await this.rozetka.connect({
      workspaceId: user.wid,
      userId: user.sub,
      apiToken: body.apiToken,
      ...(body.alias !== undefined ? { alias: body.alias } : {}),
      ...(body.channelAccountId !== undefined ? { channelAccountId: body.channelAccountId } : {}),
      ...(body.apiBaseUrl !== undefined ? { apiBaseUrl: body.apiBaseUrl } : {}),
    })

    return toChannelAccountDto(account)
  }
}
