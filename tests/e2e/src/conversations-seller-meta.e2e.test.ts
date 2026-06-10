import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

describe("conversations seller meta", () => {
  it("can patch seller fields via /meta", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const list = await httpRequest({
      method: "GET",
      path: "/v1/conversations?folder=ALL&limit=5",
      token: accessToken,
    })
    expect(list.status).toBe(200)
    const convId = (list.json as any)?.items?.[0]?.id as string | undefined
    expect(typeof convId).toBe("string")

    const note = uniq("note")
    const patch1 = await httpRequest({
      method: "PATCH",
      path: `/v1/conversations/${convId}/meta`,
      token: accessToken,
      body: { sellerNote: note },
    })
    expect(patch1.status).toBe(200)
    expect((patch1.json as any)?.sellerNote).toBe(note)

    const followUpAt = new Date(Date.now() + 60_000).toISOString()
    const patch2 = await httpRequest({
      method: "PATCH",
      path: `/v1/conversations/${convId}/meta`,
      token: accessToken,
      body: { followUpAt },
    })
    expect(patch2.status).toBe(200)
    expect((patch2.json as any)?.followUpAt).toBe(followUpAt)

    const patch3 = await httpRequest({
      method: "PATCH",
      path: `/v1/conversations/${convId}/meta`,
      token: accessToken,
      body: { followUpAt: null },
    })
    expect(patch3.status).toBe(200)
    expect((patch3.json as any)?.followUpAt).toBe(null)

    const patch4 = await httpRequest({
      method: "PATCH",
      path: `/v1/conversations/${convId}/meta`,
      token: accessToken,
      body: { ttn: "20450000123456", shippingStatus: "shipped" },
    })
    expect(patch4.status).toBe(200)
    expect((patch4.json as any)?.ttn).toBe("20450000123456")
    expect((patch4.json as any)?.shippingStatus).toBe("shipped")

    const patch5 = await httpRequest({
      method: "PATCH",
      path: `/v1/conversations/${convId}/meta`,
      token: accessToken,
      body: { paymentStatus: "paid" },
    })
    expect(patch5.status).toBe(200)
    expect((patch5.json as any)?.paymentStatus).toBe("paid")
  })
})

