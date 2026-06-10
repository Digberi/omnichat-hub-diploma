"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import type { components } from "@omnichat/api-client"

import { api } from "@/lib/api"
import { clearTokens, getAccessToken } from "@/lib/tokens"
import { logout } from "@/lib/logout"

type SearchResponse = components["schemas"]["SearchResponseDto"]

function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function buildUrl(input: { q: string; showOlder: boolean }): string {
  const q = input.q.trim()
  if (!q) return "/search"
  const sp = new URLSearchParams()
  sp.set("q", q)
  if (input.showOlder) sp.set("showOlder", "1")
  return `/search?${sp.toString()}`
}

export function SearchPageClient() {
  const router = useRouter()
  const sp = useSearchParams()

  const token = useMemo(() => getAccessToken(), [])

  const initialQ = sp.get("q") ?? ""
  const initialShowOlder = sp.get("showOlder") === "1" || sp.get("showOlder") === "true"

  const [q, setQ] = useState(initialQ)
  const [showOlder, setShowOlder] = useState(initialShowOlder)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SearchResponse | null>(null)

  useEffect(() => {
    if (!token) {
      router.replace("/login?next=/search")
    }
  }, [router, token])

  useEffect(() => {
    if (!token) return

    const qParam = sp.get("q") ?? ""
    const showOlderParam = sp.get("showOlder") === "1" || sp.get("showOlder") === "true"

    setQ(qParam)
    setShowOlder(showOlderParam)

    const trimmed = qParam.trim()
    if (!trimmed) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.GET("/v1/search", {
          params: {
            query: {
              query: trimmed,
              showOlder: showOlderParam ? "1" : "0",
              limit: 50,
            },
          },
        })
        if (res.response.status === 401) {
          clearTokens()
          router.replace("/login?next=/search")
          return
        }
        if (!res.data) throw new Error(`Search failed: ${res.response.status}`)

        if (!alive) return
        setData(res.data)
      } catch (e: unknown) {
        if (!alive) return
        setError(errorToMessage(e))
        setData(null)
      } finally {
        if (!alive) return
        setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [router, sp, token])

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link className="text-sm underline text-neutral-600" href="/inbox">
              Back
            </Link>
            <h1 className="text-2xl font-semibold">Search</h1>
          </div>
          <button
            className="text-sm text-neutral-600 underline"
            onClick={() => {
              void (async () => {
                await logout()
                router.replace("/login?next=/search")
              })()
            }}
          >
            Logout
          </button>
        </div>

        <form
          className="mt-4 flex flex-col gap-3 rounded-lg border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault()
            router.replace(buildUrl({ q, showOlder }))
          }}
        >
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border px-3 py-2"
              placeholder="Search..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white" type="submit">
              Go
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={showOlder}
              onChange={(e) => setShowOlder(e.target.checked)}
              className="h-4 w-4"
            />
            Show older
          </label>
        </form>

        {loading ? <p className="mt-4 text-sm text-neutral-600">Loading...</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600 break-words">{error}</p> : null}

        {data ? (
          <div className="mt-6 space-y-6">
            <section>
              <h2 className="text-sm font-medium text-neutral-600">Conversations</h2>
              <ul className="mt-2 divide-y rounded-lg border bg-white">
                {data.conversations.map((c) => (
                  <li key={c.id} className="p-3">
                    <Link className="font-medium hover:underline" href={`/chat/${c.id}`}>
                      {c.buyerDisplayName}
                    </Link>
                    <div className="text-xs text-neutral-500">
                      {c.contextTitle ? c.contextTitle : ""}
                      {c.lastActivityAt ? ` · ${new Date(c.lastActivityAt).toLocaleString()}` : ""}
                    </div>
                  </li>
                ))}
                {data.conversations.length === 0 ? <li className="p-3 text-sm text-neutral-600">No conversation hits.</li> : null}
              </ul>
            </section>

            <section>
              <h2 className="text-sm font-medium text-neutral-600">Messages</h2>
              <ul className="mt-2 divide-y rounded-lg border bg-white">
                {data.messages.map((m) => (
                  <li key={m.id} className="p-3">
                    <Link
                      className="text-sm font-medium hover:underline"
                      href={`/chat/${m.conversationId}?messageId=${encodeURIComponent(m.id)}`}
                    >
                      Open chat
                    </Link>
                    <div className="mt-1 text-sm text-neutral-800">{m.text ?? <span className="opacity-70">[no text]</span>}</div>
                    <div className="mt-1 text-xs text-neutral-500">{new Date(m.createdAt).toLocaleString()}</div>
                  </li>
                ))}
                {data.messages.length === 0 ? <li className="p-3 text-sm text-neutral-600">No message hits.</li> : null}
              </ul>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  )
}
