import { KmsUnavailable } from "../core/errors"
import type { InfisicalKmsClient as IInfisicalKmsClient } from "../core/types"

export interface InfisicalKmsClientOptions {
  baseUrl: string
  clientId: string
  clientSecret: string
  kekKeyId: string
  fetch?: typeof globalThis.fetch
  backoffMs?: number[]
  clock?: () => number
}

const DEFAULT_BACKOFF_MS = [100, 500, 2_000]
const EXPIRY_BUFFER_MS = 60_000

interface CachedToken {
  accessToken: string
  expiresAt: number
}

export class InfisicalKmsClient implements IInfisicalKmsClient {
  private readonly fetchFn: typeof globalThis.fetch
  private readonly backoffMs: number[]
  private readonly clock: () => number
  private cachedToken: CachedToken | null = null

  constructor(private readonly opts: InfisicalKmsClientOptions) {
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis)
    this.backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS
    this.clock = opts.clock ?? (() => Date.now())
  }

  async wrapDek(plaintextDek: Buffer): Promise<{ encryptedDek: string; kekKeyId: string }> {
    const body = await this.requestWithRetry(`/kms/keys/${this.opts.kekKeyId}/encrypt`, {
      plaintext: plaintextDek.toString("base64"),
    })
    const ciphertext = String(body.ciphertext ?? "")
    if (!ciphertext) throw new KmsUnavailable("Infisical /encrypt: empty ciphertext")
    return { encryptedDek: ciphertext, kekKeyId: this.opts.kekKeyId }
  }

  async unwrapDek(encryptedDek: string, kekKeyId: string): Promise<Buffer> {
    const body = await this.requestWithRetry(`/kms/keys/${kekKeyId}/decrypt`, {
      ciphertext: encryptedDek,
    })
    const plaintext = String(body.plaintext ?? "")
    if (!plaintext) throw new KmsUnavailable("Infisical /decrypt: empty plaintext")
    return Buffer.from(plaintext, "base64")
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.cachedToken &&
      this.cachedToken.expiresAt > this.clock() + EXPIRY_BUFFER_MS
    ) {
      return this.cachedToken.accessToken
    }
    const url = `${this.opts.baseUrl.replace(/\/$/, "")}/auth/universal-auth/login`
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: this.opts.clientId, clientSecret: this.opts.clientSecret }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new KmsUnavailable(`Infisical UA login -> ${res.status}: ${text}`)
    }
    const body = (await res.json()) as {
      accessToken?: string
      access_token?: string
      expiresIn?: number
      expires_in?: number
    }
    const accessToken = body.accessToken ?? body.access_token
    if (!accessToken) throw new KmsUnavailable("Infisical UA login: no accessToken in response")
    const expiresInSec =
      typeof body.expiresIn === "number"
        ? body.expiresIn
        : typeof body.expires_in === "number"
          ? body.expires_in
          : 7200
    this.cachedToken = {
      accessToken,
      expiresAt: this.clock() + expiresInSec * 1000,
    }
    return accessToken
  }

  private async requestWithRetry(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const url = `${this.opts.baseUrl.replace(/\/$/, "")}${path}`
    let lastErr: unknown
    let triedRefresh = false
    for (let attempt = 0; attempt < this.backoffMs.length; attempt++) {
      try {
        const token = await this.getAccessToken()
        const res = await this.fetchFn(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })
        if (res.status === 401 && !triedRefresh) {
          // Token might have been invalidated mid-flight; force-refresh once and retry.
          triedRefresh = true
          this.cachedToken = null
          attempt--
          continue
        }
        if (res.status >= 500) {
          lastErr = new Error(`Infisical ${path} returned ${res.status}`)
        } else if (!res.ok) {
          throw new KmsUnavailable(`Infisical ${path} returned ${res.status}`)
        } else {
          return (await res.json()) as Record<string, unknown>
        }
      } catch (err) {
        if (err instanceof KmsUnavailable) throw err
        lastErr = err
      }
      const wait = this.backoffMs[attempt]
      if (wait !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
    }
    throw new KmsUnavailable(`Infisical ${path} exhausted retries`, { cause: lastErr })
  }
}
