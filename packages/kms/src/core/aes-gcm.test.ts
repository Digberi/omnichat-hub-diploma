import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"

import { aesGcmDecrypt, aesGcmEncrypt } from "./aes-gcm"
import { CiphertextTampered } from "./errors"

describe("aes-gcm", () => {
  it("encrypt → decrypt round-trip recovers the plaintext", () => {
    const key = randomBytes(32)
    const plaintext = Buffer.from("hello, world")

    const { iv, tag, ciphertext } = aesGcmEncrypt(key, plaintext)
    expect(iv.length).toBe(12)
    expect(tag.length).toBe(16)

    const recovered = aesGcmDecrypt(key, { iv, tag, ciphertext })
    expect(recovered.toString("utf8")).toBe("hello, world")
  })

  it("decrypt with wrong key throws CiphertextTampered", () => {
    const key = randomBytes(32)
    const wrongKey = randomBytes(32)
    const { iv, tag, ciphertext } = aesGcmEncrypt(key, Buffer.from("secret"))

    expect(() => aesGcmDecrypt(wrongKey, { iv, tag, ciphertext })).toThrow(CiphertextTampered)
  })

  it("decrypt with mutated ciphertext throws CiphertextTampered", () => {
    const key = randomBytes(32)
    const { iv, tag, ciphertext } = aesGcmEncrypt(key, Buffer.from("secret"))
    const mutated = Buffer.from(ciphertext)
    mutated[0] = (mutated[0] ?? 0) ^ 0xff

    expect(() => aesGcmDecrypt(key, { iv, tag, ciphertext: mutated })).toThrow(CiphertextTampered)
  })

  it("each encrypt produces a fresh IV", () => {
    const key = randomBytes(32)
    const a = aesGcmEncrypt(key, Buffer.from("x"))
    const b = aesGcmEncrypt(key, Buffer.from("x"))
    expect(a.iv.equals(b.iv)).toBe(false)
  })
})
