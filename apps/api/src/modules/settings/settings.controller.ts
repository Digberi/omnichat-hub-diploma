import { Body, Controller, Get, Patch, UseGuards, Version } from "@nestjs/common"
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger"

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { WorkspaceMembershipGuard } from "../auth/guards/workspace-membership.guard"
import { CurrentUser } from "../../common/decorators/current-user.decorator"
import type { AccessTokenPayload } from "../auth/types/auth.types"
import { ApiErrorDto } from "../../common/dto/api-error.dto"
import { SettingsService } from "./settings.service"
import { UpdateSettingsDto } from "./dto/update-settings.dto"
import { WorkspaceSettingsDto } from "./dto/workspace-settings.dto"

@ApiTags("settings")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Version("1")
  @ApiOkResponse({ type: WorkspaceSettingsDto })
  async get(@CurrentUser() user: AccessTokenPayload) {
    return this.settings.get({ workspaceId: user.wid })
  }

  @Patch()
  @Version("1")
  @ApiOkResponse({ type: WorkspaceSettingsDto })
  async update(@CurrentUser() user: AccessTokenPayload, @Body() body: UpdateSettingsDto) {
    return this.settings.update({
      workspaceId: user.wid,
      ...body,
    })
  }
}
