import * as pulumi from "@pulumi/pulumi"

import type { DeploymentConfig } from "./config"

type EnvScope = "RUN_TIME" | "RUN_AND_BUILD_TIME"

export type InfisicalRuntime = {
  /** Computed from infisicalSiteUrl + "/api/v1" */
  baseUrl: pulumi.Input<string>
  /** Universal Auth client ID (UUID, not a secret) retrieved from Infisical Secrets */
  clientId: pulumi.Input<string>
  /** Universal Auth client secret retrieved from Infisical Secrets */
  clientSecret: pulumi.Input<string>
  /** The KMS key ID created by InfisicalKmsKey */
  kmsKeyId: pulumi.Input<string>
}

export type RuntimeDependencies = {
  databaseUrl: pulumi.Input<string>
  redisUrl: pulumi.Input<string>
  spacesEndpoint: pulumi.Input<string>
  spacesBucketName: pulumi.Input<string>
  spacesAccessKey: pulumi.Input<string>
  spacesSecretKey: pulumi.Input<string>
  lokiHost?: pulumi.Input<string>
  lokiUsername?: pulumi.Input<string>
  lokiPassword?: pulumi.Input<string>
  prometheusRemoteWriteUrl?: pulumi.Input<string>
  prometheusUsername?: pulumi.Input<string>
  prometheusPassword?: pulumi.Input<string>
  otelCollectorEndpoint?: pulumi.Input<string>
  otelCollectorAuthToken?: pulumi.Input<string>
  /**
   * Public-no-auth OTLP/HTTP endpoint for browser + Expo clients (port 4319,
   * CORS-gated). Surfaced into NEXT_PUBLIC_OBS_OTLP_ENDPOINT and
   * EXPO_PUBLIC_OBS_OTLP_ENDPOINT so client bundles don't have to ship a Bearer
   * token.
   */
  otelCollectorClientEndpoint?: pulumi.Input<string>
}

function generalEnv(key: string, value: pulumi.Input<string>, scope: EnvScope = "RUN_TIME") {
  return { key, value, scope, type: "GENERAL" } as any
}

function secretEnv(key: string, value: pulumi.Input<string>, scope: EnvScope = "RUN_TIME") {
  return { key, value, scope, type: "SECRET" } as any
}

export function buildApiEnvs(
  config: DeploymentConfig,
  deps: RuntimeDependencies,
  infisical: InfisicalRuntime | undefined,
): any[] {
  const envs: any[] = [
    generalEnv("NODE_ENV", "production"),
    generalEnv("PORT", "4121"),
    secretEnv("DATABASE_URL", deps.databaseUrl),
    secretEnv("REDIS_URL", deps.redisUrl),
    secretEnv("JWT_ACCESS_SECRET", config.apiJwtAccessSecret),
    secretEnv("JWT_REFRESH_SECRET", config.apiJwtRefreshSecret),
    secretEnv("AUTH_OTP_PEPPER", config.apiAuthOtpPepper),
    ...(infisical
      ? [
          generalEnv("INFISICAL_KMS_BASE_URL", infisical.baseUrl),
          generalEnv("INFISICAL_CLIENT_ID", infisical.clientId),
          secretEnv("INFISICAL_CLIENT_SECRET", infisical.clientSecret),
          secretEnv("INFISICAL_KMS_KEY_ID", infisical.kmsKeyId),
        ]
      : []),
    secretEnv("METRICS_TOKEN", config.apiMetricsToken),
    generalEnv("JWT_ACCESS_TTL_MIN", "15"),
    generalEnv("JWT_REFRESH_TTL_DAYS", "30"),
    generalEnv("AUTH_OTP_TTL_MIN", "10"),
    generalEnv("AUTH_OTP_MAX_ATTEMPTS", "5"),
    generalEnv("CORS_ORIGINS", pulumi.interpolate`https://${config.appDomain}`),
    generalEnv("PUBLIC_WEB_URL", pulumi.interpolate`https://${config.appDomain}`),
    generalEnv("WS_ALLOWED_ORIGINS", pulumi.interpolate`https://${config.appDomain}`),
    generalEnv("STORAGE_ENDPOINT", deps.spacesEndpoint),
    generalEnv("STORAGE_REGION", config.spacesRegion),
    generalEnv("STORAGE_BUCKET", deps.spacesBucketName),
    secretEnv("STORAGE_ACCESS_KEY", deps.spacesAccessKey),
    secretEnv("STORAGE_SECRET_KEY", deps.spacesSecretKey),
    generalEnv("STORAGE_APPLY_LIFECYCLE", "true"),
    generalEnv("STORAGE_REQUEST_TIMEOUT_MS", "5000"),
    generalEnv("STORAGE_RETRY_ATTEMPTS", "3"),
    generalEnv("STORAGE_RETRY_DELAY_MS", "100"),
    generalEnv("SHORTLINK_TTL_DAYS", "7"),
    generalEnv("LOG_LEVEL", "info"),
    generalEnv("GOOGLE_CLIENT_ID", ""),
    generalEnv("GOOGLE_CLIENT_SECRET", ""),
    generalEnv("GOOGLE_CALLBACK_URL", pulumi.interpolate`https://${config.apiDomain}/v1/auth/google/callback`),
    generalEnv("OLX_BASE_URL", "https://www.olx.ua"),
    generalEnv("OLX_SCOPE", "read write v2"),
    generalEnv("OLX_REDIRECT_URL", pulumi.interpolate`https://${config.apiDomain}/v1/channel-accounts/olx/callback`),
    generalEnv("SENTRY_ENVIRONMENT", config.sentryEnvironment),
    generalEnv("SENTRY_RELEASE", config.release),
    generalEnv("SENTRY_TRACES_SAMPLE_RATE", config.sentryTraceRate),
    generalEnv("LOKI_BATCH_INTERVAL_SEC", "5"),
    generalEnv("LOKI_BATCH_MAX_BUFFER", "10000"),
  ]

  if (config.resendApiKey && config.emailFrom) {
    envs.push(generalEnv("EMAIL_PROVIDER", "resend"))
    envs.push(generalEnv("EMAIL_FROM", config.emailFrom))
    envs.push(secretEnv("RESEND_API_KEY", config.resendApiKey))
    if (config.emailReplyTo) envs.push(generalEnv("EMAIL_REPLY_TO", config.emailReplyTo))
  } else {
    envs.push(generalEnv("EMAIL_PROVIDER", "console"))
  }

  if (config.olxClientId) envs.push(secretEnv("OLX_CLIENT_ID", config.olxClientId))
  if (config.olxClientSecret) envs.push(secretEnv("OLX_CLIENT_SECRET", config.olxClientSecret))

  if (config.sentryApiDsn) envs.push(secretEnv("SENTRY_DSN", config.sentryApiDsn))
  if (deps.lokiHost) envs.push(secretEnv("LOKI_HOST", deps.lokiHost))
  else if (config.grafanaLokiHost) envs.push(secretEnv("LOKI_HOST", config.grafanaLokiHost))
  if (deps.lokiUsername) envs.push(secretEnv("LOKI_USERNAME", deps.lokiUsername))
  else if (config.grafanaLokiUsername) envs.push(secretEnv("LOKI_USERNAME", config.grafanaLokiUsername))
  if (deps.lokiPassword) envs.push(secretEnv("LOKI_PASSWORD", deps.lokiPassword))
  else if (config.grafanaLokiPassword) envs.push(secretEnv("LOKI_PASSWORD", config.grafanaLokiPassword))
  if (deps.prometheusRemoteWriteUrl) envs.push(secretEnv("GRAFANA_PROMETHEUS_REMOTE_WRITE_URL", deps.prometheusRemoteWriteUrl))
  else if (config.grafanaPrometheusRemoteWriteUrl)
    envs.push(secretEnv("GRAFANA_PROMETHEUS_REMOTE_WRITE_URL", config.grafanaPrometheusRemoteWriteUrl))
  if (deps.prometheusUsername) envs.push(secretEnv("GRAFANA_PROMETHEUS_USERNAME", deps.prometheusUsername))
  else if (config.grafanaPrometheusUsername) envs.push(secretEnv("GRAFANA_PROMETHEUS_USERNAME", config.grafanaPrometheusUsername))
  if (deps.prometheusPassword) envs.push(secretEnv("GRAFANA_PROMETHEUS_PASSWORD", deps.prometheusPassword))
  else if (config.grafanaPrometheusPassword) envs.push(secretEnv("GRAFANA_PROMETHEUS_PASSWORD", config.grafanaPrometheusPassword))

  if (deps.otelCollectorEndpoint !== undefined && deps.otelCollectorAuthToken !== undefined) {
    envs.push(generalEnv("OBS_ENABLED", "1"))
    envs.push(generalEnv("OBS_DEPLOYMENT_ENV", config.sentryEnvironment))
    envs.push(generalEnv("OBS_SERVICE_VERSION", config.release))
    envs.push(generalEnv("OBS_OTLP_ENDPOINT", deps.otelCollectorEndpoint))
    envs.push(
      secretEnv("OBS_OTLP_HEADERS", pulumi.interpolate`Authorization=Bearer ${deps.otelCollectorAuthToken}`),
    )
  }

  return envs
}

export function buildWorkersEnvs(
  config: DeploymentConfig,
  deps: RuntimeDependencies,
  infisical: InfisicalRuntime | undefined,
): any[] {
  const envs: any[] = [
    generalEnv("NODE_ENV", "production"),
    secretEnv("DATABASE_URL", deps.databaseUrl),
    secretEnv("REDIS_URL", deps.redisUrl),
    ...(infisical
      ? [
          generalEnv("INFISICAL_KMS_BASE_URL", infisical.baseUrl),
          generalEnv("INFISICAL_CLIENT_ID", infisical.clientId),
          secretEnv("INFISICAL_CLIENT_SECRET", infisical.clientSecret),
          secretEnv("INFISICAL_KMS_KEY_ID", infisical.kmsKeyId),
        ]
      : []),
    secretEnv("METRICS_TOKEN", config.workersMetricsToken),
    generalEnv("SHORTLINK_TTL_DAYS", "7"),
    generalEnv("LOG_LEVEL", "info"),
    generalEnv("STORAGE_ENDPOINT", deps.spacesEndpoint),
    generalEnv("STORAGE_REGION", config.spacesRegion),
    generalEnv("STORAGE_BUCKET", deps.spacesBucketName),
    secretEnv("STORAGE_ACCESS_KEY", deps.spacesAccessKey),
    secretEnv("STORAGE_SECRET_KEY", deps.spacesSecretKey),
    generalEnv("STORAGE_APPLY_LIFECYCLE", "true"),
    generalEnv("STORAGE_REQUEST_TIMEOUT_MS", "5000"),
    generalEnv("STORAGE_RETRY_ATTEMPTS", "3"),
    generalEnv("STORAGE_RETRY_DELAY_MS", "100"),
    generalEnv("CHANNEL_SYNC_STUB_ENABLED", "false"),
    generalEnv("CHANNEL_SYNC_OLX_ENABLED", "true"),
    generalEnv("CHANNEL_SYNC_PROM_ENABLED", "true"),
    generalEnv("CHANNEL_SYNC_PROM_MAX_ACCOUNTS", "50"),
    generalEnv("CHANNEL_SYNC_PROM_LIMIT", "100"),
    generalEnv("CHANNEL_SYNC_ROZETKA_ENABLED", config.channelSyncRozetkaEnabled ? "true" : "false"),
    generalEnv("CHANNEL_SYNC_ROZETKA_MAX_ACCOUNTS", "50"),
    generalEnv("ROZETKA_REQUEST_TIMEOUT_MS", "8000"),
    generalEnv("CHANNEL_SYNC_ROZETKA_ORDERS_ENABLED", config.channelSyncRozetkaOrdersEnabled ? "true" : "false"),
    generalEnv("CHANNEL_SYNC_ROZETKA_ORDERS_LIMIT", "50"),
    generalEnv("PROM_API_BASE_URL", "https://my.prom.ua/api/v1"),
    generalEnv("PROM_REQUEST_TIMEOUT_MS", "8000"),
    generalEnv("OLX_BASE_URL", "https://www.olx.ua"),
    generalEnv("OLX_REQUEST_TIMEOUT_MS", "8000"),
    generalEnv("PUSH_PROVIDER", "expo"),
    generalEnv("SENTRY_ENVIRONMENT", config.sentryEnvironment),
    generalEnv("SENTRY_RELEASE", config.release),
    generalEnv("SENTRY_TRACES_SAMPLE_RATE", config.sentryTraceRate),
    generalEnv("LOKI_BATCH_INTERVAL_SEC", "5"),
    generalEnv("LOKI_BATCH_MAX_BUFFER", "10000"),
  ]

  // OLX OAuth client id/secret — needed by OlxUaSyncService.refreshAccessToken
  // when an account's access_token expires (every ~2h). Without these, every
  // tick after token expiry throws "OLX refresh aborted: client_id/secret
  // missing" and inbound polling silently stops. The api service has these
  // env vars (for the OAuth callback handler); workers historically didn't,
  // which broke poll refresh for every long-lived account.
  if (config.olxClientId) envs.push(secretEnv("OLX_CLIENT_ID", config.olxClientId))
  if (config.olxClientSecret) envs.push(secretEnv("OLX_CLIENT_SECRET", config.olxClientSecret))
  if (config.sentryWorkersDsn) envs.push(secretEnv("SENTRY_DSN", config.sentryWorkersDsn))
  if (deps.lokiHost) envs.push(secretEnv("LOKI_HOST", deps.lokiHost))
  else if (config.grafanaLokiHost) envs.push(secretEnv("LOKI_HOST", config.grafanaLokiHost))
  if (deps.lokiUsername) envs.push(secretEnv("LOKI_USERNAME", deps.lokiUsername))
  else if (config.grafanaLokiUsername) envs.push(secretEnv("LOKI_USERNAME", config.grafanaLokiUsername))
  if (deps.lokiPassword) envs.push(secretEnv("LOKI_PASSWORD", deps.lokiPassword))
  else if (config.grafanaLokiPassword) envs.push(secretEnv("LOKI_PASSWORD", config.grafanaLokiPassword))
  if (deps.prometheusRemoteWriteUrl) envs.push(secretEnv("GRAFANA_PROMETHEUS_REMOTE_WRITE_URL", deps.prometheusRemoteWriteUrl))
  else if (config.grafanaPrometheusRemoteWriteUrl)
    envs.push(secretEnv("GRAFANA_PROMETHEUS_REMOTE_WRITE_URL", config.grafanaPrometheusRemoteWriteUrl))
  if (deps.prometheusUsername) envs.push(secretEnv("GRAFANA_PROMETHEUS_USERNAME", deps.prometheusUsername))
  else if (config.grafanaPrometheusUsername) envs.push(secretEnv("GRAFANA_PROMETHEUS_USERNAME", config.grafanaPrometheusUsername))
  if (deps.prometheusPassword) envs.push(secretEnv("GRAFANA_PROMETHEUS_PASSWORD", deps.prometheusPassword))
  else if (config.grafanaPrometheusPassword) envs.push(secretEnv("GRAFANA_PROMETHEUS_PASSWORD", config.grafanaPrometheusPassword))

  if (deps.otelCollectorEndpoint !== undefined && deps.otelCollectorAuthToken !== undefined) {
    envs.push(generalEnv("OBS_ENABLED", "1"))
    envs.push(generalEnv("OBS_DEPLOYMENT_ENV", config.sentryEnvironment))
    envs.push(generalEnv("OBS_SERVICE_VERSION", config.release))
    envs.push(generalEnv("OBS_OTLP_ENDPOINT", deps.otelCollectorEndpoint))
    envs.push(
      secretEnv("OBS_OTLP_HEADERS", pulumi.interpolate`Authorization=Bearer ${deps.otelCollectorAuthToken}`),
    )
  }

  return envs
}

export function buildWebEnvVars(config: DeploymentConfig, deps?: RuntimeDependencies): any[] {
  const variables: any[] = [
    {
      key: "NEXT_PUBLIC_API_BASE_URL",
      value: pulumi.interpolate`https://${config.apiDomain}`,
      targets: ["production"],
    },
    {
      key: "NEXT_PUBLIC_WS_URL",
      value: pulumi.interpolate`https://${config.apiDomain}`,
      targets: ["production"],
    },
    {
      key: "NEXT_PUBLIC_WS_PATH",
      value: "/ws",
      targets: ["production"],
    },
    {
      key: "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
      value: config.sentryEnvironment,
      targets: ["production"],
    },
    {
      key: "NEXT_PUBLIC_SENTRY_RELEASE",
      value: config.release,
      targets: ["production"],
    },
    {
      key: "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
      value: config.sentryTraceRate,
      targets: ["production"],
    },
    {
      key: "SENTRY_ENVIRONMENT",
      value: config.sentryEnvironment,
      targets: ["production"],
    },
    {
      key: "SENTRY_RELEASE",
      value: config.release,
      targets: ["production"],
    },
    {
      key: "SENTRY_TRACES_SAMPLE_RATE",
      value: config.sentryTraceRate,
      targets: ["production"],
    },
    {
      key: "SENTRY_URL",
      value: config.sentryUrl,
      targets: ["production"],
    },
  ]

  if (config.sentryWebDsn) {
    variables.push({ key: "NEXT_PUBLIC_SENTRY_DSN", value: config.sentryWebDsn, targets: ["production"] })
  }
  if (config.sentryApiDsn) {
    variables.push({ key: "SENTRY_DSN", value: config.sentryApiDsn, targets: ["production"] })
  }
  if (config.sentryOrg) {
    variables.push({ key: "SENTRY_ORG", value: config.sentryOrg, targets: ["production"] })
  }
  if (config.sentryProjectWeb) {
    variables.push({ key: "SENTRY_PROJECT", value: config.sentryProjectWeb, targets: ["production"] })
  }
  if (config.sentryAuthToken) {
    variables.push({ key: "SENTRY_AUTH_TOKEN", value: config.sentryAuthToken, targets: ["production"] })
  }

  // Browser observability: ship the no-auth public collector endpoint into the
  // Next.js bundle as NEXT_PUBLIC_*. Tokens are deliberately NOT exported here
  // because the bundle is reachable from any browser DOM -- the collector's
  // CORS allowlist + per-pipeline redaction processor are the trust boundary.
  if (deps?.otelCollectorClientEndpoint !== undefined) {
    variables.push({
      key: "NEXT_PUBLIC_OBS_OTLP_ENDPOINT",
      value: deps.otelCollectorClientEndpoint,
      targets: ["production"],
    })
    variables.push({
      key: "NEXT_PUBLIC_OBS_DEPLOYMENT_ENV",
      value: config.sentryEnvironment,
      targets: ["production"],
    })
  }

  return variables
}
