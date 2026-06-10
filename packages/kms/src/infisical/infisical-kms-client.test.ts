import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { KmsUnavailable } from "../core/errors"
import { InfisicalKmsClient } from "./infisical-kms-client"

function loginResponse(accessToken = "ua-access-token-1", expiresIn = 7200) {
  return new Response(JSON.stringify({ accessToken, expiresIn }), { status: 200 })
}

describe("InfisicalKmsClient (Universal Auth)", () => {
  const fetchMock = vi.fn()
  let clock = 1_000_000
  let client: InfisicalKmsClient

  beforeEach(() => {
    fetchMock.mockReset()
    clock = 1_000_000
    client = new InfisicalKmsClient({
      baseUrl: "https://app.infisical.com/api/v1",
      clientId: "client-1",
      clientSecret: "secret-1",
      kekKeyId: "kek_prod",
      fetch: fetchMock as any,
      backoffMs: [1, 1, 1],
      clock: () => clock,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("wrapDek logs in first, then POSTs to /encrypt with the access token", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ ciphertext: "AAAA" }), { status: 200 }))

    const out = await client.wrapDek(Buffer.from([1, 2, 3]))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [loginUrl, loginInit] = fetchMock.mock.calls[0]!
    expect(loginUrl).toBe("https://app.infisical.com/api/v1/auth/universal-auth/login")
    expect(JSON.parse(String((loginInit as RequestInit).body))).toEqual({
      clientId: "client-1",
      clientSecret: "secret-1",
    })
    const [kmsUrl, kmsInit] = fetchMock.mock.calls[1]!
    expect(kmsUrl).toBe("https://app.infisical.com/api/v1/kms/keys/kek_prod/encrypt")
    expect((kmsInit as RequestInit).headers).toMatchObject({
      Authorization: "Bearer ua-access-token-1",
    })
    expect(out).toEqual({ encryptedDek: "AAAA", kekKeyId: "kek_prod" })
  })

  it("unwrapDek POSTs to /kms/keys/<id>/decrypt and returns Buffer", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ plaintext: "AQID" }), { status: 200 }))

    const out = await client.unwrapDek("AAAA", "kek_prod")

    expect(out.equals(Buffer.from([1, 2, 3]))).toBe(true)
  })

  it("caches the access token across multiple wrap/unwrap calls", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ ciphertext: "AAAA" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ plaintext: "AQID" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ciphertext: "BBBB" }), { status: 200 }))

    await client.wrapDek(Buffer.from([1]))
    await client.unwrapDek("AAAA", "kek_prod")
    await client.wrapDek(Buffer.from([2]))

    // 1 login + 3 KMS calls = 4 fetches total. NOT 6.
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("refreshes the token after expiry", async () => {
    // expiresIn 100s, buffer 60s → next call past 40s should refresh
    fetchMock
      .mockResolvedValueOnce(loginResponse("token-1", 100))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ciphertext: "AAAA" }), { status: 200 }))
      .mockResolvedValueOnce(loginResponse("token-2", 100))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ciphertext: "BBBB" }), { status: 200 }))

    await client.wrapDek(Buffer.from([1]))
    clock += 50_000 // 50s elapsed, < 100s but >= 100s - 60s buffer → refresh
    await client.wrapDek(Buffer.from([2]))

    expect(fetchMock).toHaveBeenCalledTimes(4)
    const loginCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith("/auth/universal-auth/login"),
    )
    expect(loginCalls).toHaveLength(2)
  })

  it("on 401 from KMS endpoint, invalidates cache and retries once with fresh token", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse("token-stale"))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(loginResponse("token-fresh"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ciphertext: "AAAA" }), { status: 200 }))

    const out = await client.wrapDek(Buffer.from([1]))

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(out.encryptedDek).toBe("AAAA")
  })

  it("throws KmsUnavailable when login fails with 4xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }))

    await expect(client.wrapDek(Buffer.from([1]))).rejects.toThrow(KmsUnavailable)
  })

  it("retries on 5xx from KMS and succeeds on 3rd attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(new Response("boom", { status: 502 }))
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ciphertext: "AAAA" }), { status: 200 }))

    const out = await client.wrapDek(Buffer.from([1]))
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(out.encryptedDek).toBe("AAAA")
  })

  it("throws KmsUnavailable after exhausting 5xx retries", async () => {
    fetchMock
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValue(new Response("boom", { status: 502 }))

    await expect(client.wrapDek(Buffer.from([1]))).rejects.toThrow(KmsUnavailable)
  })
})
