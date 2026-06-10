export class KmsUnavailable extends Error {
  override readonly name = "KmsUnavailable"
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions)
  }
}

export class CiphertextMalformed extends Error {
  override readonly name = "CiphertextMalformed"
}

export class CiphertextTampered extends Error {
  override readonly name = "CiphertextTampered"
}

export class DekVersionMissing extends Error {
  override readonly name = "DekVersionMissing"
  constructor(public readonly workspaceId: string, public readonly version: number) {
    super(`No ChannelDek row for workspaceId=${workspaceId} version=${version}`)
  }
}
