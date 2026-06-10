export function addDays(input: Date, days: number): Date {
  const d = new Date(input.getTime())
  d.setDate(d.getDate() + days)
  return d
}

