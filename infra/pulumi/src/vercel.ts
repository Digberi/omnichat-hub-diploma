import * as vercel from "@pulumiverse/vercel"
import * as pulumi from "@pulumi/pulumi"

import type { DeploymentConfig } from "./config"
import { buildWebEnvVars, type RuntimeDependencies } from "./runtime-envs"

export type VercelResources = {
  project: vercel.Project
  rootDomainConfig: pulumi.Output<vercel.GetDomainConfigResult>
  appDomainConfig: pulumi.Output<vercel.GetDomainConfigResult>
  wwwDomainConfig: pulumi.Output<vercel.GetDomainConfigResult>
}

export function createVercelResources(
  config: DeploymentConfig,
  deps?: Pick<RuntimeDependencies, "otelCollectorClientEndpoint">,
): VercelResources {
  const project = new vercel.Project(
    "web-project",
    {
      name: config.vercelProjectName,
      framework: "nextjs",
      rootDirectory: "apps/web",
      // `--filter "web..."` keeps the install scope to apps/web's
      // transitive workspace deps and skips infra/pulumi. Vercel builders
      // don't have SSH keys for the private `@digberi/pulumi-infisical`
      // git dep that lives under infra/pulumi, so a full-workspace install
      // dies with `Host key verification failed` (8s fail, every push to
      // main). See `apps/web/vercel.json` for the runtime override that
      // Vercel actually reads at build time; this matches the Pulumi
      // state so a future `pulumi up` doesn't drift.
      installCommand: 'cd ../.. && pnpm install --frozen-lockfile --filter "web..."',
      // @omnichat/observability MUST build before @omnichat/api-client --
      // api-client imports @omnichat/observability/browser (lazy/dynamic) and
      // tsc -p tsconfig.build.json with moduleResolution: bundler tries to
      // resolve the subpath export at typecheck time; without dist/ the
      // import is unknown-typed and TS bails. Local turbo handles this via
      // dependency graph but Vercel's buildCommand is a flat shell pipe, so
      // ordering must be explicit.
      buildCommand:
        "cd ../.. && pnpm --filter @omnichat/contracts build && pnpm --filter @omnichat/domain build && pnpm --filter @omnichat/observability build && pnpm --filter @omnichat/api-client build && pnpm --filter web build",
      nodeVersion: "22.x",
      gitRepository: {
        type: "github",
        repo: config.githubRepo,
        productionBranch: config.githubBranch,
      },
    } as any,
    { protect: true },
  )

  new vercel.ProjectEnvironmentVariables("web-envs", {
    projectId: project.id,
    variables: buildWebEnvVars(config, deps as RuntimeDependencies | undefined),
    teamId: config.vercelTeamId,
  } as any)

  const projectDomain = new vercel.ProjectDomain("web-domain", {
    projectId: project.id,
    domain: config.appDomain,
    teamId: config.vercelTeamId,
  } as any)

  const rootProjectDomain = new vercel.ProjectDomain("web-root-domain", {
    projectId: project.id,
    domain: config.rootDomain,
    teamId: config.vercelTeamId,
  } as any)

  const wwwProjectDomain = new vercel.ProjectDomain("web-www-domain", {
    projectId: project.id,
    domain: config.wwwDomain,
    teamId: config.vercelTeamId,
  } as any)

  const rootDomainConfig = vercel.getDomainConfigOutput(
    {
      projectIdOrName: project.id,
      domain: config.rootDomain,
      ...(config.vercelTeamId ? { teamId: config.vercelTeamId } : {}),
    },
    { dependsOn: [rootProjectDomain] },
  )

  const appDomainConfig = vercel.getDomainConfigOutput(
    {
      projectIdOrName: project.id,
      domain: config.appDomain,
      ...(config.vercelTeamId ? { teamId: config.vercelTeamId } : {}),
    },
    { dependsOn: [projectDomain] },
  )

  const wwwDomainConfig = vercel.getDomainConfigOutput(
    {
      projectIdOrName: project.id,
      domain: config.wwwDomain,
      ...(config.vercelTeamId ? { teamId: config.vercelTeamId } : {}),
    },
    { dependsOn: [wwwProjectDomain] },
  )

  return { project, rootDomainConfig, appDomainConfig, wwwDomainConfig }
}
