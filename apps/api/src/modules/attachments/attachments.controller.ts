import { Controller, Param, Post, UseGuards, Version } from "@nestjs/common"
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger"

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { WorkspaceMembershipGuard } from "../auth/guards/workspace-membership.guard"
import { CurrentUser } from "../../common/decorators/current-user.decorator"
import type { AccessTokenPayload } from "../auth/types/auth.types"
import { AttachmentsService } from "./attachments.service"
import { ApiErrorDto } from "../../common/dto/api-error.dto"
import { CreateShortLinkResponseDto } from "./dto/create-short-link.response.dto"

@ApiTags("attachments")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiNotFoundResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("attachments")
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post(":attachmentId/short-link")
  @Version("1")
  @ApiCreatedResponse({ type: CreateShortLinkResponseDto })
  async createShortLink(@CurrentUser() user: AccessTokenPayload, @Param("attachmentId") attachmentId: string) {
    return this.attachments.createShortLink({ workspaceId: user.wid, attachmentId })
  }
}
