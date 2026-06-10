import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import { CiphertextTampered } from "./errors"

export interface AesGcmCiphertext {
  iv: Buffer
  tag: Buffer
  ciphertext: Buffer
}

export function aesGcmEncrypt(key: Buffer, plaintext: Buffer): AesGcmCiphertext {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return { iv, tag, ciphertext }
}

export function aesGcmDecrypt(key: Buffer, parts: AesGcmCiphertext): Buffer {
  const { iv, tag, ciphertext } = parts
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch (err) {
    throw new CiphertextTampered(`AES-GCM auth failed: ${(err as Error).message}`)
  }
}
