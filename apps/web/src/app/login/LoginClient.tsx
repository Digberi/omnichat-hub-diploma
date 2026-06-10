"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import type { components } from "@omnichat/api-client"

import { api } from "@/lib/api"
import { setTokens } from "@/lib/tokens"

type AuthTokensResponseDto = components["schemas"]["AuthTokensResponseDto"]

function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = useMemo(() => searchParams.get("next") ?? "/inbox", [searchParams])

  const [email, setEmail] = useState("demo@omnichat.local")
  const [code, setCode] = useState("000000")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otpStarted, setOtpStarted] = useState(false)

  useEffect(() => {
    const oauth = searchParams.get("oauth")
    const exchangeCode = searchParams.get("code")
    const oauthError = searchParams.get("error")

    if (oauthError && oauth === "google" && !exchangeCode) {
      setError(oauthError)
      return
    }

    if (oauth !== "google" || !exchangeCode) return

    let cancelled = false

    ;(async () => {
      setError(null)
      setLoading(true)
      try {
        const res = await api.POST("/v1/auth/google/exchange", {
          body: { code: exchangeCode },
        })
        if (res.error || !res.data) throw new Error(JSON.stringify(res.error ?? "no data"))
        const data: AuthTokensResponseDto = res.data
        if (!data.accessToken || !data.refreshToken) throw new Error("Missing tokens in response")
        if (cancelled) return

        setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
        router.replace(nextUrl)
      } catch (e: unknown) {
        if (cancelled) return
        setError(errorToMessage(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router, searchParams, nextUrl])

  async function startGoogle() {
    setError(null)
    setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/login?next=${encodeURIComponent(nextUrl)}`
      const res = await api.GET("/v1/auth/google/start", {
        params: { query: { redirectTo } },
      })
      if (res.error || !res.data?.url) throw new Error(JSON.stringify(res.error ?? "no url"))
      window.location.href = String(res.data.url)
    } catch (e: unknown) {
      setError(errorToMessage(e))
    } finally {
      setLoading(false)
    }
  }

  async function startOtp() {
    setError(null)
    setLoading(true)
    try {
      const res = await api.POST("/v1/auth/start-email-login", {
        body: { email },
      })
      if (res.error) throw new Error(JSON.stringify(res.error))
      setOtpStarted(true)
    } catch (e: unknown) {
      setError(errorToMessage(e))
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp() {
    setError(null)
    setLoading(true)
    try {
      const res = await api.POST("/v1/auth/verify-email-login", {
        body: { email, code },
      })
      if (res.error || !res.data) throw new Error(JSON.stringify(res.error ?? "no data"))
      const data: AuthTokensResponseDto = res.data
      if (!data.accessToken || !data.refreshToken) throw new Error("Missing tokens in response")

      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
      router.replace(nextUrl)
    } catch (e: unknown) {
      setError(errorToMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Login</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Email OTP. For local dev you can set <code className="font-mono">AUTH_OTP_FIXED_CODE=000000</code> in{" "}
          <code className="font-mono">apps/api/.env</code>, or read the OTP from API logs after clicking{" "}
          <code className="font-mono">Start OTP</code>.
        </p>

        <button
          className="mt-5 w-full rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
          onClick={startGoogle}
          disabled={loading}
        >
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-neutral-200" />
          <span className="text-xs text-neutral-500">or</span>
          <div className="h-px flex-1 bg-neutral-200" />
        </div>

        <label className="mt-5 block text-sm font-medium">Email</label>
        <input
          className="mt-1 w-full rounded-md border px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <div className="mt-4 flex gap-2">
          <button
            className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={startOtp}
            disabled={loading || email.trim().length === 0}
          >
            Start OTP
          </button>
          {otpStarted ? (
            <span className="self-center text-xs text-neutral-500">We sent a one-time code to this email</span>
          ) : (
            <span className="self-center text-xs text-neutral-500">We’ll send a one-time code to this email</span>
          )}
        </div>

        <label className="mt-5 block text-sm font-medium">Code</label>
        <input className="mt-1 w-full rounded-md border px-3 py-2" value={code} onChange={(e) => setCode(e.target.value)} />

        <button
          className="mt-4 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={verifyOtp}
          disabled={loading || email.trim().length === 0 || code.trim().length !== 6}
        >
          Verify & Continue
        </button>

        {error ? <p className="mt-4 text-sm text-red-600 break-words">{error}</p> : null}
      </div>
    </main>
  )
}
