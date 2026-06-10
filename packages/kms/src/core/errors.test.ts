import { describe, expect, it } from "vitest"

import { CiphertextMalformed, CiphertextTampered, DekVersionMissing, KmsUnavailable } from "./errors"

describe("kms errors", () => {
  it("KmsUnavailable carries cause and is instanceof Error", () => {
    const cause = new Error("network down")
    const err = new KmsUnavailable("infisical timed out", { cause })

    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(KmsUnavailable)
    expect(err.name).toBe("KmsUnavailable")
    expect(err.message).toBe("infisical timed out")
    expect(err.cause).toBe(cause)
  })

  it("CiphertextMalformed has fixed name", () => {
    const err = new CiphertextMalformed("expected v1 prefix")
    expect(err.name).toBe("CiphertextMalformed")
  })

  it("DekVersionMissing exposes workspaceId + version", () => {
    const err = new DekVersionMissing("ws_1", 7)
    expect(err.workspaceId).toBe("ws_1")
    expect(err.version).toBe(7)
    expect(err.name).toBe("DekVersionMissing")
    expect(err.message).toContain("ws_1")
    expect(err.message).toContain("7")
  })

  it("CiphertextTampered has fixed name", () => {
    const err = new CiphertextTampered("auth tag mismatch")
    expect(err.name).toBe("CiphertextTampered")
  })
})
