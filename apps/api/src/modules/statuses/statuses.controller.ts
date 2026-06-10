import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Version } from "@nestjs/common"
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
import { OkResponseDto } from "../../common/dto/ok.dto"
import { StatusesService } from "./statuses.service"
import { CreateStatusDto } from "./dto/create-status.dto"
import { StatusDto } from "./dto/status.dto"
import { UpdateStatusDto } from "./dto/update-status.dto"

@ApiTags("statuses")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiNotFoundResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("statuses")
export class StatusesController {
  constructor(private readonly statuses: StatusesService) {}

  @Get()
  @Version("1")
  @ApiOkResponse({ type: [StatusDto] })
  async list(@CurrentUser() user: AccessTokenPayload): Promise<StatusDto[]> {
    const statuses = await this.statuses.list({ workspaceId: user.wid })
    return statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, icon: s.icon, sortOrder: s.sortOrder }))
  }

  @Post()
  @Version("1")
  @ApiCreatedResponse({ type: StatusDto })
  async create(@CurrentUser() user: AccessTokenPayload, @Body() body: CreateStatusDto): Promise<StatusDto> {
    const status = await this.statuses.create({
      workspaceId: user.wid,
      name: body.name,
      color: body.color,
      icon: body.icon,
      sortOrder: body.sortOrder,
    })
    return { id: status.id, name: status.name, color: status.color, icon: status.icon, sortOrder: status.sortOrder }
  }

  @Patch(":statusId")
  @Version("1")
  @ApiOkResponse({ type: StatusDto })
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param("statusId") statusId: string,
    @Body() body: UpdateStatusDto,
  ): Promise<StatusDto> {
    const status = await this.statuses.update({
      workspaceId: user.wid,
      statusId,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.icon !== undefined ? { icon: body.icon } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    })
    return { id: status.id, name: status.name, color: status.color, icon: status.icon, sortOrder: status.sortOrder }
  }

  @Delete(":statusId")
  @Version("1")
  @ApiOkResponse({ type: OkResponseDto })
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param("statusId") statusId: string,
  ): Promise<OkResponseDto> {
    return this.statuses.remove({ workspaceId: user.wid, statusId })
  }
}
