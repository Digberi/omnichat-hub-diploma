import { Body, Controller, Get, HttpCode, Post, Query, UseGuards, Version } from "@nestjs/common"
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
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { WorkspaceMembershipGuard } from "../auth/guards/workspace-membership.guard"
import type { AccessTokenPayload } from "../auth/types/auth.types"
import { ListOutboxEventsQueryDto } from "./dto/list-outbox-events.query.dto"
import { RequeueOutboxDto } from "./dto/requeue-outbox.dto"
import { DebugService } from "./debug.service"

@ApiTags("debug")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiNotFoundResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("debug/outbox")
export class DebugController {
  constructor(private readonly debug: DebugService) {}

  @Get("summary")
  @Version("1")
  @ApiOkResponse({ description: "Outbox status counters and backlog summary." })
  async summary(@CurrentUser() user: AccessTokenPayload) {
    return this.debug.getOutboxSummary({ workspaceId: user.wid })
  }

  @Get("events")
  @Version("1")
  @ApiOkResponse({ description: "Latest outbox events for current workspace." })
  async list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListOutboxEventsQueryDto) {
    return this.debug.listOutboxEvents({ workspaceId: user.wid, query })
  }

  @Post("requeue")
  @Version("1")
  @HttpCode(200)
  @ApiOkResponse({ description: "Force requeue outbox rows (dev/staging only)." })
  async requeue(@CurrentUser() user: AccessTokenPayload, @Body() body: RequeueOutboxDto) {
    return this.debug.requeueOutbox({ workspaceId: user.wid, body })
  }
}
