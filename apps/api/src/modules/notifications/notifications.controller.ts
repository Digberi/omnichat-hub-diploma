import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards, Version } from "@nestjs/common"
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { NotificationsService } from "./notifications.service"
import { toDevicePushTokenDto } from "./notifications.mapper"
import { DevicePushTokenDto } from "./dto/device-push-token.dto"
import { RegisterDeviceTokenDto } from "./dto/register-device-token.dto"
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto"
import { NotificationPreferencesDto } from "./dto/notification-preferences.dto"

@ApiTags("notifications")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiNotFoundResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post("device-tokens")
  @Version("1")
  @HttpCode(200)
  @ApiOkResponse({ type: DevicePushTokenDto })
  async registerDeviceToken(@CurrentUser() user: AccessTokenPayload, @Body() body: RegisterDeviceTokenDto) {
    const row = await this.notifications.registerDeviceToken({
      userId: user.sub,
      workspaceId: user.wid,
      platform: body.platform,
      token: body.token,
    })
    return toDevicePushTokenDto(row)
  }

  @Get("preferences")
  @Version("1")
  @ApiOkResponse({ type: NotificationPreferencesDto })
  async getPreferences(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.getPreferences({ workspaceId: user.wid })
  }

  @Patch("preferences")
  @Version("1")
  @ApiOkResponse({ type: NotificationPreferencesDto })
  async updatePreferences(@CurrentUser() user: AccessTokenPayload, @Body() body: UpdateNotificationPreferencesDto) {
    return this.notifications.updatePreferences({ workspaceId: user.wid, ...body })
  }
}
