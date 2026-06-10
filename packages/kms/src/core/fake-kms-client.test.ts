import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"

import { FakeInfisicalKmsClient } from "./fake-kms-client"

describe("FakeInfisicalKmsClient", () => {
  it("wrap → unwrap round-trip recovers the DEK", async () => {
    const client = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const dek = randomBytes(32)

    const wrapped = await client.wrapDek(dek)
    expect(wrapped.kekKeyId).toBe("kek_fake_1")

    const recovered = await client.unwrapDek(wrapped.encryptedDek, wrapped.kekKeyId)
    expect(recovered.equals(dek)).toBe(true)
  })

  it("unwrapping with a different kekKeyId throws", async () => {
    const client = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1" })
    const wrapped = await client.wrapDek(randomBytes(32))

    await expect(client.unwrapDek(wrapped.encryptedDek, "kek_fake_2")).rejects.toThrow()
  })

  it("can be configured to fail wrap N times then succeed (for backoff tests)", async () => {
    const client = new FakeInfisicalKmsClient({ kekKeyId: "kek_fake_1", failWrapTimes: 2 })

    await expect(client.wrapDek(randomBytes(32))).rejects.toThrow(/simulated/i)
    await expect(client.wrapDek(randomBytes(32))).rejects.toThrow(/simulated/i)
    await expect(client.wrapDek(randomBytes(32))).resolves.toBeDefined()
  })
})
