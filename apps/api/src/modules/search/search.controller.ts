import { Controller, Get, Query, UseGuards, Version } from "@nestjs/common"
import { ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiInternalServerErrorResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger"

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { WorkspaceMembershipGuard } from "../auth/guards/workspace-membership.guard"
import { CurrentUser } from "../../common/decorators/current-user.decorator"
import type { AccessTokenPayload } from "../auth/types/auth.types"
import { SearchQueryDto } from "./dto/search-query.dto"
import { SearchResponseDto } from "./dto/search-response.dto"
import { SearchService } from "./search.service"
import { ApiErrorDto } from "../../common/dto/api-error.dto"

@ApiTags("search")
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorDto })
@ApiUnauthorizedResponse({ type: ApiErrorDto })
@ApiForbiddenResponse({ type: ApiErrorDto })
@ApiInternalServerErrorResponse({ type: ApiErrorDto })
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @Version("1")
  @ApiOkResponse({ type: SearchResponseDto })
  async query(@CurrentUser() user: AccessTokenPayload, @Query() q: SearchQueryDto): Promise<SearchResponseDto> {
    const showOlder = q.showOlder === "1" || q.showOlder === "true"
    return this.search.query({
      workspaceId: user.wid,
      query: q.query,
      showOlder,
      limit: q.limit ?? 20,
    })
  }
}
