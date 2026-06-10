import { z } from "zod"

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4121),
    // Redis/BullMQ/socket.io namespacing (prevents cross-env interference on shared Redis).
    // If empty, defaults are derived from NODE_ENV at runtime.
    BULLMQ_PREFIX: z.string().optional().or(z.literal("")).default(""),
    SOCKETIO_REDIS_KEY: z.string().optional().or(z.literal("")).default(""),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    CORS_ORIGINS: z.string().default("http://localhost:3000"),
    LOG_LEVEL: z.string().default("info"),
    SEARCH_DEFAULT_DAYS: z.coerce.number().int().positive().default(7),
    PUBLIC_WEB_URL: z.string().optional().or(z.literal("")).default(""),
    SHORTLINK_TTL_DAYS: z.coerce.number().int().positive().default(7),
    STORAGE_ENDPOINT: z.string().url().optional().or(z.literal("")),
    STORAGE_REGION: z.string().optional().or(z.literal("")),
    STORAGE_BUCKET: z.string().optional().or(z.literal("")),
    STORAGE_ACCESS_KEY: z.string().optional().or(z.literal("")),
    STORAGE_SECRET_KEY: z.string().optional().or(z.literal("")),
    ATTACHMENT_TTL_DAYS: z.coerce.number().int().positive().default(7),
    STORAGE_APPLY_LIFECYCLE: z.preprocess(
      (v) => {
        if (v === "" || v == null) return undefined
        if (v === "1" || v === "true" || v === 1 || v === true) return true
        if (v === "0" || v === "false" || v === 0 || v === false) return false
        return v
      },
      z.boolean().optional(),
    ),
    STORAGE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    STORAGE_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),
    STORAGE_RETRY_DELAY_MS: z.coerce.number().int().min(10).default(100),
    STORAGE_ALERT_PING_MAX_AGE_MS: z.coerce.number().int().positive().default(120_000),
    STORAGE_ALERT_FAILURE_RATE_WARN_PCT: z.coerce.number().min(0).max(100).default(5),
    STORAGE_ALERT_FAILURE_RATE_CRITICAL_PCT: z.coerce.number().min(0).max(100).default(20),
    STORAGE_ALERT_AVG_DURATION_WARN_MS: z.coerce.number().int().positive().default(1500),
    STORAGE_ALERT_AVG_DURATION_CRITICAL_MS: z.coerce.number().int().positive().default(4000),
    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    JWT_ACCESS_TTL_MIN: z.coerce.number().int().positive().default(15),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
    AUTH_OTP_PEPPER: z.string().min(16),
    AUTH_OTP_TTL_MIN: z.coerce.number().int().positive().default(10),
    AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    AUTH_OTP_FIXED_CODE: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
    ),
    EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
    EMAIL_FROM: z.string().optional().or(z.literal("")).default(""),
    EMAIL_REPLY_TO: z.string().optional().or(z.literal("")).default(""),
    RESEND_API_KEY: z.string().optional().or(z.literal("")).default(""),
    INFISICAL_KMS_BASE_URL: z.string().url().default("https://app.infisical.com/api/v1"),
    INFISICAL_CLIENT_ID: z.string().optional().or(z.literal("")).default(""),
    INFISICAL_CLIENT_SECRET: z.string().optional().or(z.literal("")).default(""),
    INFISICAL_KMS_KEY_ID: z.string().optional().or(z.literal("")).default(""),
    SENTRY_DSN: z.string().optional().or(z.literal("")),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
    SENTRY_ENVIRONMENT: z.string().optional().or(z.literal("")).default(""),
    SENTRY_RELEASE: z.string().optional().or(z.literal("")).default(""),
    METRICS_TOKEN: z.string().optional().or(z.literal("")).default(""),
    LOKI_HOST: z.string().optional().or(z.literal("")).default(""),
    LOKI_USERNAME: z.string().optional().or(z.literal("")).default(""),
    LOKI_PASSWORD: z.string().optional().or(z.literal("")).default(""),
    LOKI_BATCH_INTERVAL_SEC: z.coerce.number().int().positive().default(5),
    LOKI_BATCH_MAX_BUFFER: z.coerce.number().int().positive().default(10_000),
    PROM_API_BASE_URL: z.string().url().default("https://my.prom.ua/api/v1"),
    PROM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    ROZETKA_API_BASE_URL: z.string().url().default("https://api-seller.rozetka.com.ua"),
    ROZETKA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    // Optional OLX OAuth integration (disabled unless configured).
    OLX_BASE_URL: z.string().url().default("https://www.olx.ua"),
    OLX_CLIENT_ID: z.string().optional().or(z.literal("")).default(""),
    OLX_CLIENT_SECRET: z.string().optional().or(z.literal("")).default(""),
    OLX_REDIRECT_URL: z.string().optional().or(z.literal("")).default(""),
    OLX_SCOPE: z.string().default("read write v2"),
    OLX_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    // Optional auth providers (disabled unless configured).
    GOOGLE_CLIENT_ID: z.string().optional().or(z.literal("")).default(""),
    GOOGLE_CLIENT_SECRET: z.string().optional().or(z.literal("")).default(""),
    GOOGLE_CALLBACK_URL: z.string().optional().or(z.literal("")).default(""),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_OTP_FIXED_CODE && env.NODE_ENV === "production") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_OTP_FIXED_CODE"],
        message: "AUTH_OTP_FIXED_CODE is not allowed when NODE_ENV=production",
      })
    }

    if (env.NODE_ENV === "production") {
      const required = [
        ["STORAGE_ENDPOINT", env.STORAGE_ENDPOINT],
        ["STORAGE_BUCKET", env.STORAGE_BUCKET],
        ["STORAGE_ACCESS_KEY", env.STORAGE_ACCESS_KEY],
        ["STORAGE_SECRET_KEY", env.STORAGE_SECRET_KEY],
      ] as const
      for (const [k, v] of required) {
        if (!v || v.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [k],
            message: `${k} is required when NODE_ENV=production`,
          })
        }
      }

      if (!env.METRICS_TOKEN || env.METRICS_TOKEN.length < 16) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["METRICS_TOKEN"],
          message: "METRICS_TOKEN (16+ chars) is required when NODE_ENV=production",
        })
      }
    }

    if (env.EMAIL_PROVIDER === "resend") {
      if (!env.EMAIL_FROM || env.EMAIL_FROM.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["EMAIL_FROM"],
          message: "EMAIL_FROM is required when EMAIL_PROVIDER=resend",
        })
      }
      if (!env.RESEND_API_KEY || env.RESEND_API_KEY.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["RESEND_API_KEY"],
          message: "RESEND_API_KEY is required when EMAIL_PROVIDER=resend",
        })
      }
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

    const olxConfigured = Boolean(env.OLX_CLIENT_ID || env.OLX_CLIENT_SECRET)
    if (olxConfigured) {
      const missing = [
        ["OLX_CLIENT_ID", env.OLX_CLIENT_ID],
        ["OLX_CLIENT_SECRET", env.OLX_CLIENT_SECRET],
        ["OLX_REDIRECT_URL", env.OLX_REDIRECT_URL],
      ] as const
      for (const [k, v] of missing) {
        if (!v || v.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [k],
            message: `${k} is required when OLX OAuth is configured`,
          })
        }
      }
      if (!env.INFISICAL_CLIENT_ID || env.INFISICAL_CLIENT_ID.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["INFISICAL_CLIENT_ID"],
          message: "INFISICAL_CLIENT_ID is required when OLX OAuth is configured",
        })
      }
      if (!env.INFISICAL_CLIENT_SECRET || env.INFISICAL_CLIENT_SECRET.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["INFISICAL_CLIENT_SECRET"],
          message: "INFISICAL_CLIENT_SECRET is required when OLX OAuth is configured",
        })
      }
      if (!env.INFISICAL_KMS_KEY_ID || env.INFISICAL_KMS_KEY_ID.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["INFISICAL_KMS_KEY_ID"],
          message: "INFISICAL_KMS_KEY_ID is required when OLX OAuth is configured",
        })
      }
    }
  })

export type ApiEnv = z.infer<typeof envSchema>
