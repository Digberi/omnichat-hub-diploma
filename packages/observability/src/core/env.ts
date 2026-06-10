import { z } from "zod"

const baseSchema = z.object({
  OBS_ENABLED: z.string().default("0"),
})

const enabledSchema = z.object({
  OBS_ENABLED: z.literal("1"),
  OBS_DEPLOYMENT_ENV: z.string().min(1, "OBS_DEPLOYMENT_ENV is required when OBS_ENABLED=1"),
  OBS_SERVICE_VERSION: z.string().optional(),
  OBS_OTLP_ENDPOINT: z.string().url("OBS_OTLP_ENDPOINT must be a URL"),
  OBS_OTLP_HEADERS: z.string().optional(),
  OBS_LOG_LEVEL_OVERRIDE: z.string().optional(),
  OBS_EXTRA_REDACT_KEYS: z.string().optional(),
})

export type DisabledObsEnv = { enabled: false }

export type EnabledObsEnv = {
  enabled: true
  deploymentEnv: string
  serviceVersion: string | undefined
  otlpEndpoint: string
  otlpHeaders: Record<string, string>
  logLevelOverride: string | undefined
  extraRedactKeys: string[]
}

export type ObsEnv = DisabledObsEnv | EnabledObsEnv

function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  const out: Record<string, string> = {}
  for (const pair of raw.split(",")) {
    const [k, ...vRest] = pair.split("=")
    if (k && vRest.length > 0) out[k.trim()] = vRest.join("=").trim()
  }
  return out
}

export function parseObsEnv(): ObsEnv {
  const base = baseSchema.parse(process.env)
  if (base.OBS_ENABLED !== "1") return { enabled: false }

  const enabled = enabledSchema.parse(process.env)

  if (enabled.OBS_OTLP_ENDPOINT.includes("grafana.net") && enabled.OBS_DEPLOYMENT_ENV !== "production") {
    throw new Error(
      `production-env guard: OBS_OTLP_ENDPOINT points to grafana.net but OBS_DEPLOYMENT_ENV='${enabled.OBS_DEPLOYMENT_ENV}'. Refusing to start to prevent dev pollution of prod telemetry.`,
    )
  }

  return {
    enabled: true,
    deploymentEnv: enabled.OBS_DEPLOYMENT_ENV,
    serviceVersion: enabled.OBS_SERVICE_VERSION,
    otlpEndpoint: enabled.OBS_OTLP_ENDPOINT,
    otlpHeaders: parseHeaders(enabled.OBS_OTLP_HEADERS),
    logLevelOverride: enabled.OBS_LOG_LEVEL_OVERRIDE,
    extraRedactKeys: enabled.OBS_EXTRA_REDACT_KEYS
      ? enabled.OBS_EXTRA_REDACT_KEYS.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
  }
}
