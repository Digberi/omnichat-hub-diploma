import { z } from "zod"

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    WORKERS_PORT: z.coerce.number().int().positive().default(4122),
    // Redis/BullMQ/socket.io namespacing (prevents cross-env interference on shared Redis).
    // If empty, defaults are derived from NODE_ENV at runtime.
    BULLMQ_PREFIX: z.string().optional().or(z.literal("")).default(""),
    SOCKETIO_REDIS_KEY: z.string().optional().or(z.literal("")).default(""),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    LOG_LEVEL: z.string().default("info"),
    OUTBOX_POLL_INTERVAL_SEC: z.coerce.number().int().positive().default(60),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
    OUTBOX_LOCK_TTL_SEC: z.coerce.number().int().positive().default(300),
    MAINTENANCE_INTERVAL_SEC: z.coerce.number().int().positive().default(60),
    METRICS_ROLLUP_INTERVAL_SEC: z.coerce.number().int().positive().default(3600),

    CHANNEL_SYNC_STUB_ENABLED: z.preprocess(
      (v) => {
        if (v === "1" || v === "true" || v === 1 || v === true) return true
        if (v === "0" || v === "false" || v === 0 || v === false) return false
        return v
      },
      z.boolean().default(false),
    ),
    CHANNEL_SYNC_INTERVAL_SEC: z.coerce.number().int().positive().default(60),
    CHANNEL_SYNC_STUB_MAX_ACCOUNTS: z.coerce.number().int().positive().max(50).default(3),
    CHANNEL_SYNC_OLX_ENABLED: z.preprocess(
      (v) => {
        if (v === "1" || v === "true" || v === 1 || v === true) return true
        if (v === "0" || v === "false" || v === 0 || v === false) return false
        return v
      },
      z.boolean().default(false),
    ),
    CHANNEL_SYNC_OLX_MAX_ACCOUNTS: z.coerce.number().int().positive().max(500).default(50),
    CHANNEL_SYNC_OLX_LIMIT: z.coerce.number().int().positive().max(500).default(100),
    CHANNEL_SYNC_PROM_ENABLED: z.preprocess(
      (v) => {
        if (v === "1" || v === "true" || v === 1 || v === true) return true
        if (v === "0" || v === "false" || v === 0 || v === false) return false
        return v
      },
      z.boolean().default(false),
    ),
    CHANNEL_SYNC_PROM_MAX_ACCOUNTS: z.coerce.number().int().positive().max(500).default(50),
    CHANNEL_SYNC_PROM_LIMIT: z.coerce.number().int().positive().max(100).default(100),
    CHANNEL_SYNC_ROZETKA_ENABLED: z.preprocess(
      (v) => {
        if (v === "1" || v === "true" || v === 1 || v === true) return true
        if (v === "0" || v === "false" || v === 0 || v === false) return false
        return v
      },
      z.boolean().default(false),
    ),
    CHANNEL_SYNC_ROZETKA_MAX_ACCOUNTS: z.coerce.number().int().positive().max(500).default(50),
    ROZETKA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
    CHANNEL_SYNC_ROZETKA_ORDERS_ENABLED: z.preprocess(
      (v) => {
        if (v === "1" || v === "true" || v === 1 || v === true) return true
        if (v === "0" || v === "false" || v === 0 || v === false) return false
        return v
      },
      z.boolean().default(false),
    ),
    CHANNEL_SYNC_ROZETKA_ORDERS_LIMIT: z.coerce.number().int().positive().max(200).default(50),
    PROM_API_BASE_URL: z.string().url().default("https://my.prom.ua/api/v1"),
    PROM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    OLX_BASE_URL: z.string().url().default("https://www.olx.ua"),
    OLX_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    INFISICAL_KMS_BASE_URL: z.string().url().default("https://app.infisical.com/api/v1"),
    INFISICAL_CLIENT_ID: z.string().optional().or(z.literal("")).default(""),
    INFISICAL_CLIENT_SECRET: z.string().optional().or(z.literal("")).default(""),
    INFISICAL_KMS_KEY_ID: z.string().optional().or(z.literal("")).default(""),

    PUSH_PROVIDER: z.enum(["console", "expo"]).default("console"),
    EXPO_ACCESS_TOKEN: z.string().optional().or(z.literal("")),

    STORAGE_ENDPOINT: z.string().url().optional().or(z.literal("")),
    STORAGE_REGION: z.string().optional().or(z.literal("")),
    STORAGE_BUCKET: z.string().optional().or(z.literal("")),
    STORAGE_ACCESS_KEY: z.string().optional().or(z.literal("")),
    STORAGE_SECRET_KEY: z.string().optional().or(z.literal("")),
    ATTACHMENT_TTL_DAYS: z.coerce.number().int().positive().default(7),
    STORAGE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    STORAGE_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),
    STORAGE_RETRY_DELAY_MS: z.coerce.number().int().min(10).default(100),

    SENTRY_DSN: z.string().optional().or(z.literal("")),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
    SENTRY_ENVIRONMENT: z.string().optional().or(z.literal("")).default(""),
    SENTRY_RELEASE: z.string().optional().or(z.literal("")).default(""),
    SENTRY_OUTBOX_BACKLOG_WARN: z.coerce.number().int().positive().default(200),
    SENTRY_OUTBOX_BACKLOG_COOLDOWN_SEC: z.coerce.number().int().positive().default(300),
    METRICS_TOKEN: z.string().optional().or(z.literal("")).default(""),
    LOKI_HOST: z.string().optional().or(z.literal("")).default(""),
    LOKI_USERNAME: z.string().optional().or(z.literal("")).default(""),
    LOKI_PASSWORD: z.string().optional().or(z.literal("")).default(""),
    LOKI_BATCH_INTERVAL_SEC: z.coerce.number().int().positive().default(5),
    LOKI_BATCH_MAX_BUFFER: z.coerce.number().int().positive().default(10_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && (!env.METRICS_TOKEN || env.METRICS_TOKEN.length < 16)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["METRICS_TOKEN"],
        message: "METRICS_TOKEN (16+ chars) is required when NODE_ENV=production",
      })
    }

    const lokiConfigured = Boolean(env.LOKI_HOST || env.LOKI_USERNAME || env.LOKI_PASSWORD)
    if (lokiConfigured) {
      const missing = [
        ["LOKI_HOST", env.LOKI_HOST],
        ["LOKI_USERNAME", env.LOKI_USERNAME],
        ["LOKI_PASSWORD", env.LOKI_PASSWORD],
      ] as const
      for (const [k, v] of missing) {
        if (!v || v.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [k],
            message: `${k} is required when Loki logging is configured`,
          })
        }
      }
    }

    if (env.CHANNEL_SYNC_OLX_ENABLED || env.CHANNEL_SYNC_PROM_ENABLED || env.CHANNEL_SYNC_ROZETKA_ENABLED || env.CHANNEL_SYNC_ROZETKA_ORDERS_ENABLED) {
      if (!env.INFISICAL_CLIENT_ID || env.INFISICAL_CLIENT_ID.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["INFISICAL_CLIENT_ID"],
          message: "INFISICAL_CLIENT_ID is required when channel sync is enabled",
        })
      }
      if (!env.INFISICAL_CLIENT_SECRET || env.INFISICAL_CLIENT_SECRET.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["INFISICAL_CLIENT_SECRET"],
          message: "INFISICAL_CLIENT_SECRET is required when channel sync is enabled",
        })
      }
      if (!env.INFISICAL_KMS_KEY_ID || env.INFISICAL_KMS_KEY_ID.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["INFISICAL_KMS_KEY_ID"],
          message: "INFISICAL_KMS_KEY_ID is required when channel sync is enabled",
        })
      }
    }
  })

export type WorkersEnv = z.infer<typeof envSchema>
