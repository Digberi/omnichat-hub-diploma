import { describe, expect, it, vi } from "vitest"

import { RekeyOrphanProcessor } from "./rekey-orphan.processor"

function makeFakes(input: {
  orphanDeks: Array<{ id: string; workspaceId: string; version: number }>
  accounts: Record<string, Array<{ id: string; authDataEncrypted: string; workspaceId: string }>>
}) {
  const findManyDek = vi.fn(async ({ where }: any) =>
    input.orphanDeks.filter((d) => where.isActive === false),
  )
  const findManyAccount = vi.fn(async ({ where }: any) => {
    const wsAccounts = input.accounts[where.workspaceId] ?? []
    const versionPrefix = where.authDataEncrypted?.startsWith ?? ""
    return wsAccounts.filter((a) => a.authDataEncrypted.startsWith(versionPrefix))
  })
  const updateAccount = vi.fn(async () => ({}))
  const deleteDek = vi.fn(async () => ({}))

  const prisma: any = {
    channelDek: { findMany: findManyDek, delete: deleteDek },
    channelAccount: { findMany: findManyAccount, update: updateAccount },
  }

  const crypto: any = {
    decrypt: vi.fn(async (_ws: string, ct: string) => ({ token: `dec(${ct})` })),
    encrypt: vi.fn(async (_ws: string, payload: any) => `v1:NEW:iv:tag:${JSON.stringify(payload)}`),
  }

  return { prisma, crypto, findManyDek, findManyAccount, updateAccount, deleteDek }
}

describe("RekeyOrphanProcessor", () => {
  it("re-encrypts each account row referencing an orphan DEK and deletes the orphan", async () => {
    const { prisma, crypto, updateAccount, deleteDek } = makeFakes({
      orphanDeks: [{ id: "dek_old", workspaceId: "ws_1", version: 1 }],
      accounts: {
        ws_1: [
          { id: "acc_1", workspaceId: "ws_1", authDataEncrypted: "v1:1:iv:tag:ct1" },
          { id: "acc_2", workspaceId: "ws_1", authDataEncrypted: "v1:1:iv:tag:ct2" },
        ],
      },
    })

    const processor = new RekeyOrphanProcessor(prisma, crypto)
    await processor.process({ data: {} } as any)

    expect(crypto.decrypt).toHaveBeenCalledTimes(2)
    expect(crypto.encrypt).toHaveBeenCalledTimes(2)
    expect(updateAccount).toHaveBeenCalledTimes(2)
    expect(deleteDek).toHaveBeenCalledWith({ where: { id: "dek_old" } })
  })

  it("does nothing when no orphan DEKs exist", async () => {
    const { prisma, crypto, deleteDek } = makeFakes({ orphanDeks: [], accounts: {} })

    const processor = new RekeyOrphanProcessor(prisma, crypto)
    await processor.process({ data: {} } as any)

    expect(crypto.decrypt).not.toHaveBeenCalled()
    expect(deleteDek).not.toHaveBeenCalled()
  })
})
