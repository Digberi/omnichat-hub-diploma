import { Writable } from "node:stream"

import { context, trace } from "@opentelemetry/api"
import { logs, SeverityNumber, type LogAttributes, type Logger } from "@opentelemetry/api-logs"
import type { LoggerProvider } from "@opentelemetry/sdk-logs"

import { redact, redactString } from "../core/redact"

/**
 * Map pino numeric levels to OpenTelemetry SeverityNumber values.
 * Pino: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal.
 */
const SEVERITY_NUMBER_BY_LEVEL: Record<number, SeverityNumber> = {
  10: SeverityNumber.TRACE,
  20: SeverityNumber.DEBUG,
  30: SeverityNumber.INFO,
  40: SeverityNumber.WARN,
  50: SeverityNumber.ERROR,
  60: SeverityNumber.FATAL,
}

const SEVERITY_TEXT_BY_LEVEL: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
}

/**
 * Build a Writable stream that pino can pipe to. Each line is parsed,
 * redacted, and forwarded as an OTel LogRecord via the global LoggerProvider.
 *
 * - Non-JSON lines (e.g. pino-pretty output) are silently dropped — pino
 *   should never crash because of bad bridging.
 * - The active span context (if any) is attached to the record so the
 *   collector/Loki can join logs to traces.
 */
/**
 * @param provider Optional LoggerProvider. When supplied, the stream binds
 *   directly to this provider's logger -- the recommended path, because the
 *   global setGlobalLoggerProvider plumbing has been observed to leave
 *   logger.emit() silently no-op'd in our prod runtime. When omitted (legacy
 *   callers and tests), falls back to the global logs.getLogger.
 */
export function buildPinoStream(provider?: LoggerProvider): Writable {
  const logger: Logger = provider
    ? provider.getLogger("@omnichat/observability/node")
    : logs.getLogger("@omnichat/observability/node")

  return new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      try {
        const line = typeof chunk === "string" ? chunk : chunk.toString()
        const parsed = JSON.parse(line) as Record<string, unknown>
        const level = typeof parsed.level === "number" ? parsed.level : 30
        const severityNumber = SEVERITY_NUMBER_BY_LEVEL[level] ?? SeverityNumber.INFO
        const severityText = SEVERITY_TEXT_BY_LEVEL[level] ?? "INFO"

        const {
          msg,
          time: _time,
          level: _level,
          pid: _pid,
          hostname: _hostname,
          ...rest
        } = parsed
        const redacted = redact(rest)

        const span = trace.getActiveSpan()
        const spanCtx = span?.spanContext()

        // The log body is the user-supplied message string (or, when the call
        // site passed only an object with no `msg`, a JSON dump of the
        // structured fields). Either form may contain a Bearer token, a
        // Sentry/DigitalOcean/Grafana key, or a key matching one of the
        // KEY_PATTERNS (e.g. `authorization`). For the string form we only
        // need value-pattern scrubbing; for the object fallback we MUST run
        // the full key-aware redactor first, otherwise raw token values
        // attached under known-bad keys (which the value patterns cannot
        // detect) ship to Loki verbatim. We use the already-redacted `rest`
        // to avoid recomputing.
        const body =
          typeof msg === "string" ? redactString(msg) : JSON.stringify(redacted)

        logger.emit({
          severityText,
          severityNumber,
          body,
          attributes: redacted as LogAttributes,
          context: context.active(),
          ...(spanCtx ? { traceId: spanCtx.traceId, spanId: spanCtx.spanId } : {}),
        })
      } catch {
        // Best-effort — swallow errors so a malformed line never breaks pino.
      }
      cb()
    },
  })
}
