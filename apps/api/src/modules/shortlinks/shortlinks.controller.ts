import { Controller, Get, Header, Param, Req, Res, Version } from "@nestjs/common"
import type { Request, Response } from "express"
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger"

import { ShortLinksService } from "./shortlinks.service"

@ApiTags("shortlinks")
@Controller()
export class ShortLinksController {
  constructor(private readonly shortlinks: ShortLinksService) {}

  @Get("s/:token")
  @Version("1")
  @ApiExcludeEndpoint()
  @Header("Cache-Control", "no-store")
  async resolve(@Param("token") token: string, @Req() req: Request, @Res() res: Response) {
    const accept = String(req.headers.accept ?? "")

    const out = await this.shortlinks.resolveToken({ token })
    if (out.kind === "redirect") {
      res.redirect(302, out.url)
      return
    }

    if (accept.includes("application/json")) {
      res.status(out.status).json({
        message: out.message,
        conversationId: out.conversationId ?? null,
      })
      return
    }

    res.status(out.status).type("text/html; charset=utf-8").send(out.html)
  }
}

