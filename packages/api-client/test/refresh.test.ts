import { beforeEach, describe, expect, it, vi } from "vitest"

import { createApiClient } from "../src/client"

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("createApiClient auth refresh", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("refreshes on 401, updates tokens, and retries once", async () => {
    let accessToken = "old_access"
    let refreshToken = "old_refresh"

    const fetchMock = vi.fn(async (req: Request) => {
      const url = req.url
      const auth = req.headers.get("authorization")

      if (url.includes("/v1/auth/refresh")) {
        accessToken = "new_access"
        refreshToken = "new_refresh"
        return jsonResponse(201, { accessToken, refreshToken })
      }

      if (auth === "Bearer old_access") return jsonResponse(401, { message: "Unauthorized" })
      if (auth === "Bearer new_access") {
        return jsonResponse(200, { pinned: [], items: [], nextCursor: null })
      }

      return jsonResponse(500, { message: "Unexpected request" })
    })

    vi.stubGlobal("fetch", fetchMock as any)

    const client = createApiClient({
      baseUrl: "http://api.test",
      getAccessToken: () => accessToken,
      getRefreshToken: () => refreshToken,
      setTokens: async (t) => {
        accessToken = t.accessToken
        refreshToken = t.refreshToken
      },
    })

    const res = await client.GET("/v1/conversations", {
      params: { query: { folder: "ALL", limit: 1 } },
    })

    expect(res.response.status).toBe(200)
    expect(res.data?.items).toBeTruthy()
    expect(accessToken).toBe("new_access")
    expect(refreshToken).toBe("new_refresh")
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("calls onAuthError if refresh fails", async () => {
    let accessToken = "old_access"
    let refreshToken = "old_refresh"
    const onAuthError = vi.fn()

    const fetchMock = vi.fn(async (req: Request) => {
      const url = req.url
      if (url.includes("/v1/auth/refresh")) return jsonResponse(401, { message: "invalid refresh" })
      return jsonResponse(401, { message: "Unauthorized" })
    })
    vi.stubGlobal("fetch", fetchMock as any)

    const client = createApiClient({
      baseUrl: "http://api.test",
      getAccessToken: () => accessToken,
      getRefreshToken: () => refreshToken,
      onAuthError,
    })

    const res = await client.GET("/v1/conversations", {
      params: { query: { folder: "ALL", limit: 1 } },
    })

    expect(res.response.status).toBe(401)
    expect(onAuthError).toHaveBeenCalledTimes(1)
  })

  it("delegates to refreshAccessToken when provided, skipping its own /v1/auth/refresh POST", async () => {
    // Regression test for the WebKit auth-vibrate race: when the host (web
    // app) provides its own dedup'd refresh function, the client MUST use
    // it instead of POSTing /v1/auth/refresh itself — otherwise two parallel
    // refresh paths collide on the single-use refresh token and one gets
    // 401 → onAuthError → user kicked out.
    let accessToken = "old_access"
    const refreshAccessToken = vi.fn(async () => {
      accessToken = "new_access"
      return "new_access"
    })

    const fetchMock = vi.fn(async (req: Request) => {
      const url = req.url
      const auth = req.headers.get("authorization")

      if (url.includes("/v1/auth/refresh")) {
        // The client must NOT POST here when refreshAccessToken is supplied.
        return jsonResponse(500, { message: "client should not POST /v1/auth/refresh when delegate provided" })
      }

      if (auth === "Bearer old_access") return jsonResponse(401, { message: "Unauthorized" })
      if (auth === "Bearer new_access") {
        return jsonResponse(200, { pinned: [], items: [], nextCursor: null })
      }

      return jsonResponse(500, { message: "Unexpected request" })
    })

    vi.stubGlobal("fetch", fetchMock as any)

    const client = createApiClient({
      baseUrl: "http://api.test",
      getAccessToken: () => accessToken,
      refreshAccessToken,
    })

    const res = await client.GET("/v1/conversations", {
      params: { query: { folder: "ALL", limit: 1 } },
    })

    expect(res.response.status).toBe(200)
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    // Two fetches: initial (401) + retry (200). NO /v1/auth/refresh POST.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const call of fetchMock.mock.calls) {
      const req = call[0] as Request
      expect(req.url).not.toContain("/v1/auth/refresh")
    }
  })

  it("calls onAuthError when refreshAccessToken delegate returns null", async () => {
    let accessToken = "old_access"
    const onAuthError = vi.fn()
    const refreshAccessToken = vi.fn(async () => null)

    const fetchMock = vi.fn(async (req: Request) => {
      const url = req.url
      if (url.includes("/v1/auth/refresh")) {
        return jsonResponse(500, { message: "client should not POST /v1/auth/refresh when delegate provided" })
      }
      return jsonResponse(401, { message: "Unauthorized" })
    })
    vi.stubGlobal("fetch", fetchMock as any)

    const client = createApiClient({
      baseUrl: "http://api.test",
      getAccessToken: () => accessToken,
      refreshAccessToken,
      onAuthError,
    })

    const res = await client.GET("/v1/conversations", {
      params: { query: { folder: "ALL", limit: 1 } },
    })

    expect(res.response.status).toBe(401)
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(onAuthError).toHaveBeenCalledTimes(1)
  })
})

