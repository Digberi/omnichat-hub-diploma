import { Body, Controller, Get, Patch, UseGuards, Version } from "@nestjs/common"
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
import { WorkspacesService } from "./workspaces.service"
import { UpdateWorkspaceDto } from "./dto/update-workspace.dto"
import { WorkspaceDto } from "./dto/workspace.dto"
import { toWorkspaceDto } from "./workspaces.mapper"

@ApiTags("workspaces")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiNotFoundResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get("current")
  @Version("1")
  @ApiOkResponse({ type: WorkspaceDto })
  async getCurrent(@CurrentUser() user: AccessTokenPayload) {
    const ws = await this.workspaces.getCurrent({ workspaceId: user.wid })
    return toWorkspaceDto(ws)
  }

  @Patch("current")
  @Version("1")
  @ApiOkResponse({ type: WorkspaceDto })
  async updateCurrent(@CurrentUser() user: AccessTokenPayload, @Body() body: UpdateWorkspaceDto) {
    const ws = await this.workspaces.updateCurrent({ workspaceId: user.wid, name: body.name })
    return toWorkspaceDto(ws)
  }
}
