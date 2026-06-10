export const REDACTED = "[REDACTED]"

const KEY_PATTERNS = [
  /^authorization$/i,
  /^x-api-key$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /token/i,
  /secret/i,
  /password/i,
  /^refresh_token$/i,
  /^access_token$/i,
  /^otp_code$/i,
  /^otp_pepper$/i,
  /^channel_token$/i,
  /^jwt$/i,
]

const VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]"],
  [/sntryu_[a-z0-9]{60,}/g, REDACTED],
  [/dop_v1_[a-z0-9]{64}/g, REDACTED],
  [/glsa_[a-zA-Z0-9_-]+/g, REDACTED],
]

/**
 * Apply value-pattern scrubbing to a raw string. Used by callers that need
 * to redact bearer/token patterns embedded in a single string (e.g. an OTLP
 * log body, an Error.message, or an Error.stack), where the top-level
 * `redact()` would otherwise pass the string through untouched only if it
 * were nested inside an object key.
 */
export function redactString(input: string): string {
  let out = input
  for (const [pattern, replacement] of VALUE_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

const MAX_DEPTH = 8
const MAX_ARRAY_ITEMS = 100

export interface RedactOptions {
  extraKeys?: string[]
}

export function createRedactor(options: RedactOptions = {}) {
  const allKeyPatterns = [
    ...KEY_PATTERNS,
    ...(options.extraKeys ?? []).map((k) => new RegExp(`^${escapeRegex(k)}$`, "i")),
  ]

  function shouldRedactKey(key: string): boolean {
    return allKeyPatterns.some((p) => p.test(key))
  }

  function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
    if (depth > MAX_DEPTH) return REDACTED
    if (value === null || value === undefined) return value
    if (typeof value === "string") {
      let out = value
      for (const [pattern, replacement] of VALUE_PATTERNS) {
        out = out.replace(pattern, replacement)
      }
      return out
    }
    if (typeof value === "number" || typeof value === "boolean") return value
    if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") return String(value)

    if (Array.isArray(value)) {
      if (seen.has(value)) return REDACTED
      seen.add(value)
      const truncated: unknown[] = value.slice(0, MAX_ARRAY_ITEMS).map((v) => redactValue(v, depth + 1, seen))
      if (value.length > MAX_ARRAY_ITEMS) {
        truncated.push(`[...${value.length - MAX_ARRAY_ITEMS} more]`)
      }
      return truncated
    }

    if (value instanceof Error) {
      // Scrub bearer/api-token patterns from message + stack while preserving
      // structure (file paths, line numbers, etc.) for debugging. The
      // KEY-pattern rules intentionally do NOT apply to `stack` so a stack
      // frame referencing a path containing the word "authorization" is
      // kept intact; we only strip embedded credentials via VALUE_PATTERNS.
      const out: Record<string, unknown> = {
        name: value.name,
        message: redactString(value.message),
        stack: value.stack ? redactString(value.stack) : undefined,
      }
      if ((value as Error & { cause?: unknown }).cause !== undefined) {
        out.cause = redactValue((value as Error & { cause: unknown }).cause, depth + 1, seen)
      }
      return out
    }

    if (typeof value === "object") {
      if (seen.has(value as object)) return REDACTED
      seen.add(value as object)
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === "stack" || k === "message") {
          // Pino serializes Error to a plain object before redact() runs, so
          // those errors take this branch (not the `instanceof Error` branch
          // above). Preserve structure (don't replace whole stack with
          // [REDACTED]) but scrub embedded token patterns from string values.
          // Non-string values fall back to normal redact recursion so we
          // don't accidentally pass through raw objects unredacted.
          out[k] = typeof v === "string" ? redactString(v) : redactValue(v, depth + 1, seen)
        } else if (shouldRedactKey(k)) {
          out[k] = REDACTED
        } else {
          out[k] = redactValue(v, depth + 1, seen)
        }
      }
      return out
    }

    return value
  }

  return {
    redact<T>(input: T): T {
      return redactValue(input, 0, new WeakSet()) as T
    },
  }
}

let defaultRedactor = createRedactor()

/**
 * Replace the process-wide default redactor used by the bare {@link redact}
 * export. Bootstrap calls this once after parsing OBS_EXTRA_REDACT_KEYS so
 * that operator-supplied key patterns take effect for the pino transport,
 * the Nest interceptor, and any other call site that imports `redact` as a
 * value.
 *
 * Mutating module-level state is a deliberate trade: it keeps the call sites
 * (including ones we don't own, e.g. `redact` re-exported via barrels)
 * simple, and bootstrap is the single writer. Tests reset by calling
 * `setDefaultRedactor({})`.
 */
export function setDefaultRedactor(options: RedactOptions = {}): void {
  defaultRedactor = createRedactor(options)
}

export function redact<T>(input: T): T {
  return defaultRedactor.redact(input)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
