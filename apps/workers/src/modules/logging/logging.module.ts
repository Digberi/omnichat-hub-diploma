import { Module } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { buildPinoStream, getLoggerProvider } from "@omnichat/observability/node"
import { LoggerModule } from "nestjs-pino"
import { levels as pinoLevels, multistream, transport as buildTransport } from "pino"
import { randomUUID } from "crypto"
import { Writable } from "node:stream"

/**
 * Pino's `levels.values` maps level names to numeric weights where lower
 * numbers are more verbose (trace=10 ... fatal=60). To pick the more
 * verbose of two levels we want the smaller numeric value. Unknown labels
 * fall back to `info` (30) so a typo never silently silences a stream.
 */
function pickMostVerbose(a: string, b: string): string {
  const values = pinoLevels.values as Record<string, number>
  const aNum = values[a] ?? 30
  const bNum = values[b] ?? 30
  return aNum <= bNum ? a : b
}

function resolveLokiConfig(rawHost: string): { host: string; endpoint?: string } {
  const host = rawHost.trim()
  if (host.length === 0) return { host }

  try {
    const url = new URL(host)
    const endpoint = `${url.pathname || ""}${url.search || ""}`.trim()
    return {
      host: url.origin,
      ...(endpoint && endpoint !== "/" ? { endpoint } : {}),
    }
  } catch {
    return { host }
  }
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const level = config.get<string>("LOG_LEVEL") ?? "info"
        const isDev = (config.get<string>("NODE_ENV") ?? "development") === "development"
        const lokiHost = String(config.get("LOKI_HOST") ?? "").trim()
        const lokiUsername = String(config.get("LOKI_USERNAME") ?? "").trim()
        const lokiPassword = String(config.get("LOKI_PASSWORD") ?? "").trim()
        const lokiConfig = resolveLokiConfig(lokiHost)
        const lokiEnabled = lokiHost.length > 0 && lokiUsername.length > 0 && lokiPassword.length > 0
        const obsEnabled = String(config.get("OBS_ENABLED") ?? "0") === "1"

        const prettyTarget = {
          target: "pino-pretty",
          options: { colorize: true, singleLine: true },
        }
        const stdoutTarget = {
          target: "pino/file",
          options: { destination: 1 },
        }

        const targets: any[] = []
        if (isDev) {
          targets.push(prettyTarget)
        } else {
          targets.push(stdoutTarget)
        }

        // When OBS_ENABLED=1 the OTel pino stream ships logs to the collector
        // which forwards to Loki — adding pino-loki here would double-write the
        // same records to Loki (collector path + direct path). The OTel path
        // wins because it preserves trace_id/span_id correlation.
        if (lokiEnabled && !obsEnabled) {
          targets.push({
            target: "pino-loki",
            level,
            options: {
              host: lokiConfig.host,
              ...(lokiConfig.endpoint ? { endpoint: lokiConfig.endpoint } : {}),
              basicAuth: {
                username: lokiUsername,
                password: lokiPassword,
              },
              labels: {
                app: "omnichat",
                service: "workers",
                environment: config.get<string>("NODE_ENV") ?? "development",
              },
              batching: {
                interval: Number(config.get("LOKI_BATCH_INTERVAL_SEC") ?? 5),
                maxBufferSize: Number(config.get("LOKI_BATCH_MAX_BUFFER") ?? 10000),
              },
              silenceErrors: isDev,
            },
          })
        }

        const transportSpec =
          targets.length === 1 && targets[0]?.target === "pino-pretty"
            ? prettyTarget
            : { targets }

        // OBS_LOG_LEVEL_OVERRIDE lets ops dial the OTel/Loki stream level
        // independently of the local stdout level. Falls back to LOG_LEVEL
        // when unset.
        const obsLogLevelOverride = String(config.get("OBS_LOG_LEVEL_OVERRIDE") ?? "").trim()
        const otelLevel = obsLogLevelOverride.length > 0 ? obsLogLevelOverride : level

        // Pino drops records below the root logger's `level` BEFORE multistream
        // sees them — so a per-stream level can only filter further down, never
        // up. To let the OTel stream use a more-verbose OBS_LOG_LEVEL_OVERRIDE
        // than LOG_LEVEL, the root logger must be set to whichever of the two
        // is more verbose. Per-stream levels then trim each branch back down.
        const baseLevel = obsEnabled ? pickMostVerbose(level, otelLevel) : level

        const basePinoHttp: any = {
          level: baseLevel,
          genReqId: (_req: any, res: any) => {
            const id = randomUUID()
            res?.setHeader?.("x-request-id", id)
            return id
          },
        }

        if (obsEnabled) {
          // Tee logs to OTel as an additional stream while keeping the existing
          // stdout/pretty pipeline intact. In prod we deliberately bypass
          // pino.transport() (= worker thread) for the stdout target and use
          // a plain Writable: mixing a ThreadStream and a regular Writable in
          // pino.multistream caused the regular Writable to never receive log
          // lines (collector saw 0 log records from api/workers though traces
          // flowed). See apps/api logging module for details.
          // See apps/api/src/modules/logging/logging.module.ts for rationale --
          // direct LoggerProvider binding sidesteps the global plumbing that
          // left logger.emit() as a silent no-op in our prod runtime.
          const otelStream = buildPinoStream(getLoggerProvider())

          if (isDev) {
            const standardStream = buildTransport(transportSpec as any)
            const combined = multistream([
              { stream: standardStream, level: level as any },
              { stream: otelStream, level: otelLevel as any },
            ])
            return {
              pinoHttp: {
                ...basePinoHttp,
                stream: combined,
              },
            }
          }

          const stdoutStream = new Writable({
            write(chunk, _enc, cb) {
              process.stdout.write(chunk)
              cb()
            },
          })
          const combined = multistream([
            { stream: stdoutStream, level: level as any },
            { stream: otelStream, level: otelLevel as any },
          ])

          return {
            pinoHttp: {
              ...basePinoHttp,
              stream: combined,
            },
          }
        }

        return {
          pinoHttp: {
            ...basePinoHttp,
            transport: transportSpec,
          },
        }
      },
    }),
  ],
})
export class LoggingModule {}
