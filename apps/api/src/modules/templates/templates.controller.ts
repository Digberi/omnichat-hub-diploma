import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, Version } from "@nestjs/common"
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
import { TemplatesService } from "./templates.service"
import { CreateTemplateCategoryDto } from "./dto/create-template-category.dto"
import { UpdateTemplateCategoryDto } from "./dto/update-template-category.dto"
import { CreateTemplateDto } from "./dto/create-template.dto"
import { UpdateTemplateDto } from "./dto/update-template.dto"
import { ListTemplatesQueryDto } from "./dto/list-templates-query.dto"
import { TemplateCategoryDto } from "./dto/template-category.dto"
import { TemplateDto } from "./dto/template.dto"

@ApiTags("templates")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiNotFoundResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("templates")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get("categories")
  @Version("1")
  @ApiOkResponse({ type: [TemplateCategoryDto] })
  async listCategories(@CurrentUser() user: AccessTokenPayload) {
    return this.templates.listCategories({ workspaceId: user.wid })
  }

  @Post("categories")
  @Version("1")
  @ApiCreatedResponse({ type: TemplateCategoryDto })
  async createCategory(@CurrentUser() user: AccessTokenPayload, @Body() body: CreateTemplateCategoryDto) {
    return this.templates.createCategory({ workspaceId: user.wid, name: body.name, sortOrder: body.sortOrder })
  }

  @Patch("categories/:categoryId")
  @Version("1")
  @ApiOkResponse({ type: TemplateCategoryDto })
  async updateCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param("categoryId") categoryId: string,
    @Body() body: UpdateTemplateCategoryDto,
  ) {
    return this.templates.updateCategory({
      workspaceId: user.wid,
      categoryId,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    })
  }

  @Delete("categories/:categoryId")
  @Version("1")
  @ApiOkResponse({ type: OkResponseDto })
  async removeCategory(@CurrentUser() user: AccessTokenPayload, @Param("categoryId") categoryId: string) {
    return this.templates.removeCategory({ workspaceId: user.wid, categoryId })
  }

  @Get()
  @Version("1")
  @ApiOkResponse({ type: [TemplateDto] })
  async list(@CurrentUser() user: AccessTokenPayload, @Query() q: ListTemplatesQueryDto) {
    return this.templates.list({
      workspaceId: user.wid,
      ...(q.scope !== undefined ? { scope: q.scope } : {}),
      ...(q.channel !== undefined ? { channel: q.channel } : {}),
      ...(q.categoryId !== undefined ? { categoryId: q.categoryId } : {}),
    })
  }

  @Post()
  @Version("1")
  @ApiCreatedResponse({ type: TemplateDto })
  async create(@CurrentUser() user: AccessTokenPayload, @Body() body: CreateTemplateDto) {
    return this.templates.create({
      workspaceId: user.wid,
      scope: body.scope,
      ...(body.channel !== undefined ? { channel: body.channel } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      title: body.title,
      content: body.content,
    })
  }

  @Patch(":templateId")
  @Version("1")
  @ApiOkResponse({ type: TemplateDto })
  async update(@CurrentUser() user: AccessTokenPayload, @Param("templateId") templateId: string, @Body() body: UpdateTemplateDto) {
    return this.templates.update({
      workspaceId: user.wid,
      templateId,
      ...body,
    })
  }

  @Delete(":templateId")
  @Version("1")
  @ApiOkResponse({ type: OkResponseDto })
  async remove(@CurrentUser() user: AccessTokenPayload, @Param("templateId") templateId: string) {
    return this.templates.remove({ workspaceId: user.wid, templateId })
  }
}
