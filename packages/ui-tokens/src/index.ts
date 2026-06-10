export const channelColorTokens = {
  OLX: "#FF6F00",
  PROM: "#0B6CEB",
  ROZETKA: "#2A7A5E",
} as const

export const statusPalette = [
  { id: "new", color: "#16a34a", icon: "check" },
  { id: "needsFollowUp", color: "#f59e0b", icon: "clock" },
  { id: "archived", color: "#6b7280", icon: "archive" },
] as const

export const tagPalette = [
  { id: "vip", color: "#8b5cf6", icon: "star" },
  { id: "important", color: "#dc2626", icon: "alert-triangle" },
  { id: "refund", color: "#0ea5e9", icon: "refresh-cw" },
] as const

export const iconRegistry = {
  unread: "MessageSquare",
  archived: "Archive",
  pinned: "Pin",
  snoozed: "Moon",
} as const

