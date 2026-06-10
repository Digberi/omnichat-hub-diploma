import * as pulumi from "@pulumi/pulumi"

export type DeploymentConfig = {
  region: string
  rootDomain: string
  wwwDomain: string
  appSubdomain: string
  apiSubdomain: string
  apiDomain: string
  appDomain: string
  githubRepo: string
  githubBranch: string
  cloudflareAccountId?: string
  cloudflareZoneId?: string
  vercelTeamId?: string
  vercelProjectId?: string
  vercelProjectName: string
  doProjectName: string
  postgresSize: string
  redisSize: string
  postgresVersion: string
  redisVersion: string
  spacesBucketName: string
  spacesRegion: string
  /**
   * CIDRs (e.g. ["1.2.3.4/32"]) added to the managed Postgres firewall's
   * trusted_sources alongside the runtime App rule. The host running
   * `pulumi up` — i.e. the self-hosted dev-ci runner today — MUST be in
   * this list so the `prisma-migrations` local.Command can reach PG.
   * Empty default → migration fails at apply time with a clear connection
   * error; never silently skipped.
   */
  migrationsSourceCidrs?: string[]
  emailFrom?: string
  emailReplyTo?: string
  release: string
  sentryEnvironment: string
  sentryTraceRate: string
  sentryUrl: string
  apiJwtAccessSecret: pulumi.Output<string>
  apiJwtRefreshSecret: pulumi.Output<string>
  apiAuthOtpPepper: pulumi.Output<string>
  // Infisical KMS provisioning is opt-in: when these are not set, the
  // Pulumi stack does not create any Infisical resources and does not
  // emit INFISICAL_* env vars to DO App Platform. App boot will then fail
  // its env validator at runtime (intentional gate — keeps prod from
  // accidentally deploying without KMS configured).
  infisicalDeployClientId?: string
  infisicalDeployClientSecret?: pulumi.Output<string>
  infisicalSiteUrl?: string
  /** Project of type "kms" — where the KEK lives. */
  infisicalKmsProjectId?: string
  /** Project of type "secret-manager" — where INFISICAL_CLIENT_ID/SECRET + KMS_KEY_ID secrets live. */
  infisicalProjectId?: string
  infisicalEnvironmentSlug?: string
  infisicalKmsKeyName?: string
  spacesAccessKeyId: pulumi.Output<string>
  spacesSecretAccessKey: pulumi.Output<string>
  apiMetricsToken: pulumi.Output<string>
  workersMetricsToken: pulumi.Output<string>
  resendApiKey?: pulumi.Output<string>
  olxClientId?: pulumi.Output<string>
  olxClientSecret?: pulumi.Output<string>
  sentryApiDsn?: pulumi.Output<string>
  sentryWorkersDsn?: pulumi.Output<string>
  sentryWebDsn?: pulumi.Output<string>
  sentryOrg?: string
  sentryProjectWeb?: string
  sentryAuthToken?: pulumi.Output<string>
  grafanaLokiHost?: pulumi.Output<string>
  grafanaLokiUsername?: pulumi.Output<string>
  grafanaLokiPassword?: pulumi.Output<string>
  grafanaPrometheusRemoteWriteUrl?: pulumi.Output<string>
  grafanaPrometheusUsername?: pulumi.Output<string>
  grafanaPrometheusPassword?: pulumi.Output<string>
  grafanaCreateCloudStack: boolean
  /** Toggle for the Rozetka inbound polling worker tick. Default false. */
  channelSyncRozetkaEnabled: boolean
  /** Toggle for the Rozetka orders → inbox messages worker tick. Default false. */
  channelSyncRozetkaOrdersEnabled: boolean
  grafanaCloudRegion?: string
  grafanaStackSlug?: string
  grafanaStackName?: string
  grafanaCloudAccessPolicyToken?: pulumi.Output<string>
  grafanaOtlpEndpoint?: string
  grafanaOtlpAuth?: pulumi.Output<string>
  otelCollectorInboundToken?: pulumi.Output<string>
}

export function loadConfig(): DeploymentConfig {
  const config = new pulumi.Config()

  const region = config.get("region") ?? "fra1"
  const rootDomain = config.require("rootDomain")
  const appSubdomain = config.get("appSubdomain") ?? "app"
  const apiSubdomain = config.get("apiSubdomain") ?? "api"
  const githubRepo = config.require("githubRepo")
  const githubBranch = config.get("githubBranch") ?? "main"
  const cloudflareAccountId = config.get("cloudflareAccountId") ?? undefined
  const cloudflareZoneId = config.get("cloudflareZoneId") ?? undefined
  const vercelTeamId = config.get("vercelTeamId")
  const vercelProjectId = config.get("vercelProjectId")
  const vercelProjectName = config.get("vercelProjectName") ?? "omnichat-web"
  const doProjectName = config.get("doProjectName") ?? "omnichat-prod"
  const postgresSize = config.get("postgresSize") ?? "db-s-1vcpu-2gb"
  const redisSize = config.get("redisSize") ?? "db-s-1vcpu-1gb"
  const postgresVersion = config.get("postgresVersion") ?? "16"
  const redisVersion = config.get("redisVersion") ?? "8"
  const spacesBucketName =
    config.get("spacesBucketName") ?? `${rootDomain.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-assets`
  const spacesRegion = config.get("spacesRegion") ?? region
  // Pulumi config `digitalocean:migrationsSourceCidrs` is a JSON string
  // array (e.g. `'["1.2.3.4/32"]'`). `getObject` parses it; missing
  // value resolves to undefined which we normalize to [].
  const migrationsSourceCidrs = config.getObject<string[]>("migrationsSourceCidrs") ?? []
  const emailFrom = config.get("emailFrom") ?? undefined
  const emailReplyTo = config.get("emailReplyTo") ?? undefined
  const apiDomain = `${apiSubdomain}.${rootDomain}`
  const appDomain = `${appSubdomain}.${rootDomain}`
  const wwwDomain = `www.${rootDomain}`
  const release = config.get("release") ?? pulumi.getStack()
  const sentryEnvironment = config.get("sentryEnvironment") ?? "production"
  const sentryTraceRate = config.get("sentryTracesSampleRate") ?? "0.05"
  const sentryUrl = config.get("sentryUrl") ?? "https://sentry.io/"
  const grafanaCreateCloudStack = config.getBoolean("grafanaCreateCloudStack") ?? false
  const channelSyncRozetkaEnabled = config.getBoolean("channelSyncRozetkaEnabled") ?? false
  const channelSyncRozetkaOrdersEnabled = config.getBoolean("channelSyncRozetkaOrdersEnabled") ?? false
  const grafanaCloudRegion = config.get("grafanaCloudRegion") ?? undefined
  const grafanaStackSlug = config.get("grafanaStackSlug") ?? undefined
  const grafanaStackName = config.get("grafanaStackName") ?? undefined

  if (!cloudflareZoneId && !cloudflareAccountId) {
    throw new Error("Either cloudflareZoneId or cloudflareAccountId must be set for Cloudflare management")
  }

  if (grafanaCreateCloudStack && !grafanaCloudRegion) {
    throw new Error("grafanaCloudRegion must be set when grafanaCreateCloudStack=true")
  }

  const resendApiKey = config.getSecret("resendApiKey")
  const olxClientId = config.getSecret("olxClientId")
  const olxClientSecret = config.getSecret("olxClientSecret")
  if ((emailFrom && !resendApiKey) || (!emailFrom && resendApiKey)) {
    throw new Error("emailFrom and resendApiKey must be set together to enable Resend email delivery")
  }

  const result: DeploymentConfig = {
    region,
    rootDomain,
    wwwDomain,
    appSubdomain,
    apiSubdomain,
    apiDomain,
    appDomain,
    githubRepo,
    githubBranch,
    vercelProjectName,
    doProjectName,
    postgresSize,
    redisSize,
    postgresVersion,
    redisVersion,
    spacesBucketName,
    spacesRegion,
    migrationsSourceCidrs,
    ...(emailFrom ? { emailFrom } : {}),
    ...(emailReplyTo ? { emailReplyTo } : {}),
    release,
    sentryEnvironment,
    sentryTraceRate,
    sentryUrl,
    grafanaCreateCloudStack,
    channelSyncRozetkaEnabled,
    channelSyncRozetkaOrdersEnabled,
    apiJwtAccessSecret: config.requireSecret("apiJwtAccessSecret"),
    apiJwtRefreshSecret: config.requireSecret("apiJwtRefreshSecret"),
    apiAuthOtpPepper: config.requireSecret("apiAuthOtpPepper"),
    // All Infisical keys are optional. The stack creates Infisical
    // resources only when infisicalDeployClientId is set; otherwise it
    // skips the whole block. The app validator catches the missing
    // INFISICAL_* env at runtime, so this is gated.
    spacesAccessKeyId: config.requireSecret("spacesAccessKeyId"),
    spacesSecretAccessKey: config.requireSecret("spacesSecretAccessKey"),
    apiMetricsToken: config.requireSecret("apiMetricsToken"),
    workersMetricsToken: config.requireSecret("workersMetricsToken"),
  }

  const infisicalDeployClientId = config.get("infisicalDeployClientId") ?? undefined
  if (infisicalDeployClientId) {
    result.infisicalDeployClientId = infisicalDeployClientId
    result.infisicalDeployClientSecret = config.requireSecret("infisicalDeployClientSecret")
    result.infisicalSiteUrl = config.get("infisicalSiteUrl") ?? "https://app.infisical.com"
    result.infisicalKmsProjectId = config.require("infisicalKmsProjectId")
    result.infisicalProjectId = config.require("infisicalProjectId")
    result.infisicalEnvironmentSlug = config.get("infisicalEnvironmentSlug") ?? "prod"
    result.infisicalKmsKeyName = config.get("infisicalKmsKeyName") ?? "omnichat-channel-tokens-kek"
  }

  if (cloudflareAccountId) result.cloudflareAccountId = cloudflareAccountId
  if (cloudflareZoneId) result.cloudflareZoneId = cloudflareZoneId
  if (vercelTeamId) result.vercelTeamId = vercelTeamId
  if (vercelProjectId) result.vercelProjectId = vercelProjectId
  if (grafanaCloudRegion) result.grafanaCloudRegion = grafanaCloudRegion
  if (grafanaStackSlug) result.grafanaStackSlug = grafanaStackSlug
  if (grafanaStackName) result.grafanaStackName = grafanaStackName

  const sentryApiDsn = config.getSecret("sentryApiDsn")
  const sentryWorkersDsn = config.getSecret("sentryWorkersDsn")
  const sentryWebDsn = config.getSecret("sentryWebDsn")
  const sentryOrg = config.get("sentryOrg") ?? undefined
  const sentryProjectWeb = config.get("sentryProjectWeb") ?? undefined
  const sentryAuthToken = config.getSecret("sentryAuthToken")
  const grafanaCloudAccessPolicyToken = config.getSecret("grafanaCloudAccessPolicyToken")
  const grafanaLokiHost = config.getSecret("grafanaLokiHost")
  const grafanaLokiUsername = config.getSecret("grafanaLokiUsername")
  const grafanaLokiPassword = config.getSecret("grafanaLokiPassword")
  const grafanaPrometheusRemoteWriteUrl = config.getSecret("grafanaPrometheusRemoteWriteUrl")
  const grafanaPrometheusUsername = config.getSecret("grafanaPrometheusUsername")
  const grafanaPrometheusPassword = config.getSecret("grafanaPrometheusPassword")

  if (resendApiKey) result.resendApiKey = resendApiKey
  if (olxClientId) result.olxClientId = olxClientId
  if (olxClientSecret) result.olxClientSecret = olxClientSecret
  if (sentryApiDsn) result.sentryApiDsn = sentryApiDsn
  if (sentryWorkersDsn) result.sentryWorkersDsn = sentryWorkersDsn
  if (sentryWebDsn) result.sentryWebDsn = sentryWebDsn
  if (sentryOrg) result.sentryOrg = sentryOrg
  if (sentryProjectWeb) result.sentryProjectWeb = sentryProjectWeb
  if (sentryAuthToken) result.sentryAuthToken = sentryAuthToken
  if (grafanaCloudAccessPolicyToken) result.grafanaCloudAccessPolicyToken = grafanaCloudAccessPolicyToken
  const grafanaOtlpEndpoint = config.get("grafanaOtlpEndpoint") ?? undefined
  const grafanaOtlpAuth = config.getSecret("grafanaOtlpAuth")
  const otelCollectorInboundToken = config.getSecret("otelCollectorInboundToken")
  if (grafanaOtlpEndpoint) result.grafanaOtlpEndpoint = grafanaOtlpEndpoint
  if (grafanaOtlpAuth) result.grafanaOtlpAuth = grafanaOtlpAuth
  if (otelCollectorInboundToken) result.otelCollectorInboundToken = otelCollectorInboundToken
  if (grafanaLokiHost) result.grafanaLokiHost = grafanaLokiHost
  if (grafanaLokiUsername) result.grafanaLokiUsername = grafanaLokiUsername
  if (grafanaLokiPassword) result.grafanaLokiPassword = grafanaLokiPassword
  if (grafanaPrometheusRemoteWriteUrl) result.grafanaPrometheusRemoteWriteUrl = grafanaPrometheusRemoteWriteUrl
  if (grafanaPrometheusUsername) result.grafanaPrometheusUsername = grafanaPrometheusUsername
  if (grafanaPrometheusPassword) result.grafanaPrometheusPassword = grafanaPrometheusPassword

  return result
}
