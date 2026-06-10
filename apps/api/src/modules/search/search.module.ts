import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { SearchController } from "./search.controller"
import { SearchService } from "./search.service"
import { SearchRepository } from "./search.repository"

@Module({
  imports: [AuthModule],
  controllers: [SearchController],
  providers: [SearchService, SearchRepository],
  exports: [SearchService],
})
export class SearchModule {}

