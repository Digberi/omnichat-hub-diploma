import { randomBytes } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DekManager } from "./dek-manager"
import { FakeInfisicalKmsClient } from "./fake-kms-client"
import { DekVersionMissing } from "./errors"

function makePrismaMock(initialRows: Array<{
  id: string
  workspaceId: string
  version: number
  encryptedDek: string
  kekKeyId: string
  isActive: boolean
}> = []) {
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
  return {
    rows,
    prisma: { channelDek: { findFirst, create }, auditLog: { create: vi.fn(async () => ({})) } } as any,
    findFirst,
    create,
  }
}

describe("DekManager.getActiveDek", () => {
  let clock = 0
  beforeEach(() => {
    clock = 1_000_000
  })

  it("DB hit on cold cache: SELECT + unwrap + cache populate", async () => {
    const kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const dek = randomBytes(32)
    const wrapped = await kms.wrapDek(dek)
    const { prisma, findFirst } = makePrismaMock([
      { id: "dek_1", workspaceId: "ws_1", version: 1, encryptedDek: wrapped.encryptedDek, kekKeyId: wrapped.kekKeyId, isActive: true },
    ])
    const unwrapSpy = vi.spyOn(kms, "unwrapDek")

    const mgr = new DekManager({ prisma, kmsClient: kms, clock: () => clock })

    const a = await mgr.getActiveDek("ws_1")
    expect(a.version).toBe(1)
    expect(a.dek.equals(dek)).toBe(true)
    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(unwrapSpy).toHaveBeenCalledTimes(1)
  })

  it("cache hit on second call within TTL: no SELECT, no unwrap", async () => {
    const kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const dek = randomBytes(32)
    const wrapped = await kms.wrapDek(dek)
    const { prisma, findFirst } = makePrismaMock([
      { id: "dek_1", workspaceId: "ws_1", version: 1, encryptedDek: wrapped.encryptedDek, kekKeyId: wrapped.kekKeyId, isActive: true },
    ])
    const unwrapSpy = vi.spyOn(kms, "unwrapDek")

    const mgr = new DekManager({ prisma, kmsClient: kms, clock: () => clock })

    await mgr.getActiveDek("ws_1")
    await mgr.getActiveDek("ws_1")

    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(unwrapSpy).toHaveBeenCalledTimes(1)
  })

  it("DEK absent: generates new DEK, wraps, inserts, returns version=1", async () => {
    const kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const { prisma, create } = makePrismaMock([])

    const mgr = new DekManager({ prisma, kmsClient: kms, clock: () => clock })

    const result = await mgr.getActiveDek("ws_1")
    expect(result.version).toBe(1)
    expect(result.dek.length).toBe(32)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      workspaceId: "ws_1",
      version: 1,
      isActive: true,
      kekKeyId: "kek_fake_1",
    })
  })

  it("TTL expires: second call past TTL re-fetches", async () => {
    const kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const dek = randomBytes(32)
    const wrapped = await kms.wrapDek(dek)
    const { prisma, findFirst } = makePrismaMock([
      { id: "dek_1", workspaceId: "ws_1", version: 1, encryptedDek: wrapped.encryptedDek, kekKeyId: wrapped.kekKeyId, isActive: true },
    ])

    const mgr = new DekManager({
      prisma,
      kmsClient: kms,
      clock: () => clock,
      cacheTtlMs: 5_000,
    })

    await mgr.getActiveDek("ws_1")
    clock += 6_000
    await mgr.getActiveDek("ws_1")

    expect(findFirst).toHaveBeenCalledTimes(2)
  })
})

describe("DekManager.rotate", () => {
  it("marks current active=false and inserts version+1 as new active", async () => {
    const kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const dek = randomBytes(32)
    const wrapped = await kms.wrapDek(dek)
    const { prisma, rows } = makePrismaMock([
      { id: "dek_1", workspaceId: "ws_1", version: 1, encryptedDek: wrapped.encryptedDek, kekKeyId: wrapped.kekKeyId, isActive: true },
    ])
    prisma.$transaction = vi.fn(async (cb: any) => cb(prisma))
    prisma.channelDek.updateMany = vi.fn(async ({ where, data }: any) => {
      for (const r of rows) {
        if (r.workspaceId === where.workspaceId && r.isActive === where.isActive) {
          r.isActive = data.isActive
        }
      }
      return { count: 1 }
    })
    const mgr = new DekManager({ prisma, kmsClient: kms, clock: () => 1_000_000 })

    await mgr.rotate("ws_1")

    expect(prisma.channelDek.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws_1", isActive: true },
      data: expect.objectContaining({ isActive: false }),
    })
    const versions = rows.filter((r) => r.workspaceId === "ws_1").map((r) => r.version).sort()
    expect(versions).toEqual([1, 2])
    expect(rows.find((r) => r.version === 1)?.isActive).toBe(false)
    expect(rows.find((r) => r.version === 2)?.isActive).toBe(true)
  })

  it("rotate invalidates cache entries for the workspace", async () => {
    const kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const dek = randomBytes(32)
    const wrapped = await kms.wrapDek(dek)
    const { prisma, rows } = makePrismaMock([
      { id: "dek_1", workspaceId: "ws_1", version: 1, encryptedDek: wrapped.encryptedDek, kekKeyId: wrapped.kekKeyId, isActive: true },
    ])
    prisma.$transaction = vi.fn(async (cb: any) => cb(prisma))
    prisma.channelDek.updateMany = vi.fn(async ({ where, data }: any) => {
      for (const r of rows) {
        if (r.workspaceId === where.workspaceId && r.isActive === where.isActive) r.isActive = data.isActive
      }
      return { count: 1 }
    })
    const mgr = new DekManager({ prisma, kmsClient: kms, clock: () => 1_000_000 })

    await mgr.getActiveDek("ws_1")
    expect((mgr as any).cache.size).toBeGreaterThan(0)

    await mgr.rotate("ws_1")

    for (const key of (mgr as any).cache.keys()) {
      expect(String(key).startsWith("ws_1:")).toBe(false)
    }
  })
})

describe("DekManager audit log", () => {
  it("writes audit log on first DEK creation", async () => {
    const kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const { prisma } = makePrismaMock([])
    const auditCreate = vi.fn(async () => ({}))
    prisma.auditLog = { create: auditCreate }
    const mgr = new DekManager({ prisma, kmsClient: kms, clock: () => 1_000_000 })

    await mgr.getActiveDek("ws_1")

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "ws_1",
        action: "dek.create",
        entityType: "ChannelDek",
        payload: expect.objectContaining({ version: 1, kekKeyId: "kek_fake_1" }),
      }),
    })
  })

  it("writes audit log on rotate", async () => {
    const kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const dek = randomBytes(32)
    const wrapped = await kms.wrapDek(dek)
    const { prisma, rows } = makePrismaMock([
      { id: "dek_1", workspaceId: "ws_1", version: 1, encryptedDek: wrapped.encryptedDek, kekKeyId: wrapped.kekKeyId, isActive: true },
    ])
    prisma.$transaction = vi.fn(async (cb: any) => cb(prisma))
    prisma.channelDek.updateMany = vi.fn(async ({ where, data }: any) => {
      for (const r of rows) if (r.workspaceId === where.workspaceId && r.isActive === where.isActive) r.isActive = data.isActive
      return { count: 1 }
    })
    const auditCreate = vi.fn(async () => ({}))
    prisma.auditLog = { create: auditCreate }
    const mgr = new DekManager({ prisma, kmsClient: kms, clock: () => 1_000_000 })

    await mgr.rotate("ws_1")

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "ws_1",
        action: "dek.rotate",
        payload: expect.objectContaining({ fromVersion: 1, toVersion: 2 }),
      }),
    })
  })

  it("writes audit log when unwrapping a non-active version", async () => {
    const kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const dek = randomBytes(32)
    const wrapped = await kms.wrapDek(dek)
    const { prisma } = makePrismaMock([
      { id: "dek_1", workspaceId: "ws_1", version: 1, encryptedDek: wrapped.encryptedDek, kekKeyId: wrapped.kekKeyId, isActive: false },
    ])
    const auditCreate = vi.fn(async () => ({}))
    prisma.auditLog = { create: auditCreate }
    const mgr = new DekManager({ prisma, kmsClient: kms, clock: () => 1_000_000 })

    await mgr.getDekByVersion("ws_1", 1)

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "ws_1",
        action: "dek.unwrap_legacy_version",
        payload: expect.objectContaining({ version: 1 }),
      }),
    })
  })
})

describe("DekManager.getDekByVersion", () => {
  it("returns the matching DEK regardless of isActive", async () => {
    const kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const old = randomBytes(32)
    const cur = randomBytes(32)
    const wOld = await kms.wrapDek(old)
    const wCur = await kms.wrapDek(cur)
    const { prisma } = makePrismaMock([
      { id: "dek_1", workspaceId: "ws_1", version: 1, encryptedDek: wOld.encryptedDek, kekKeyId: wOld.kekKeyId, isActive: false },
      { id: "dek_2", workspaceId: "ws_1", version: 2, encryptedDek: wCur.encryptedDek, kekKeyId: wCur.kekKeyId, isActive: true },
    ])

    const mgr = new DekManager({ prisma, kmsClient: kms, clock: () => 1_000_000 })

    const v1 = await mgr.getDekByVersion("ws_1", 1)
    const v2 = await mgr.getDekByVersion("ws_1", 2)

    expect(v1.equals(old)).toBe(true)
    expect(v2.equals(cur)).toBe(true)
  })

  it("throws DekVersionMissing if no row matches", async () => {
    const kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const { prisma } = makePrismaMock([])
    const mgr = new DekManager({ prisma, kmsClient: kms, clock: () => 1_000_000 })

    await expect(mgr.getDekByVersion("ws_1", 99)).rejects.toThrow(DekVersionMissing)
  })

  it("cache hit on repeat lookup of same (workspace, version)", async () => {
    const kms = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const dek = randomBytes(32)
    const wrapped = await kms.wrapDek(dek)
    const { prisma, findFirst } = makePrismaMock([
      { id: "dek_1", workspaceId: "ws_1", version: 7, encryptedDek: wrapped.encryptedDek, kekKeyId: wrapped.kekKeyId, isActive: false },
    ])
    const unwrapSpy = vi.spyOn(kms, "unwrapDek")
    const mgr = new DekManager({ prisma, kmsClient: kms, clock: () => 1_000_000 })

    await mgr.getDekByVersion("ws_1", 7)
    await mgr.getDekByVersion("ws_1", 7)

    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(unwrapSpy).toHaveBeenCalledTimes(1)
  })
})
