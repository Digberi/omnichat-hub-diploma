import { createHash } from "node:crypto"

import { aesGcmDecrypt, aesGcmEncrypt } from "./aes-gcm"
import type { InfisicalKmsClient } from "./types"

export interface FakeInfisicalKmsClientOptions {
  kekKeyId: string
  failWrapTimes?: number
  failUnwrapTimes?: number
}

/**
 * In-memory stand-in for Infisical KMS used in unit/integration tests.
 * The "KEK" is derived from the configured kekKeyId via SHA-256 so the
 * wrap/unwrap pair is deterministic per-instance and incompatible across
 * different kekKeyIds.
 */
export class FakeInfisicalKmsClient implements InfisicalKmsClient {
  private failWrapRemaining: number
  private failUnwrapRemaining: number

  constructor(private readonly options: FakeInfisicalKmsClientOptions) {
    this.failWrapRemaining = options.failWrapTimes ?? 0
    this.failUnwrapRemaining = options.failUnwrapTimes ?? 0
  }

  private deriveKek(kekKeyId: string): Buffer {
    return createHash("sha256").update(`fake-kek:${kekKeyId}`).digest()
  }

  async wrapDek(plaintextDek: Buffer): Promise<{ encryptedDek: string; kekKeyId: string }> {
    if (this.failWrapRemaining > 0) {
      this.failWrapRemaining -= 1
      throw new Error("simulated Infisical wrap failure")
    }
    const kek = this.deriveKek(this.options.kekKeyId)
    const { iv, tag, ciphertext } = aesGcmEncrypt(kek, plaintextDek)
    const blob = Buffer.concat([iv, tag, ciphertext]).toString("base64url")
    return { encryptedDek: blob, kekKeyId: this.options.kekKeyId }
  }

  async unwrapDek(encryptedDek: string, kekKeyId: string): Promise<Buffer> {
    if (this.failUnwrapRemaining > 0) {
      this.failUnwrapRemaining -= 1
      throw new Error("simulated Infisical unwrap failure")
    }
    const kek = this.deriveKek(kekKeyId)
    const blob = Buffer.from(encryptedDek, "base64url")
    if (blob.length < 12 + 16) {
      throw new Error("fake KMS: encryptedDek too short")
    }
    const iv = blob.subarray(0, 12)
    const tag = blob.subarray(12, 28)
    const ciphertext = blob.subarray(28)
    return aesGcmDecrypt(kek, { iv, tag, ciphertext })
  }
}
