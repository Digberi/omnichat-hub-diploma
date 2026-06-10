import { CiphertextMalformed } from "./errors"

export interface CiphertextParts {
  version: number
  iv: Buffer
  tag: Buffer
  ciphertext: Buffer
}

const ENVELOPE_VERSION = "v1"

export function formatCiphertext(parts: CiphertextParts): string {
  const { version, iv, tag, ciphertext } = parts
  return [
    ENVELOPE_VERSION,
    String(version),
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":")
}

export function parseCiphertext(input: string): CiphertextParts {
  if (typeof input !== "string" || input.length === 0) {
    throw new CiphertextMalformed("ciphertext is empty")
  }
  const segments = input.split(":")
  if (segments.length !== 5) {
    throw new CiphertextMalformed(
      `ciphertext has ${segments.length} segments, expected 5 (v1:<version>:<iv>:<tag>:<ct>)`,
    )
  }
  const [envelopeVersion, versionStr, ivB64, tagB64, ctB64] = segments
  if (envelopeVersion !== ENVELOPE_VERSION) {
    throw new CiphertextMalformed(`unknown envelope version "${envelopeVersion}"`)
  }
  const version = Number(versionStr)
  if (!Number.isInteger(version) || version < 1) {
    throw new CiphertextMalformed(`invalid dek version "${versionStr}"`)
  }
  return {
    version,
    iv: Buffer.from(ivB64 ?? "", "base64url"),
    tag: Buffer.from(tagB64 ?? "", "base64url"),
    ciphertext: Buffer.from(ctB64 ?? "", "base64url"),
  }
}
