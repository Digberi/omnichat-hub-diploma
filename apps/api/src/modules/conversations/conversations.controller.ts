import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, Version } from "@nestjs/common"
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger"

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { WorkspaceMembershipGuard } from "../auth/guards/workspace-membership.guard"
import { CurrentUser } from "../../common/decorators/current-user.decorator"
import type { AccessTokenPayload } from "../auth/types/auth.types"
import { ListConversationsQueryDto } from "./dto/list-conversations.dto"
import { ConversationsService } from "./conversations.service"
import { ArchiveConversationDto } from "./dto/archive-conversation.dto"
import { SnoozeConversationDto } from "./dto/snooze-conversation.dto"
import { ListConversationsResponseDto } from "./dto/list-conversations.response.dto"
import { ConversationDto } from "./dto/conversation.dto"
import { ConversationDetailsDto } from "./dto/conversation-details.dto"
import { SetConversationStatusDto } from "./dto/set-conversation-status.dto"
import { SetConversationTagsDto } from "./dto/set-conversation-tags.dto"
import { ApiErrorDto } from "../../common/dto/api-error.dto"
import { UpdateConversationMetaDto } from "./dto/update-conversation-meta.dto"

@ApiTags("conversations")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiNotFoundResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("conversations")
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @Version("1")
  @ApiOkResponse({ type: ListConversationsResponseDto })
  async list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListConversationsQueryDto) {
    return this.conversations.list({
      workspaceId: user.wid,
      ...(query.folder !== undefined ? { folder: query.folder } : {}),
      ...(query.channel !== undefined ? { channel: query.channel } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    })
  }

  @Get(":conversationId")
  @Version("1")
  @ApiOkResponse({ type: ConversationDetailsDto })
  async get(@CurrentUser() user: AccessTokenPayload, @Param("conversationId") conversationId: string) {
    return this.conversations.get({ workspaceId: user.wid, conversationId })
  }

  @Post(":conversationId/pin")
  @Version("1")
  @ApiCreatedResponse({ type: ConversationDto })
  async pin(@CurrentUser() user: AccessTokenPayload, @Param("conversationId") conversationId: string) {
    return this.conversations.pin({ workspaceId: user.wid, conversationId })
  }

  @Post(":conversationId/unpin")
  @Version("1")
  @ApiCreatedResponse({ type: ConversationDto })
  async unpin(@CurrentUser() user: AccessTokenPayload, @Param("conversationId") conversationId: string) {
    return this.conversations.unpin({ workspaceId: user.wid, conversationId })
  }

  // Marks the upstream channel's notion of this thread as read. Currently
  // only OLX supports the call (POST /api/partner/threads/{id}/commands
  // with command="mark-as-read"). Rozetka / Prom no-op gracefully.
  // Does NOT change Conversation.needsReply — that follows the product
  // rule "operator opening a chat keeps the needs-reply marker".
  @Post(":conversationId/mark-read")
  @Version("1")
  async markRead(@CurrentUser() user: AccessTokenPayload, @Param("conversationId") conversationId: string) {
    return this.conversations.markReadUpstream({ workspaceId: user.wid, conversationId })
  }

  @Post(":conversationId/archive")
  @Version("1")
  @ApiCreatedResponse({ type: ConversationDto })
  async archive(
    @CurrentUser() user: AccessTokenPayload,
    @Param("conversationId") conversationId: string,
    @Body() body: ArchiveConversationDto,
  ) {
    return this.conversations.archive({
      workspaceId: user.wid,
      conversationId,
      confirmUnpin: body.confirmUnpin === true,
    })
  }

  @Post(":conversationId/unarchive")
  @Version("1")
  @ApiCreatedResponse({ type: ConversationDto })
  async unarchive(@CurrentUser() user: AccessTokenPayload, @Param("conversationId") conversationId: string) {
    return this.conversations.unarchive({ workspaceId: user.wid, conversationId })
  }

  @Post(":conversationId/snooze")
  @Version("1")
  @ApiCreatedResponse({ type: ConversationDto })
  async snooze(
    @CurrentUser() user: AccessTokenPayload,
    @Param("conversationId") conversationId: string,
    @Body() body: SnoozeConversationDto,
  ) {
    return this.conversations.snooze({ workspaceId: user.wid, conversationId, untilIso: body.until })
  }

  @Post(":conversationId/unsnooze")
  @Version("1")
  @ApiCreatedResponse({ type: ConversationDto })
  async unsnooze(@CurrentUser() user: AccessTokenPayload, @Param("conversationId") conversationId: string) {
    return this.conversations.unsnooze({ workspaceId: user.wid, conversationId })
  }

  @Post(":conversationId/status")
  @Version("1")
  @ApiCreatedResponse({ type: ConversationDto })
  async setStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param("conversationId") conversationId: string,
    @Body() body: SetConversationStatusDto,
  ) {
    return this.conversations.setStatus({ workspaceId: user.wid, conversationId, statusId: body.statusId })
  }

  @Post(":conversationId/tags")
  @Version("1")
  @ApiCreatedResponse({ type: ConversationDto })
  async setTags(
    @CurrentUser() user: AccessTokenPayload,
    @Param("conversationId") conversationId: string,
    @Body() body: SetConversationTagsDto,
  ) {
    return this.conversations.setTags({ workspaceId: user.wid, conversationId, tagIds: body.tagIds })
  }

  @Patch(":conversationId/meta")
  @Version("1")
  @ApiOkResponse({ type: ConversationDto })
  async updateMeta(
    @CurrentUser() user: AccessTokenPayload,
    @Param("conversationId") conversationId: string,
    @Body() body: UpdateConversationMetaDto,
  ) {
    return this.conversations.updateMeta({
      workspaceId: user.wid,
      conversationId,
      ...(body.paymentStatus !== undefined ? { paymentStatus: body.paymentStatus } : {}),
      ...(body.shippingStatus !== undefined ? { shippingStatus: body.shippingStatus } : {}),
      ...(body.ttn !== undefined ? { ttn: body.ttn } : {}),
      ...(body.orderAmount !== undefined ? { orderAmount: body.orderAmount } : {}),
      ...(body.sellerNote !== undefined ? { sellerNote: body.sellerNote } : {}),
      ...(body.followUpAt !== undefined ? { followUpAt: body.followUpAt } : {}),
    })
  }
}
