import { afterEach, describe, expect, it } from "vitest"
import { redact, REDACTED, createRedactor, redactString, setDefaultRedactor } from "./redact"

describe("redact", () => {
  it("redacts authorization header value", () => {
    expect(redact({ authorization: "Bearer abc123" })).toEqual({ authorization: REDACTED })
  })

  it("redacts case-insensitive Authorization", () => {
    expect(redact({ Authorization: "Bearer xyz" })).toEqual({ Authorization: REDACTED })
  })

  it("redacts any *_token key", () => {
    expect(redact({ access_token: "x", channel_token: "y", random_token_blob: "z" }))
      .toEqual({ access_token: REDACTED, channel_token: REDACTED, random_token_blob: REDACTED })
  })

  it("redacts *_secret and *_password keys", () => {
    expect(redact({ jwt_secret: "x", user_password: "y" }))
      .toEqual({ jwt_secret: REDACTED, user_password: REDACTED })
  })

  it("redacts otp_code, otp_pepper, channel_token, jwt", () => {
    expect(redact({ otp_code: "1", otp_pepper: "2", channel_token: "3", jwt: "4" }))
      .toEqual({ otp_code: REDACTED, otp_pepper: REDACTED, channel_token: REDACTED, jwt: REDACTED })
  })

  it("redacts Bearer pattern in string values", () => {
    expect(redact("called with Authorization: Bearer abc.def-ghi"))
      .toBe("called with Authorization: Bearer [REDACTED]")
  })

  it("redacts Sentry user token pattern", () => {
    const t = "sntryu_" + "a".repeat(60)
    expect(redact(`token=${t}`)).toContain("[REDACTED]")
  })

  it("redacts DigitalOcean token pattern", () => {
    const t = "dop_v1_" + "a".repeat(64)
    expect(redact({ note: `using ${t}` })).toEqual({ note: expect.stringContaining("[REDACTED]") })
  })

  it("walks nested objects recursively", () => {
    const input = { request: { headers: { authorization: "Bearer x" } }, body: { ok: true } }
    const result = redact(input) as any
    expect(result.request.headers.authorization).toBe(REDACTED)
    expect(result.body.ok).toBe(true)
  })

  it("does NOT redact error.stack", () => {
    const err = new Error("oh no")
    err.stack = "Error: oh no\n  at /authorization/path/file.ts"
    const result = redact({ err }) as any
    expect(result.err.stack).toContain("/authorization/path/")
  })

  it("redacts error.cause properties", () => {
    const cause = { token: "secret" }
    const result = redact({ err: { name: "E", message: "m", cause } }) as any
    expect(result.err.cause.token).toBe(REDACTED)
  })

  it("scrubs Bearer tokens from Error.message", () => {
    const err = new Error("fetch Authorization: Bearer abc123def failed")
    const result = redact({ err }) as any
    expect(result.err.message).toContain("Bearer [REDACTED]")
    expect(result.err.message).not.toContain("abc123def")
  })

  it("scrubs token patterns from Error.stack while preserving structure", () => {
    const err = new Error("oh no")
    err.stack = `Error: oh no\n  at fetch (https://api/path?token=sntryu_${"a".repeat(60)})`
    const result = redact({ err }) as any
    expect(result.err.stack).toContain("[REDACTED]")
    expect(result.err.stack).not.toContain("sntryu_aaaa")
    // Structure (frames, error header) preserved so it remains useful for debugging.
    expect(result.err.stack).toContain("Error: oh no")
    expect(result.err.stack).toContain("at fetch")
  })

  it("scrubs token patterns from plain-object err.stack (pino-serialized error)", () => {
    const obj = {
      err: {
        type: "Error",
        message: "fetch failed",
        stack: `Error: fetch failed\n  at https://api/path?token=sntryu_${"a".repeat(60)}`,
      },
    }
    const result = redact(obj) as any
    expect(result.err.stack).not.toContain("sntryu_aaaa")
    expect(result.err.stack).toContain("[REDACTED]")
    // Structure preserved so the stack remains useful for debugging.
    expect(result.err.stack).toContain("Error: fetch failed")
  })

  it("scrubs token patterns from plain-object err.message", () => {
    const obj = { err: { message: "Bearer abc.def-ghi failed", stack: "..." } }
    const result = redact(obj) as any
    expect(result.err.message).toBe("Bearer [REDACTED] failed")
  })

  it("does not break for non-string stack/message values", () => {
    const obj = { err: { message: 42, stack: null } }
    const result = redact(obj) as any
    expect(result.err.message).toBe(42)
    expect(result.err.stack).toBe(null)
  })

  it("is idempotent: redact(redact(x)) === redact(x)", () => {
    const x = { authorization: "Bearer abc", nested: { token: "t" } }
    expect(redact(redact(x))).toEqual(redact(x))
  })

  it("handles arrays, truncating large ones", () => {
    const arr = Array.from({ length: 150 }, (_, i) => ({ token: `t${i}` }))
    const result = redact(arr) as any[]
    expect(result.length).toBeLessThan(150)
    expect(result[result.length - 1]).toMatch(/more/)
  })

  it("supports extra keys via createRedactor", () => {
    const { redact: customRedact } = createRedactor({ extraKeys: ["foo"] })
    expect(customRedact({ foo: "bar", normal: "ok" })).toEqual({ foo: REDACTED, normal: "ok" })
  })

  it("respects max recursion depth (anti-cycle)", () => {
    const cyclic: any = { a: 1 }
    cyclic.self = cyclic
    expect(() => redact(cyclic)).not.toThrow()
  })
})

describe("setDefaultRedactor", () => {
  // Default-redactor mutation is process-wide; reset after each test so
  // ordering between this block and the rest of the suite doesn't matter.
  afterEach(() => {
    setDefaultRedactor({})
  })

  it("setDefaultRedactor extends key patterns at runtime", () => {
    setDefaultRedactor({ extraKeys: ["sessionBlob"] })
    expect(redact({ sessionBlob: "secret" })).toEqual({ sessionBlob: REDACTED })
    expect(redact({ normal: "ok" })).toEqual({ normal: "ok" })
  })

  it("setDefaultRedactor() with empty extraKeys resets to default behavior", () => {
    setDefaultRedactor({ extraKeys: ["sessionBlob"] })
    setDefaultRedactor({})
    expect(redact({ sessionBlob: "now-not-redacted" })).toEqual({ sessionBlob: "now-not-redacted" })
  })
})

describe("redactString", () => {
  it("scrubs Bearer tokens in raw strings", () => {
    expect(redactString("called with Authorization: Bearer abc.def-ghi")).toBe(
      "called with Authorization: Bearer [REDACTED]",
    )
  })

  it("scrubs sntryu_, dop_v1_, and glsa_ tokens", () => {
    expect(redactString(`token=${"sntryu_" + "a".repeat(60)}`)).toContain("[REDACTED]")
    expect(redactString(`token=${"dop_v1_" + "a".repeat(64)}`)).toContain("[REDACTED]")
    expect(redactString(`token=glsa_${"a".repeat(40)}`)).toContain("[REDACTED]")
  })
})
