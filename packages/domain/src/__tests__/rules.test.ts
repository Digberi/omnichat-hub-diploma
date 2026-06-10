import { describe, expect, it } from "vitest"
import {
  applyAutoArchiveEffects,
  applyIncomingMessageEffects,
  applySellerReplyFailedEffects,
  applySellerReplySuccessEffects,
  canAutoArchive,
  computeNeedsReply,
  shouldSuppressPush,
  validateCanPinInFolder,
  validatePinnedCount,
} from "../rules"
import type { ConversationState } from "../types"

describe("domain rules", () => {
  it("needsReply is derived from lastIncomingAt vs lastSellerReplyAt", () => {
    expect(computeNeedsReply({ lastIncomingAt: null, lastSellerReplyAt: null })).toBe(false)
    expect(computeNeedsReply({ lastIncomingAt: "2026-01-01T00:00:00.000Z", lastSellerReplyAt: null })).toBe(true)
    expect(
      computeNeedsReply({
        lastIncomingAt: "2026-01-02T00:00:00.000Z",
        lastSellerReplyAt: "2026-01-03T00:00:00.000Z",
      }),
    ).toBe(false)
    expect(
      computeNeedsReply({
        lastIncomingAt: "2026-01-04T00:00:00.000Z",
        lastSellerReplyAt: "2026-01-03T00:00:00.000Z",
      }),
    ).toBe(true)
  })

  it("incoming message auto-unarchives and makes needsReply=true", () => {
    const s: ConversationState = {
      id: "c1",
      needsReply: false,
      isArchived: true,
      archivedAt: "2026-01-01T00:00:00.000Z",
      isPinnedInAll: true,
      pinnedAt: "2026-01-01T00:00:00.000Z",
      tagIds: ["t1"],
    }
    const now = new Date("2026-01-02T00:00:00.000Z")
    const next = applyIncomingMessageEffects(s, { direction: "IN" }, now)
    expect(next.isArchived).toBe(false)
    expect(next.archivedAt).toBe(null)
    expect(next.needsReply).toBe(true)
    expect(next.isPinnedInAll).toBe(false)
    expect(next.tagIds).toEqual(["t1"])
  })

  it("needsReply flips false only on successful seller reply", () => {
    const s: ConversationState = {
      id: "c2",
      needsReply: true,
      isArchived: false,
      isPinnedInAll: false,
      tagIds: [],
      lastIncomingAt: "2026-01-01T00:00:00.000Z",
    }
    const now = new Date("2026-01-01T01:00:00.000Z")
    const afterFailed = applySellerReplyFailedEffects(s, now)
    expect(afterFailed.needsReply).toBe(true)
    const afterSuccess = applySellerReplySuccessEffects(s, { direction: "OUT" }, now)
    expect(afterSuccess.needsReply).toBe(false)
  })

  it("pin is only allowed in ALL and max pinned is 3", () => {
    expect(() => validateCanPinInFolder("UNREAD")).toThrow("PIN_ALLOWED_ONLY_IN_ALL")
    expect(() => validatePinnedCount(4)).toThrow("PIN_LIMIT_EXCEEDED")
  })

  it("snooze suppresses push only until snoozedUntil", () => {
    const now = new Date("2026-01-01T00:00:00.000Z")
    expect(shouldSuppressPush({ snoozedUntil: "2099-01-01T00:00:00.000Z" }, now)).toBe(true)
    expect(shouldSuppressPush({ snoozedUntil: "2020-01-01T00:00:00.000Z" }, now)).toBe(false)
  })

  it("auto-archive depends on lastSellerReplyAt + 7 days, and only when needsReply=false and not pinned", () => {
    const s: ConversationState = {
      id: "c3",
      needsReply: false,
      isArchived: false,
      isPinnedInAll: false,
      tagIds: [],
      lastSellerReplyAt: "2026-01-01T00:00:00.000Z",
      autoArchiveDays: 7,
    }
    expect(canAutoArchive(s, new Date("2026-01-08T00:00:00.000Z"))).toBe(true)
    const archived = applyAutoArchiveEffects(s, new Date("2026-01-08T00:00:00.000Z"))
    expect(archived.isArchived).toBe(true)

    expect(
      canAutoArchive({ ...s, isPinnedInAll: true }, new Date("2026-01-09T00:00:00.000Z")),
    ).toBe(false)
    expect(
      canAutoArchive({ ...s, needsReply: true }, new Date("2026-01-09T00:00:00.000Z")),
    ).toBe(false)
  })
})

