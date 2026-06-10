export interface SampleOptions {
  parentSampled?: boolean
}

export interface AtSpanEndInput {
  status: "OK" | "ERROR" | "UNSET"
  probabilityKept: boolean
  recordedException?: boolean
}

export function decideSample(traceId: string, probability: number, options: SampleOptions = {}): boolean {
  if (options.parentSampled !== undefined) return options.parentSampled
  if (probability >= 1) return true
  if (probability <= 0) return false
  // Take last 16 hex chars (8 bytes) of the trace ID, treat as uint64.
  const slice = traceId.slice(-16)
  const value = BigInt("0x" + slice)
  // Compare value against (probability * 2^64). Use Number for the threshold since BigInt math with floats is awkward.
  const threshold = BigInt(Math.floor(probability * Number(0xffff_ffff_ffff_ffffn)))
  return value < threshold
}

export function decideAtSpanEnd(input: AtSpanEndInput): boolean {
  if (input.status === "ERROR") return true
  if (input.recordedException) return true
  return input.probabilityKept
}
