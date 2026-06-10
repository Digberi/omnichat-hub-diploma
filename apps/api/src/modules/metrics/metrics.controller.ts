import { Controller, Get, UseGuards, Version } from "@nestjs/common"
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

import { CurrentUser } from "../../common/decorators/current-user.decorator"
import { ApiErrorDto } from "../../common/dto/api-error.dto"
import type { AccessTokenPayload } from "../auth/types/auth.types"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { WorkspaceMembershipGuard } from "../auth/guards/workspace-membership.guard"
import { InboxMetricsDto } from "./dto/inbox-metrics.dto"
import { StorageMetricsDto } from "./dto/storage-metrics.dto"
import { StorageHealthDto } from "./dto/storage-health.dto"
import { MetricsService } from "./metrics.service"

@ApiTags("metrics")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiNotFoundResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get("inbox")
  @Version("1")
  @ApiOkResponse({ type: InboxMetricsDto })
  async inbox(@CurrentUser() user: AccessTokenPayload): Promise<InboxMetricsDto> {
    return this.metrics.getInboxMetrics({ workspaceId: user.wid })
  }

  @Get("storage")
  @Version("1")
  @ApiOkResponse({ type: StorageMetricsDto })
  async storage(): Promise<StorageMetricsDto> {
    return this.metrics.getStorageMetrics()
  }

  @Get("storage/health")
  @Version("1")
  @ApiOkResponse({ type: StorageHealthDto })
  async storageHealth(): Promise<StorageHealthDto> {
    return this.metrics.getStorageHealth()
  }
}
