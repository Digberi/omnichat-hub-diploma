export interface InfisicalKmsClient {
  wrapDek(plaintextDek: Buffer): Promise<{ encryptedDek: string; kekKeyId: string }>
  unwrapDek(encryptedDek: string, kekKeyId: string): Promise<Buffer>
}

export type Clock = () => number

export const defaultClock: Clock = () => Date.now()
