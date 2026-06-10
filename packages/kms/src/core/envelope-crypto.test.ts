import { randomBytes } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DekManager } from "./dek-manager"
import { EnvelopeCryptoService } from "./envelope-crypto"
import { CiphertextMalformed, CiphertextTampered, DekVersionMissing } from "./errors"
import { FakeInfisicalKmsClient } from "./fake-kms-client"

function makePrismaMock(initialRows: any[] = []) {
  const rows = [...initialRows]
  const findFirst = vi.fn(async ({ where, orderBy }: any) => {
    const filtered = rows.filter((r) =>
      r.workspaceId === where.workspaceId &&
      (where.isActive === undefined || r.isActive === where.isActive) &&
      (where.version === undefined || r.version === where.version),
    )
    if (orderBy?.version === "desc") filtered.sort((a, b) => b.version - a.version)
    return filtered[0] ?? null
  })
  const create = vi.fn(async ({ data }: any) => {
    const row = { id: `dek_${rows.length + 1}`, ...data }
    rows.push(row)
    return row
  })
  return { rows, prisma: { channelDek: { findFirst, create }, auditLog: { create: vi.fn(async () => ({})) } } as any }
}

describe("EnvelopeCryptoService", () => {
  let kms: FakeInfisicalKmsClient
  let mgr: DekManager
  let svc: EnvelopeCryptoService
  let prisma: any

  beforeEach(() => {
    kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    ;({ prisma } = makePrismaMock())
    mgr = new DekManager({ prisma, kmsClient: kms, clock: () => 1_000_000 })
    svc = new EnvelopeCryptoService({ dekManager: mgr })
  })

  it("encrypt returns v1:<version>:<iv>:<tag>:<ct> format", async () => {
    const ciphertext = await svc.encrypt("ws_1", { token: "abc" })
    expect(ciphertext.split(":")).toHaveLength(5)
    expect(ciphertext.startsWith("v1:1:")).toBe(true)
  })

  it("encrypt → decrypt recovers the original payload", async () => {
    const payload = { token: "abc123", refreshToken: "rrr", expiresIn: 3600 }
    const ciphertext = await svc.encrypt("ws_1", payload)
    const recovered = await svc.decrypt("ws_1", ciphertext)
    expect(recovered).toEqual(payload)
  })

  it("decrypt malformed string throws CiphertextMalformed", async () => {
    await expect(svc.decrypt("ws_1", "not-a-valid-ciphertext")).rejects.toThrow(CiphertextMalformed)
  })

  it("decrypt tampered ciphertext throws CiphertextTampered", async () => {
    const ciphertext = await svc.encrypt("ws_1", { token: "abc" })
    const parts = ciphertext.split(":")
    const tag = Buffer.from(parts[3] ?? "", "base64url")
    tag[0] = (tag[0] ?? 0) ^ 0xff
    const tampered = [parts[0], parts[1], parts[2], tag.toString("base64url"), parts[4]].join(":")
    await expect(svc.decrypt("ws_1", tampered)).rejects.toThrow(CiphertextTampered)
  })

  it("decrypt with version=99 (unknown) throws DekVersionMissing", async () => {
    const ciphertext = await svc.encrypt("ws_1", { token: "abc" })
    const parts = ciphertext.split(":")
    const tampered = [parts[0], "99", parts[2], parts[3], parts[4]].join(":")
    await expect(svc.decrypt("ws_1", tampered)).rejects.toThrow(DekVersionMissing)
  })
})
