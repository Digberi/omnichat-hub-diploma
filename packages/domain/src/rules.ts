import type { ConversationState, FolderId, MessageCore } from "./types"
import { addDays } from "./time"

export function computeNeedsReply(input: {
  lastIncomingAt?: string | null
  lastSellerReplyAt?: string | null
}): boolean {
  if (!input.lastIncomingAt) return false
  if (!input.lastSellerReplyAt) return true
  return new Date(input.lastIncomingAt) > new Date(input.lastSellerReplyAt)
}

export function shouldSuppressPush(
  state: Pick<ConversationState, "snoozedUntil">,
  now: Date = new Date(),
): boolean {
  return Boolean(state.snoozedUntil && new Date(state.snoozedUntil) > now)
}

export function validateCanPinInFolder(folder: FolderId): void {
  if (folder !== "ALL") {
    throw new Error("PIN_ALLOWED_ONLY_IN_ALL")
  }
}

export function validatePinnedCount(pinnedInAllCount: number): void {
  if (pinnedInAllCount > 3) {
    throw new Error("PIN_LIMIT_EXCEEDED")
  }
}

export function applyIncomingMessageEffects(
  state: ConversationState,
  incomingMsg: Pick<MessageCore, "direction">,
  now: Date = new Date(),
): ConversationState {
  if (incomingMsg.direction !== "IN") return state

  // Incoming messages always make the conversation require reply.
  // If it was archived, it auto-unarchives. Pinned does not restore on unarchive, so keep unpinned.
  return {
    ...state,
    needsReply: true,
    isArchived: false,
    archivedAt: null,
    isPinnedInAll: false,
    pinnedAt: null,
    lastIncomingAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
  }
}

export function applySellerReplySuccessEffects(
  state: ConversationState,
  msg: Pick<MessageCore, "direction">,
  now: Date = new Date(),
): ConversationState {
  if (msg.direction !== "OUT") return state

  return {
    ...state,
    needsReply: false,
    lastSellerReplyAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
  }
}

export function applySellerReplyFailedEffects(
  state: ConversationState,
  _now: Date = new Date(),
): ConversationState {
  // Important: needsReply stays unchanged; it only flips to false on successful seller reply.
  return state
}

export function canAutoArchive(state: ConversationState, now: Date = new Date()): boolean {
  if (state.isArchived) return false
  if (state.isPinnedInAll) return false
  if (state.needsReply) return false
  if (!state.lastSellerReplyAt) return false

  const autoDays = state.autoArchiveDays ?? 7
  const archiveAt = addDays(new Date(state.lastSellerReplyAt), autoDays)
  return now >= archiveAt
}

export function applyAutoArchiveEffects(state: ConversationState, now: Date = new Date()): ConversationState {
  if (!canAutoArchive(state, now)) return state
  return {
    ...state,
    isArchived: true,
    archivedAt: now.toISOString(),
    isPinnedInAll: false,
    pinnedAt: null,
  }
}

