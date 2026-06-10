import * as digberiInfisical from "@digberi/pulumi-infisical"
import * as digitalocean from "@pulumi/digitalocean"
import * as pulumi from "@pulumi/pulumi"
import * as tls from "@pulumi/tls"

import { createCloudflareResources } from "./cloudflare"
import { OtelCollector } from "./components/OtelCollector"
import { loadConfig } from "./config"
import { createDigitalOceanResources } from "./digitalocean"
import { InfisicalKmsKey } from "./infisical-resources"
import { createObservabilityResources } from "./observability"
import { createVercelResources } from "./vercel"

const config = loadConfig()

// ---------------------------------------------------------------------------
// Infisical dynamic resources (opt-in)
// ---------------------------------------------------------------------------

// Provisioning runs only when the bootstrap config is set. Before
// running `pulumi up` for the first time, set:
//   pulumi config set infisicalDeployClientId <uuid>
//   pulumi config set --secret infisicalDeployClientSecret <hex>
//   pulumi config set infisicalKmsProjectId <kms-project-uuid>
//   pulumi config set infisicalProjectId <secrets-project-uuid>
// Until then, this block is skipped and INFISICAL_* env vars are NOT
// emitted to DO App Platform. The app's env validator will then fail at
// boot (intentional — keeps prod from accidentally deploying without
// KMS).
//
// The KEK lives in an Infisical project of type "kms" (cannot host
// secrets); the runtime UA pair + KMS_KEY_ID secret live in a separate
// project of type "secret-manager".
let infisicalRuntime: {
  baseUrl: pulumi.Input<string>
  clientId: pulumi.Input<string>
  clientSecret: pulumi.Input<string>
  kmsKeyId: pulumi.Input<string>
} | undefined
if (
  config.infisicalDeployClientId &&
  config.infisicalDeployClientSecret &&
  config.infisicalSiteUrl &&
  config.infisicalKmsProjectId &&
  config.infisicalProjectId &&
  config.infisicalEnvironmentSlug &&
  config.infisicalKmsKeyName
) {
  // Bridged Infisical provider — reused by all three calls below. The
  // same Universal Auth identity has scopes on both the secret-manager
  // project (`infisicalProjectId`) and the KMS project
  // (`infisicalKmsProjectId`) per the legacy dynamic implementation.
  const digberiInfisicalProvider = new digberiInfisical.Provider(
    "digberi-infisical",
    {
      host: config.infisicalSiteUrl,
      clientId: config.infisicalDeployClientId,
      clientSecret: config.infisicalDeployClientSecret,
    },
  )

  // 1. Create (or reconcile) the KEK in Infisical KMS (kms-type project).
  //
  // Step 3 of MIGRATION.md (KMS key → bridged provider) is DEFERRED.
  // The bridged `digberiInfisical.KmsKey` requires `projectId` as a
  // mandatory input, but the Infisical GET endpoint omits projectId
  // from its response, so an `import:` flow lands with state.projectId
  // = nil and Pulumi computes a REPLACE on first apply — which is
  // forbidden while `import:` is set AND would destroy the live KEK
  // that every encrypted channel token in prod is bound to. Tried
  // `ignoreChanges: ["projectId", ...]` (failed: schema validator still
  // requires the field) and composite-ID import `projectId/keyId`
  // (failed: bridge doesn't parse it). Until upstream support lands,
  // keep the hand-rolled dynamic resource for the KEK only.
  const infisicalKmsKey = new InfisicalKmsKey("kms-channel-tokens", {
    clientId: config.infisicalDeployClientId,
    clientSecret: config.infisicalDeployClientSecret,
    siteUrl: config.infisicalSiteUrl,
    projectId: config.infisicalKmsProjectId,
    name: config.infisicalKmsKeyName,
    description: "KEK for omnichat marketplace channel token envelope encryption",
  })

  // 2. Read the Universal Auth credentials that live in Infisical
  //    Secrets (env: prod, path: /). Apps consume them as env vars at
  //    boot; rotation happens out-of-band in the Infisical UI.
  //
  // Step 1 of MIGRATION.md: the two hand-rolled `InfisicalSecretLookup`
  // resources used to live here. They were `pulumi-nodejs:dynamic:Resource`
  // instances with a no-op delete, replaced by a single `getSecretsOutput`
  // function invocation. The old state entries
  // (`urn:...::kms-client-id`, `urn:...::kms-client-secret`) drop out of
  // the stack on the first `pulumi up` after this commit; the underlying
  // secrets in Infisical are untouched.
  const digberiInfisicalRootSecrets = digberiInfisical.getSecretsOutput(
    {
      workspaceId: config.infisicalProjectId,
      envSlug: config.infisicalEnvironmentSlug,
      folderPath: "/",
    },
    { provider: digberiInfisicalProvider },
  )

  // 3. Write the resulting KMS key ID back to Infisical Secrets for
  //    audit/visibility.
  //
  // Step 2 of MIGRATION.md. The legacy `InfisicalSecret` dynamic resource
  // was state-surgery'd out before this commit; the existing secret
  // value (= the KMS key UUID) is adopted via `import:` so apps that
  // read `INFISICAL_KMS_KEY_ID` see no value churn during the swap.
  new digberiInfisical.Secret(
    "kms-key-id-secret",
    {
      workspaceId: config.infisicalProjectId,
      envSlug: config.infisicalEnvironmentSlug,
      folderPath: "/",
      name: "INFISICAL_KMS_KEY_ID",
      value: pulumi.secret(infisicalKmsKey.keyId),
    },
    {
      provider: digberiInfisicalProvider,
      import: "9ff260b1-c9d0-423f-bfc1-ab9271b3ec10",
    },
  )

  // Bundle the Infisical runtime values consumed by the app containers.
  infisicalRuntime = {
    baseUrl: pulumi.interpolate`${config.infisicalSiteUrl}/api/v1`,
    clientId: digberiInfisicalRootSecrets.apply(
      (r) => r.secrets["INFISICAL_CLIENT_ID"].value,
    ),
    clientSecret: pulumi.secret(
      digberiInfisicalRootSecrets.apply(
        (r) => r.secrets["INFISICAL_CLIENT_SECRET"].value,
      ),
    ),
    kmsKeyId: infisicalKmsKey.keyId,
  }
}

const observability = createObservabilityResources(config)

let otelCollector: OtelCollector | undefined
let collectorSshKey: tls.PrivateKey | undefined
// Prefer the Pulumi-managed OTLP token (has logs:write+metrics:write+traces:write scopes
// on the stack realm). Fall back to the bootstrap token only when Grafana Cloud
// provisioning is disabled.
const effectiveOtlpAuth = observability.grafanaOtlpToken ?? config.grafanaOtlpAuth
const effectiveOtlpInstanceId = observability.grafanaStackId
if (config.grafanaOtlpEndpoint && effectiveOtlpAuth && config.otelCollectorInboundToken && effectiveOtlpInstanceId) {
  // Generate ed25519 keypair, store public key in DO, keep private key as secret output.
  // Use `pulumi stack output --show-secrets collectorSshPrivateKey` to retrieve for break-glass SSH.
  collectorSshKey = new tls.PrivateKey("omnichat-otelcol-prod-ssh", {
    algorithm: "ED25519",
  })

  const doSshKey = new digitalocean.SshKey("omnichat-otelcol-prod-ssh", {
    name: "omnichat-otelcol-prod",
    publicKey: collectorSshKey.publicKeyOpenssh,
  })

  // VPC routing isn't possible — DO App Platform sits in its own isolated VPC that
  // doesn't peer with the droplet's VPC. The collector listens on the public IP and
  // gates inbound traffic with bearertokenauth instead.
  const defaultVpc = digitalocean.getVpcOutput({ region: config.region })
  otelCollector = new OtelCollector("omnichat-otelcol-prod", {
    region: config.region,
    vpcUuid: defaultVpc.id,
    sshKeyFingerprints: [doSshKey.fingerprint],
    inboundCidr: defaultVpc.ipRange,
    grafanaOtlpEndpoint: config.grafanaOtlpEndpoint,
    grafanaOtlpInstanceId: effectiveOtlpInstanceId,
    grafanaOtlpAuth: effectiveOtlpAuth,
    inboundToken: config.otelCollectorInboundToken,
  })
}

const digitalOcean = createDigitalOceanResources(config, observability, {
  ...(infisicalRuntime ? { infisicalRuntime } : {}),
  ...(otelCollector ? { otelCollectorEndpoint: otelCollector.publicOtlpEndpoint } : {}),
  ...(config.otelCollectorInboundToken ? { otelCollectorAuthToken: config.otelCollectorInboundToken } : {}),
})
const vercel = createVercelResources(config, {
  ...(otelCollector ? { otelCollectorClientEndpoint: otelCollector.clientOtlpEndpoint } : {}),
})
const cloudflare = createCloudflareResources(
  config,
  digitalOcean.runtimeApp.defaultIngress,
  vercel.rootDomainConfig,
  vercel.appDomainConfig,
  vercel.wwwDomainConfig,
)

const effectiveGrafanaLokiHost = observability.lokiHost ?? config.grafanaLokiHost
const effectiveGrafanaLokiUsername = observability.lokiUsername ?? config.grafanaLokiUsername
const effectiveGrafanaLokiPassword = observability.lokiPassword ?? config.grafanaLokiPassword
const effectiveGrafanaPrometheusRemoteWriteUrl =
  observability.prometheusRemoteWriteUrl ?? config.grafanaPrometheusRemoteWriteUrl
const effectiveGrafanaPrometheusUsername = observability.prometheusUsername ?? config.grafanaPrometheusUsername
const effectiveGrafanaPrometheusPassword = observability.prometheusPassword ?? config.grafanaPrometheusPassword

const grafanaLokiConfigured = pulumi
  .all([effectiveGrafanaLokiHost, effectiveGrafanaLokiUsername, effectiveGrafanaLokiPassword])
  .apply((values) => values.every((value) => Boolean(value)))

const grafanaPrometheusConfigured = pulumi
  .all([effectiveGrafanaPrometheusRemoteWriteUrl, effectiveGrafanaPrometheusUsername, effectiveGrafanaPrometheusPassword])
  .apply((values) => values.every((value) => Boolean(value)))

export const cloudflareZoneId = cloudflare.zoneId
export const cloudflareZoneMode = cloudflare.zoneMode
export const cloudflareNameServers = cloudflare.zoneNameServers
export const digitalOceanProjectId = digitalOcean.project.id
export const appPlatformId = digitalOcean.runtimeApp.id
export const appPlatformLiveUrl = digitalOcean.runtimeApp.liveUrl
export const hostedSiteUrl = pulumi.interpolate`https://${config.rootDomain}`
export const hostedApiUrl = pulumi.interpolate`https://${config.apiDomain}`
export const hostedAppUrl = pulumi.interpolate`https://${config.appDomain}`
export const databaseHost = digitalOcean.postgres.host
export const databasePort = digitalOcean.postgres.port
export const databaseUri = pulumi.secret(digitalOcean.databaseUrl)
export const redisHost = digitalOcean.redis.host
export const redisPort = digitalOcean.redis.port
export const redisUri = pulumi.secret(digitalOcean.redisUrl)
export const spacesBucketOutput = digitalOcean.spacesBucket.name
export const spacesEndpointOutput = digitalOcean.spacesEndpoint
export const vercelProjectId = vercel.project.id
export const marketingDomain = config.rootDomain
export const webDomain = config.appDomain
export const apiMetricsUrl = pulumi.interpolate`https://${config.apiDomain}/metrics`
export const workersMetricsExposure =
  "DigitalOcean App Platform worker mode does not expose /metrics publicly; scrape locally or add a dedicated metrics service if public scraping is required."
export const grafanaLokiEnabled = grafanaLokiConfigured
export const grafanaPrometheusRemoteWriteEnabled = grafanaPrometheusConfigured
export const grafanaCloudStackEnabled = observability.enabled
export const grafanaCloudStackUrl = observability.grafanaStackUrl
export const grafanaCloudStackSlug = observability.grafanaStackSlug
export const grafanaCloudStackId = observability.grafanaStackId
export const grafanaCloudRegionSlug = observability.grafanaRegionSlug
export const grafanaCloudLokiInstanceId = observability.lokiInstanceId
export const grafanaCloudLokiHost = observability.lokiHost
export const grafanaCloudLokiUsername = observability.lokiUsername
export const grafanaCloudLokiPassword = observability.lokiPassword
export const grafanaCloudPrometheusInstanceId = observability.prometheusInstanceId
export const grafanaCloudPrometheusRemoteWriteUrl = observability.prometheusRemoteWriteUrl
export const grafanaCloudPrometheusUsername = observability.prometheusUsername
export const grafanaCloudPrometheusPassword = observability.prometheusPassword
export const mobileApiBaseUrl = pulumi.interpolate`https://${config.apiDomain}`
export const otelCollectorPrivateIp = otelCollector?.privateIp
export const otelCollectorPublicIp = otelCollector?.publicIp
export const otelCollectorOtlpEndpoint = otelCollector?.otlpEndpoint
export const otelCollectorPublicEndpoint = otelCollector?.publicOtlpEndpoint
export const otelCollectorClientEndpoint = otelCollector?.clientOtlpEndpoint
export const otelCollectorSshPrivateKey = collectorSshKey
  ? pulumi.secret(collectorSshKey.privateKeyOpenssh)
  : undefined
