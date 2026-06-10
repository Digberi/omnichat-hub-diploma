import { describe, expect, it } from "vitest"

import { CiphertextMalformed } from "./errors"
import { formatCiphertext, parseCiphertext } from "./ciphertext"

describe("ciphertext format v1:<version>:<iv>:<tag>:<ct>", () => {
  it("formats and parses round-trip", () => {
    const iv = Buffer.from("000102030405060708090a0b", "hex")
    const tag = Buffer.from("aabbccddeeff00112233445566778899", "hex")
    const ct = Buffer.from([1, 2, 3, 4, 5])

    const encoded = formatCiphertext({ version: 7, iv, tag, ciphertext: ct })

    expect(encoded.startsWith("v1:7:")).toBe(true)
    expect(encoded.split(":").length).toBe(5)

    const parsed = parseCiphertext(encoded)
    expect(parsed.version).toBe(7)
    expect(parsed.iv.equals(iv)).toBe(true)
    expect(parsed.tag.equals(tag)).toBe(true)
    expect(parsed.ciphertext.equals(ct)).toBe(true)
  })

  it("rejects 3-segment legacy v1 format (no DEK version field)", () => {
    expect(() => parseCiphertext("v1:abc:def:ghi")).toThrow(CiphertextMalformed)
  })

  it("rejects unknown envelope version", () => {
    expect(() => parseCiphertext("v9:1:iv:tag:ct")).toThrow(CiphertextMalformed)
  })

  it("rejects non-integer version field", () => {
    expect(() => parseCiphertext("v1:abc:iv:tag:ct")).toThrow(CiphertextMalformed)
  })

  it("rejects empty string", () => {
    expect(() => parseCiphertext("")).toThrow(CiphertextMalformed)
  })
})
