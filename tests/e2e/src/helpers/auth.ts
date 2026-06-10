import { createHmac } from "node:crypto"

import { httpRequest } from "./http"

const otpCode = process.env.E2E_OTP_CODE ?? "000000"

export type LoginTokens = {
  accessToken: string
  refreshToken: string
}

export async function loginViaEmailOtp(email = "demo@omnichat.local"): Promise<LoginTokens> {
  const start = await httpRequest({
    method: "POST",
    path: "/v1/auth/start-email-login",
    body: { email },
  })
  if (start.status !== 200 && start.status !== 201) {
    throw new Error(`start-email-login failed: ${start.status} ${start.text}`)
  }

  const verify = await httpRequest({
    method: "POST",
    path: "/v1/auth/verify-email-login",
    body: { email, code: otpCode },
  })
  if (verify.status !== 200 && verify.status !== 201) {
    throw new Error(`verify-email-login failed: ${verify.status} ${verify.text}`)
  }
  if (!verify.json || typeof verify.json !== "object") {
    throw new Error(`verify-email-login bad json: ${verify.text}`)
  }

  const accessToken = (verify.json as any).accessToken
  const refreshToken = (verify.json as any).refreshToken
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    throw new Error(`verify-email-login missing tokens: ${verify.text}`)
  }

  return { accessToken, refreshToken }
}

function toBase64Url(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".")
  if (parts.length !== 3) throw new Error("Invalid JWT format")
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>
}

function signHs256(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" }
  const headerB64 = toBase64Url(JSON.stringify(header))
  const payloadB64 = toBase64Url(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`
  const signature = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
  return `${signingInput}.${signature}`
}

export function forgeWorkspaceMismatchAccessToken(baseAccessToken: string): string | null {
  const secret = process.env.JWT_ACCESS_SECRET
  if (!secret) return null

  const base = decodeJwtPayload(baseAccessToken)
  const sub = typeof base.sub === "string" ? base.sub : null
  const sid = typeof base.sid === "string" ? base.sid : null
  if (!sub || !sid) return null

  const nowSec = Math.floor(Date.now() / 1000)
  const payload = {
    sub,
    sid,
    wid: `ws_mismatch_${Date.now()}`,
    iat: nowSec,
    exp: nowSec + 15 * 60,
  }

  return signHs256(payload, secret)
}
