import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards, Version } from "@nestjs/common"
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger"

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { WorkspaceMembershipGuard } from "../auth/guards/workspace-membership.guard"
import { CurrentUser } from "../../common/decorators/current-user.decorator"
import type { AccessTokenPayload } from "../auth/types/auth.types"
import { ApiErrorDto } from "../../common/dto/api-error.dto"
import { ChannelAccountsService } from "./channel-accounts.service"
import { toChannelAccountDto } from "./channel-accounts.mapper"
import { ChannelAccountDto } from "./dto/channel-account.dto"
import { CreateChannelAccountDto } from "./dto/create-channel-account.dto"
import { UpdateChannelAccountAliasDto } from "./dto/update-channel-account-alias.dto"

@ApiTags("channel-accounts")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiNotFoundResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("channel-accounts")
export class ChannelAccountsController {
  constructor(private readonly channelAccounts: ChannelAccountsService) {}

  @Get()
  @Version("1")
  @ApiOkResponse({ type: [ChannelAccountDto] })
  async list(@CurrentUser() user: AccessTokenPayload) {
    const accounts = await this.channelAccounts.list({ workspaceId: user.wid })
    return accounts.map(toChannelAccountDto)
  }

  @Post()
  @Version("1")
  @ApiCreatedResponse({ type: ChannelAccountDto })
  async createStub(@CurrentUser() user: AccessTokenPayload, @Body() body: CreateChannelAccountDto) {
    const account = await this.channelAccounts.createStub({
      workspaceId: user.wid,
      channel: body.channel,
      alias: body.alias,
      ...(body.externalAccountId !== undefined ? { externalAccountId: body.externalAccountId } : {}),
    })
    return toChannelAccountDto(account)
  }

  @Patch(":channelAccountId/alias")
  @Version("1")
  @ApiOkResponse({ type: ChannelAccountDto })
  async updateAlias(
    @CurrentUser() user: AccessTokenPayload,
    @Param("channelAccountId") channelAccountId: string,
    @Body() body: UpdateChannelAccountAliasDto,
  ) {
    const account = await this.channelAccounts.updateAlias({ workspaceId: user.wid, channelAccountId, alias: body.alias })
    return toChannelAccountDto(account)
  }

  @Post(":channelAccountId/disable")
  @Version("1")
  @HttpCode(200)
  @ApiOkResponse({ type: ChannelAccountDto })
  async disable(@CurrentUser() user: AccessTokenPayload, @Param("channelAccountId") channelAccountId: string) {
    const account = await this.channelAccounts.disable({ workspaceId: user.wid, channelAccountId })
    return toChannelAccountDto(account)
  }
}
