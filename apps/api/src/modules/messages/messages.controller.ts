import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors, Version } from "@nestjs/common"
import { ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiForbiddenResponse, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger"
import { FileInterceptor } from "@nestjs/platform-express"
import { memoryStorage } from "multer"

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { WorkspaceMembershipGuard } from "../auth/guards/workspace-membership.guard"
import { CurrentUser } from "../../common/decorators/current-user.decorator"
import type { AccessTokenPayload } from "../auth/types/auth.types"
import { MessagesService } from "./messages.service"
import { ListMessagesQueryDto } from "./dto/list-messages.dto"
import { SendTextDto } from "./dto/send-text.dto"
import { SendAttachmentDto } from "./dto/send-attachment.dto"
import { ListMessagesResponseDto } from "./dto/list-messages.response.dto"
import { MessageDto } from "./dto/message.dto"
import { AroundMessagesQueryDto, AroundMessagesResponseDto } from "./dto/around-messages.dto"
import { UpdateMessageDeliveryDto } from "./dto/update-message-delivery.dto"
import { ApiErrorDto } from "../../common/dto/api-error.dto"
import { toMessageDto } from "./messages.mapper"

@ApiTags("messages")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiNotFoundResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get("conversations/:conversationId/messages")
  @Version("1")
  @ApiOkResponse({ type: ListMessagesResponseDto })
  async list(
    @CurrentUser() user: AccessTokenPayload,
    @Param("conversationId") conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    const res = await this.messages.list({
      workspaceId: user.wid,
      conversationId,
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    })

    return {
      ...res,
      items: res.items.map(toMessageDto),
    }
  }

  @Get("conversations/:conversationId/messages/around/:messageId")
  @Version("1")
  @ApiOkResponse({ type: AroundMessagesResponseDto })
  async around(
    @CurrentUser() user: AccessTokenPayload,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Query() query: AroundMessagesQueryDto,
  ) {
    const res = await this.messages.around({
      workspaceId: user.wid,
      conversationId,
      messageId,
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    })

    return {
      ...res,
      items: res.items.map(toMessageDto),
    }
  }

  @Post("conversations/:conversationId/messages")
  @Version("1")
  @ApiCreatedResponse({ type: MessageDto })
  async sendText(
    @CurrentUser() user: AccessTokenPayload,
    @Param("conversationId") conversationId: string,
    @Body() body: SendTextDto,
  ) {
    const message = await this.messages.sendText({
      workspaceId: user.wid,
      conversationId,
      clientMessageId: body.clientMessageId,
      text: body.text,
    })
    return toMessageDto(message)
  }

  @Post("conversations/:conversationId/messages/attachment")
  @Version("1")
  @ApiConsumes("multipart/form-data")
  @ApiCreatedResponse({ type: MessageDto })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        clientMessageId: { type: "string" },
        file: { type: "string", format: "binary" },
      },
      required: ["clientMessageId", "file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async sendAttachment(
    @CurrentUser() user: AccessTokenPayload,
    @Param("conversationId") conversationId: string,
    @Body() body: SendAttachmentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("file is required")

    const message = await this.messages.sendAttachment({
      workspaceId: user.wid,
      conversationId,
      clientMessageId: body.clientMessageId,
      file: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        buffer: file.buffer,
      },
    })
    return toMessageDto(message)
  }

  @Patch("messages/:messageId")
  @Version("1")
  @ApiOkResponse({ type: MessageDto })
  async updateDeliveryStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param("messageId") messageId: string,
    @Body() body: UpdateMessageDeliveryDto,
  ) {
    const message = await this.messages.updateDeliveryStatus({
      workspaceId: user.wid,
      messageId,
      deliveryStatus: body.deliveryStatus,
      ...(body.errorCode !== undefined ? { errorCode: body.errorCode } : {}),
      ...(body.errorMessage !== undefined ? { errorMessage: body.errorMessage } : {}),
    })
    return toMessageDto(message)
  }

  @Post("messages/:messageId/retry")
  @Version("1")
  @ApiCreatedResponse({ type: MessageDto })
  async retry(@CurrentUser() user: AccessTokenPayload, @Param("messageId") messageId: string) {
    const message = await this.messages.retry({
      workspaceId: user.wid,
      messageId,
    })
    return toMessageDto(message)
  }
}
