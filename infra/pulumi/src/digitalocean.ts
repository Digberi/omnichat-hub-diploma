import * as command from "@pulumi/command"
import * as digitalocean from "@pulumi/digitalocean"
import * as pulumi from "@pulumi/pulumi"

import type { DeploymentConfig } from "./config"
import { ciEgressIp } from "./db/ci-egress-ip"
import { prismaMigrate } from "./db/migrations"
import type { ObservabilityResources } from "./observability"
import { buildApiEnvs, buildWorkersEnvs, type InfisicalRuntime } from "./runtime-envs"

export type DigitalOceanResources = {
  project: digitalocean.Project
  projectResources: digitalocean.ProjectResources
  postgres: digitalocean.DatabaseCluster
  redis: digitalocean.DatabaseCluster
  spacesBucket: digitalocean.SpacesBucket
  spacesEndpoint: pulumi.Output<string>
  databaseUrl: pulumi.Output<string>
  redisUrl: pulumi.Output<string>
  runtimeApp: digitalocean.App
  migrations: command.local.Command
}

export type DigitalOceanResourceOptions = {
  /** When omitted, INFISICAL_* env vars are not emitted to DO App Platform. */
  infisicalRuntime?: InfisicalRuntime
  otelCollectorEndpoint?: pulumi.Input<string>
  /** Raw inbound bearer token (NOT prefixed with "Bearer "). */
  otelCollectorAuthToken?: pulumi.Input<string>
}

export function createDigitalOceanResources(
  config: DeploymentConfig,
  observability: ObservabilityResources = { enabled: false },
  options: DigitalOceanResourceOptions,
): DigitalOceanResources {
  const project = new digitalocean.Project(
    "omnichat-project",
    {
      name: config.doProjectName,
      description: "Omnichat production baseline",
      environment: "Production",
      purpose: "Web Application",
    },
    { protect: true },
  )

  const postgres = new digitalocean.DatabaseCluster(
    "postgres",
    {
      engine: "pg",
      version: config.postgresVersion,
      region: config.region,
      size: config.postgresSize,
      nodeCount: 1,
      name: "omnichat-postgres",
    },
    { protect: true },
  )

  const redis = new digitalocean.DatabaseCluster(
    "redis",
    {
      engine: "valkey",
      version: config.redisVersion,
      region: config.region,
      size: config.redisSize,
      nodeCount: 1,
      name: "omnichat-redis",
    },
    { protect: true },
  )

  const spacesBucket = new digitalocean.SpacesBucket(
    "attachments-bucket",
    {
      name: config.spacesBucketName,
      region: config.spacesRegion,
      acl: "private",
      forceDestroy: false,
    },
    { protect: true },
  )

  const spacesEndpoint = pulumi.interpolate`https://${config.spacesRegion}.digitaloceanspaces.com`
  const databaseUrl = postgres.uri
  const redisUrl = redis.uri

  // Prisma migrations run on the Pulumi host (CI runner / dev) BEFORE the
  // App rolls. See `./db/migrations.ts` for the rationale (avoiding DO's
  // git-mirror drift hitting PR #75-style failures). The runtime App
  // explicitly depends on this resource so DO never starts the new
  // image against an unmigrated schema.
  //
  // Firewall: this requires that the runner's egress IP is in the PG
  // cluster's trusted_sources (see `migrationsSourceCidrs` config below
  // + the DatabaseFirewall block). If the IP isn't allow-listed, the
  // migration step fails with `ENOTFOUND` / connection refused at
  // pulumi up time — fail-loud, no silent skipping.
  const migrations = prismaMigrate(
    "prisma-migrations",
    { directUrl: postgres.uri },
    { dependsOn: [postgres] },
  )

  const runtimeApp = new digitalocean.App(
    "runtime-app",
    {
      spec: {
        name: config.doProjectName,
        region: config.region,
        domainNames: [{ name: config.apiDomain, type: "PRIMARY" }],
        databases: [
          {
            name: "postgres",
            clusterName: postgres.name,
            engine: "PG",
            production: true,
            version: config.postgresVersion,
          },
          {
            name: "redis",
            clusterName: redis.name,
            engine: "REDIS",
            production: true,
            version: config.redisVersion,
          },
        ],
        services: [
          {
            name: "api",
            instanceCount: 1,
            instanceSizeSlug: "apps-s-1vcpu-1gb",
            httpPort: 4121,
            // Git-sourced build — DO clones omnichat-hub via the GitHub App
            // integration and builds the apps/api Dockerfile on every push to
            // `main`. Switched off DOCR after the docker-build-in-CI flow
            // became brittle once @digberi/pulumi-infisical landed (private
            // ref auth inside the docker build context). DO's own build env
            // gets repo access through the App's GH integration, no extra
            // secret distribution required.
            github: {
              repo: config.githubRepo,
              branch: config.githubBranch,
              deployOnPush: true,
            },
            sourceDir: "/",
            dockerfilePath: "apps/api/Dockerfile",
            healthCheck: {
              httpPath: "/health",
              initialDelaySeconds: 30,
              periodSeconds: 10,
              timeoutSeconds: 5,
              successThreshold: 1,
              failureThreshold: 5,
            },
            envs: buildApiEnvs(
              config,
              {
                databaseUrl,
                redisUrl,
                spacesEndpoint,
                spacesBucketName: spacesBucket.name,
                spacesAccessKey: config.spacesAccessKeyId,
                spacesSecretKey: config.spacesSecretAccessKey,
                ...(observability.lokiHost ? { lokiHost: observability.lokiHost } : {}),
                ...(observability.lokiUsername ? { lokiUsername: observability.lokiUsername } : {}),
                ...(observability.lokiPassword ? { lokiPassword: observability.lokiPassword } : {}),
                ...(observability.prometheusRemoteWriteUrl
                  ? { prometheusRemoteWriteUrl: observability.prometheusRemoteWriteUrl }
                  : {}),
                ...(observability.prometheusUsername ? { prometheusUsername: observability.prometheusUsername } : {}),
                ...(observability.prometheusPassword ? { prometheusPassword: observability.prometheusPassword } : {}),
                ...(options.otelCollectorEndpoint ? { otelCollectorEndpoint: options.otelCollectorEndpoint } : {}),
                ...(options.otelCollectorAuthToken ? { otelCollectorAuthToken: options.otelCollectorAuthToken } : {}),
              },
              options.infisicalRuntime,
            ),
          },
        ],
        // jobs[] (former db-migrate PRE_DEPLOY) replaced by Pulumi-driven
        // local.Command in `prisma-migrations` above. See db/migrations.ts.
        workers: [
          {
            name: "workers",
            instanceCount: 1,
            instanceSizeSlug: "apps-s-1vcpu-1gb",
            runCommand: "node dist/main.js",
            // Git-sourced — see the api service for rationale.
            github: {
              repo: config.githubRepo,
              branch: config.githubBranch,
              deployOnPush: true,
            },
            sourceDir: "/",
            dockerfilePath: "apps/workers/Dockerfile",
            envs: buildWorkersEnvs(
              config,
              {
                databaseUrl,
                redisUrl,
                spacesEndpoint,
                spacesBucketName: spacesBucket.name,
                spacesAccessKey: config.spacesAccessKeyId,
                spacesSecretKey: config.spacesSecretAccessKey,
                ...(observability.lokiHost ? { lokiHost: observability.lokiHost } : {}),
                ...(observability.lokiUsername ? { lokiUsername: observability.lokiUsername } : {}),
                ...(observability.lokiPassword ? { lokiPassword: observability.lokiPassword } : {}),
                ...(observability.prometheusRemoteWriteUrl
                  ? { prometheusRemoteWriteUrl: observability.prometheusRemoteWriteUrl }
                  : {}),
                ...(observability.prometheusUsername ? { prometheusUsername: observability.prometheusUsername } : {}),
                ...(observability.prometheusPassword ? { prometheusPassword: observability.prometheusPassword } : {}),
                ...(options.otelCollectorEndpoint ? { otelCollectorEndpoint: options.otelCollectorEndpoint } : {}),
                ...(options.otelCollectorAuthToken ? { otelCollectorAuthToken: options.otelCollectorAuthToken } : {}),
              },
              options.infisicalRuntime,
            ),
          },
        ],
      } as any,
    },
    // dependsOn migrations: the App must NEVER start its new image
    // against an unmigrated schema. Pulumi parallelizes resource
    // updates by default — without this explicit edge it would roll
    // the App at the same time as the migration command.
    //
    // (Earlier versions also depended on the container registry; PR
    // #114 dropped it — the App now uses `github:` source and DO
    // builds the image on its own builders, so there's no registry
    // resource in the program anymore.)
    { protect: true, dependsOn: [migrations] },
  )

  // PG firewall accepts traffic from (a) the runtime App, (b) the
  // Pulumi host's egress IP resolved at apply time via `ciEgressIp`.
  // Letting Pulumi curl `ifconfig.me` instead of pinning a CIDR in
  // config means the firewall always reflects whichever runner / dev
  // machine is actually running `pulumi up` — no manual config bump on
  // ISP DHCP change, router reboot, or runner swap. The Output is
  // re-resolved on every apply via the `triggerToken` default of
  // today's UTC date.
  //
  // Operator override: pass extra CIDRs via `migrationsSourceCidrs`
  // Pulumi config (still optional — leave empty for the auto path).
  const pulumiHostIpCidr = ciEgressIp("ci-egress-ip")
  const extraCidrs = (config.migrationsSourceCidrs ?? []).map((cidr) => ({
    type: "ip_addr" as const,
    value: cidr,
  }))
  new digitalocean.DatabaseFirewall("postgres-firewall", {
    clusterId: postgres.id,
    rules: [
      { type: "app", value: runtimeApp.id },
      { type: "ip_addr", value: pulumiHostIpCidr },
      ...extraCidrs,
    ],
  })

  new digitalocean.DatabaseFirewall("redis-firewall", {
    clusterId: redis.id,
    rules: [{ type: "app", value: runtimeApp.id }],
  })

  const projectResources = new digitalocean.ProjectResources("project-resources", {
    project: project.id,
    resources: [runtimeApp.appUrn, postgres.clusterUrn, redis.clusterUrn, spacesBucket.bucketUrn],
  })

  return {
    project,
    projectResources,
    postgres,
    redis,
    migrations,
    spacesBucket,
    spacesEndpoint,
    databaseUrl,
    redisUrl,
    runtimeApp,
  }
}
