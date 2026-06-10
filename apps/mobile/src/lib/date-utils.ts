function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function formatMessageTime(timestamp: string): string {
  const d = new Date(timestamp)
  const now = new Date()
  if (isSameDay(d, now)) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`
}

export function formatFullTime(timestamp: string): string {
  const d = new Date(timestamp)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function formatDateDivider(timestamp: string): string {
  const d = new Date(timestamp)
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`
}

export function formatSnoozedUntil(timestamp: string): string {
  const d = new Date(timestamp)
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function hsl(input: string, alpha?: number): string {
  const parts = input.trim().split(/\s+/)
  if (parts.length < 3) return input
  const [h, s, l] = parts
  if (alpha == null) return `hsl(${h}, ${s}, ${l})`
  return `hsla(${h}, ${s}, ${l}, ${alpha})`
}

