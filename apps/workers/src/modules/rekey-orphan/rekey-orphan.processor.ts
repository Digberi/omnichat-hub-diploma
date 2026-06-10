import { Processor, WorkerHost } from "@nestjs/bullmq"
import { Inject } from "@nestjs/common"
import type { Job } from "bullmq"
import { ENVELOPE_CRYPTO } from "@omnichat/kms/nest"
import type { EnvelopeCryptoService } from "@omnichat/kms"

import { PrismaService } from "../prisma/prisma.service"

@Processor("rekey-orphan")
export class RekeyOrphanProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCryptoService,
  ) {
    super()
  }

  async process(_job: Job): Promise<void> {
    const orphans = await this.prisma.channelDek.findMany({
      where: { isActive: false },
      orderBy: { rotatedAt: "asc" },
    })
    for (const orphan of orphans) {
      const accounts = await this.prisma.channelAccount.findMany({
        where: {
          workspaceId: orphan.workspaceId,
          authDataEncrypted: { startsWith: `v1:${orphan.version}:` },
        },
        select: { id: true, workspaceId: true, authDataEncrypted: true },
      })
      for (const account of accounts) {
        if (!account.authDataEncrypted) continue
        const payload = await this.crypto.decrypt(account.workspaceId, account.authDataEncrypted)
        const reEncrypted = await this.crypto.encrypt(account.workspaceId, payload)
        await this.prisma.channelAccount.update({
          where: { id: account.id },
          data: { authDataEncrypted: reEncrypted },
        })
      }
      await this.prisma.channelDek.delete({ where: { id: orphan.id } })
    }
  }
}
