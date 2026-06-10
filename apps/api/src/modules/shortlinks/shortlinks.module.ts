import { Module } from "@nestjs/common"

import { ShortLinksController } from "./shortlinks.controller"
import { ShortLinksService } from "./shortlinks.service"
import { ShortLinksRepository } from "./shortlinks.repository"

@Module({
  controllers: [ShortLinksController],
  providers: [ShortLinksService, ShortLinksRepository],
})
export class ShortLinksModule {}

