import { describe, expect, it } from "vitest"

import { httpRequest } from "./helpers/http"
import { loginViaEmailOtp } from "./helpers/auth"

function plusMinutesIso(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString()
}

describe("conversations actions", () => {
  it("enforces pin rules (max 3) and archive confirmation when pinned", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const list0 = await httpRequest({
      method: "GET",
      path: "/v1/conversations?folder=ALL&limit=50",
      token: accessToken,
    })
    expect(list0.status).toBe(200)

    const pinned0 = ((list0.json as any)?.pinned ?? []) as Array<{ id: string }>
    const items0 = ((list0.json as any)?.items ?? []) as Array<{ id: string }>
    expect(Array.isArray(pinned0)).toBe(true)
    expect(Array.isArray(items0)).toBe(true)
    expect(items0.length).toBeGreaterThanOrEqual(4)

    // Ensure a clean pin baseline for deterministic test runs.
    for (const c of pinned0) {
      await httpRequest({ method: "POST", path: `/v1/conversations/${c.id}/unpin`, token: accessToken })
    }

    // Pick 4 conversations (non-pinned list).
    const ids = items0.slice(0, 4).map((c) => c.id)

    // Pin 3 is ok.
    for (const id of ids.slice(0, 3)) {
      const res = await httpRequest({ method: "POST", path: `/v1/conversations/${id}/pin`, token: accessToken })
      expect([200, 201]).toContain(res.status)
      expect((res.json as any)?.id).toBe(id)
      expect((res.json as any)?.isPinnedInAll).toBe(true)
    }

    // Pin 4th must fail (max=3).
    const res4 = await httpRequest({ method: "POST", path: `/v1/conversations/${ids[3]}/pin`, token: accessToken })
    expect(res4.status).toBe(400)

    // Pinned conversation requires explicit confirmation to archive.
    const pinnedId = ids[0]
    const archiveNoConfirm = await httpRequest({
      method: "POST",
      path: `/v1/conversations/${pinnedId}/archive`,
      token: accessToken,
      body: {},
    })
    expect(archiveNoConfirm.status).toBe(400)

    const archiveConfirm = await httpRequest({
      method: "POST",
      path: `/v1/conversations/${pinnedId}/archive`,
      token: accessToken,
      body: { confirmUnpin: true },
    })
    expect([200, 201]).toContain(archiveConfirm.status)
    expect((archiveConfirm.json as any)?.isArchived).toBe(true)
    expect((archiveConfirm.json as any)?.isPinnedInAll).toBe(false)
  })

  it("can snooze/unsnooze and it appears in SNOOZED folder", async () => {
    const { accessToken } = await loginViaEmailOtp()

    const list0 = await httpRequest({
      method: "GET",
      path: "/v1/conversations?folder=ALL&limit=10",
      token: accessToken,
    })
    expect(list0.status).toBe(200)
    const convId = (list0.json as any)?.items?.[0]?.id as string | undefined
    expect(typeof convId).toBe("string")

    // Clean state for re-runs.
    await httpRequest({ method: "POST", path: `/v1/conversations/${convId}/unsnooze`, token: accessToken })

    const snooze = await httpRequest({
      method: "POST",
      path: `/v1/conversations/${convId}/snooze`,
      token: accessToken,
      body: { until: plusMinutesIso(30) },
    })
    expect([200, 201]).toContain(snooze.status)
    expect((snooze.json as any)?.snoozedUntil).toBeTruthy()

    const snoozedList = await httpRequest({
      method: "GET",
      path: "/v1/conversations?folder=SNOOZED&limit=50",
      token: accessToken,
    })
    expect(snoozedList.status).toBe(200)
    const ids = (((snoozedList.json as any)?.items ?? []) as Array<{ id: string }>).map((c) => c.id)
    expect(ids).toContain(convId)

    const unsnooze = await httpRequest({ method: "POST", path: `/v1/conversations/${convId}/unsnooze`, token: accessToken })
    expect([200, 201]).toContain(unsnooze.status)
    expect((unsnooze.json as any)?.snoozedUntil).toBe(null)
  })
})

