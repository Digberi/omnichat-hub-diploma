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
import { TagsService } from "./tags.service"
import { CreateTagDto } from "./dto/create-tag.dto"
import { TagDto } from "./dto/tag.dto"
import { UpdateTagDto } from "./dto/update-tag.dto"

@ApiTags("tags")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiNotFoundResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("tags")
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @Version("1")
  @ApiOkResponse({ type: [TagDto] })
  async list(@CurrentUser() user: AccessTokenPayload): Promise<TagDto[]> {
    const tags = await this.tags.list({ workspaceId: user.wid })
    return tags.map((t) => ({ id: t.id, name: t.name, color: t.color, icon: t.icon }))
  }

  @Post()
  @Version("1")
  @ApiCreatedResponse({ type: TagDto })
  async create(@CurrentUser() user: AccessTokenPayload, @Body() body: CreateTagDto): Promise<TagDto> {
    const tag = await this.tags.create({ workspaceId: user.wid, name: body.name, color: body.color, icon: body.icon })
    return { id: tag.id, name: tag.name, color: tag.color, icon: tag.icon }
  }

  @Patch(":tagId")
  @Version("1")
  @ApiOkResponse({ type: TagDto })
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param("tagId") tagId: string,
    @Body() body: UpdateTagDto,
  ): Promise<TagDto> {
    const tag = await this.tags.update({
      workspaceId: user.wid,
      tagId,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.icon !== undefined ? { icon: body.icon } : {}),
    })
    return { id: tag.id, name: tag.name, color: tag.color, icon: tag.icon }
  }

  @Delete(":tagId")
  @Version("1")
  @ApiOkResponse({ type: OkResponseDto })
  async remove(@CurrentUser() user: AccessTokenPayload, @Param("tagId") tagId: string): Promise<OkResponseDto> {
    return this.tags.remove({ workspaceId: user.wid, tagId })
  }
}
