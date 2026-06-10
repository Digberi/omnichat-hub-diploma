import { describe, expect, it } from "vitest"

const baseUrl = process.env.E2E_API_BASE_URL ?? "http://localhost:4121"

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "application/json" },
  })
  const bodyText = await res.text()
  const contentType = res.headers.get("content-type") ?? ""
  return {
    status: res.status,
    contentType,
    bodyText,
  }
}

describe("api health", () => {
  it("/health returns ok", async () => {
    const res = await getJson("/health")
    expect(res).toMatchObject({ status: 200 })
  })

  it("/ready returns ok", async () => {
    const res = await getJson("/ready")
    expect(res).toMatchObject({ status: 200 })
  })
})
