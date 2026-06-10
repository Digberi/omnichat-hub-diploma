import * as pulumi from "@pulumi/pulumi"

type GrafanaCloudResourceInputs = {
  accessPolicyToken: string
  stackSlug: string
  logsPolicyName: string
  logsPolicyDisplayName: string
  logsTokenName: string
  logsTokenDisplayName: string
  metricsPolicyName: string
  metricsPolicyDisplayName: string
  metricsTokenName: string
  metricsTokenDisplayName: string
  otlpPolicyName: string
  otlpPolicyDisplayName: string
  otlpTokenName: string
  otlpTokenDisplayName: string
}

type GrafanaCloudResourceArgs = {
  [K in keyof GrafanaCloudResourceInputs]: pulumi.Input<GrafanaCloudResourceInputs[K]>
}

type GrafanaCloudResourceOutputs = GrafanaCloudResourceInputs & {
  stackId: string
  stackUrl: string
  regionSlug: string
  lokiInstanceId: string
  lokiInstanceUrl: string
  lokiHost: string
  lokiUsername: string
  lokiPassword: string
  logsPolicyId: string
  prometheusInstanceId: string
  prometheusInstanceUrl: string
  prometheusRemoteWriteUrl: string
  prometheusUsername: string
  prometheusPassword: string
  metricsPolicyId: string
  otlpPolicyId: string
  otlpToken: string
}

type GrafanaStackResponse = {
  id: number | string
  slug: string
  url: string
  regionSlug: string
  hlInstanceId: number | string
  hlInstanceUrl: string
  hmInstancePromId: number | string
  hmInstancePromUrl: string
}

type GrafanaAccessPolicy = {
  id: string
  name: string
  displayName: string
  realms: Array<{ type: string; identifier: string }>
  scopes: string[]
}

type GrafanaAccessPolicyListResponse = {
  items?: GrafanaAccessPolicy[]
}

type GrafanaTokenResponse = {
  id: string
  token: string
}

const GRAFANA_CLOUD_API_URL = "https://grafana.com"

function ensurePath(url: string, suffix: string) {
  return url.endsWith(suffix) ? url : `${url}${suffix}`
}

function asString(value: number | string) {
  return `${value}`
}

function arraysEqual(left: string[], right: string[]) {
  return [...left].sort().join("|") === [...right].sort().join("|")
}

function realmsEqual(
  left: Array<{ type: string; identifier: string }>,
  right: Array<{ type: string; identifier: string }>,
) {
  const normalize = (value: Array<{ type: string; identifier: string }>) =>
    [...value].map((item) => `${item.type}:${item.identifier}`).sort().join("|")
  return normalize(left) === normalize(right)
}

async function grafanaRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GRAFANA_CLOUD_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Grafana Cloud API ${init?.method ?? "GET"} ${path} failed with ${response.status}: ${body}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

async function grafanaDelete(token: string, path: string) {
  const response = await fetch(`${GRAFANA_CLOUD_API_URL}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (response.status === 404 || response.status === 204) {
    return
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Grafana Cloud API DELETE ${path} failed with ${response.status}: ${body}`)
  }
}

async function getStack(token: string, stackSlug: string) {
  return grafanaRequest<GrafanaStackResponse>(token, `/api/instances/${encodeURIComponent(stackSlug)}`)
}

async function listAccessPolicies(token: string, regionSlug: string) {
  const params = new URLSearchParams({
    region: regionSlug,
    pageSize: "500",
  })
  const response = await grafanaRequest<GrafanaAccessPolicyListResponse>(
    token,
    `/api/v1/accesspolicies?${params.toString()}`,
  )
  return response.items ?? []
}

async function createAccessPolicy(
  token: string,
  regionSlug: string,
  name: string,
  displayName: string,
  stackId: string,
  scopes: string[],
) {
  return grafanaRequest<GrafanaAccessPolicy>(token, `/api/v1/accesspolicies?region=${encodeURIComponent(regionSlug)}`, {
    method: "POST",
    body: JSON.stringify({
      name,
      displayName,
      realms: [{ type: "stack", identifier: stackId }],
      scopes,
    }),
  })
}

async function createToken(
  token: string,
  regionSlug: string,
  accessPolicyId: string,
  name: string,
  displayName: string,
) {
  return grafanaRequest<GrafanaTokenResponse>(token, `/api/v1/tokens?region=${encodeURIComponent(regionSlug)}`, {
    method: "POST",
    body: JSON.stringify({
      accessPolicyId,
      name,
      displayName,
    }),
  })
}

async function resetManagedPolicy(
  token: string,
  regionSlug: string,
  name: string,
  displayName: string,
  stackId: string,
  scopes: string[],
) {
  const existingPolicies = await listAccessPolicies(token, regionSlug)
  const matchingPolicies = existingPolicies.filter((policy) => policy.name === name)

  const desiredRealms = [{ type: "stack", identifier: stackId }]
  const reusablePolicy = matchingPolicies.find(
    (policy) => realmsEqual(policy.realms, desiredRealms) && arraysEqual(policy.scopes, scopes) && policy.displayName === displayName,
  )

  for (const policy of matchingPolicies) {
    if (!reusablePolicy || policy.id !== reusablePolicy.id) {
      await grafanaDelete(token, `/api/v1/accesspolicies/${encodeURIComponent(policy.id)}?region=${encodeURIComponent(regionSlug)}`)
    }
  }

  if (reusablePolicy) {
    await grafanaDelete(
      token,
      `/api/v1/accesspolicies/${encodeURIComponent(reusablePolicy.id)}?region=${encodeURIComponent(regionSlug)}`,
    )
  }

  return createAccessPolicy(token, regionSlug, name, displayName, stackId, scopes)
}

async function reconcile(inputs: GrafanaCloudResourceInputs): Promise<GrafanaCloudResourceOutputs> {
  const stack = await getStack(inputs.accessPolicyToken, inputs.stackSlug)
  const stackId = asString(stack.id)

  const logsPolicy = await resetManagedPolicy(
    inputs.accessPolicyToken,
    stack.regionSlug,
    inputs.logsPolicyName,
    inputs.logsPolicyDisplayName,
    stackId,
    ["logs:write"],
  )
  const logsToken = await createToken(
    inputs.accessPolicyToken,
    stack.regionSlug,
    logsPolicy.id,
    inputs.logsTokenName,
    inputs.logsTokenDisplayName,
  )

  const metricsPolicy = await resetManagedPolicy(
    inputs.accessPolicyToken,
    stack.regionSlug,
    inputs.metricsPolicyName,
    inputs.metricsPolicyDisplayName,
    stackId,
    ["metrics:write"],
  )
  const metricsToken = await createToken(
    inputs.accessPolicyToken,
    stack.regionSlug,
    metricsPolicy.id,
    inputs.metricsTokenName,
    inputs.metricsTokenDisplayName,
  )

  // Unified OTLP gateway needs a single token with all three write scopes.
  const otlpPolicy = await resetManagedPolicy(
    inputs.accessPolicyToken,
    stack.regionSlug,
    inputs.otlpPolicyName,
    inputs.otlpPolicyDisplayName,
    stackId,
    ["logs:write", "metrics:write", "traces:write"],
  )
  const otlpToken = await createToken(
    inputs.accessPolicyToken,
    stack.regionSlug,
    otlpPolicy.id,
    inputs.otlpTokenName,
    inputs.otlpTokenDisplayName,
  )

  return {
    ...inputs,
    stackId,
    stackUrl: stack.url,
    regionSlug: stack.regionSlug,
    lokiInstanceId: asString(stack.hlInstanceId),
    lokiInstanceUrl: stack.hlInstanceUrl,
    lokiHost: ensurePath(stack.hlInstanceUrl, "/loki/api/v1/push"),
    lokiUsername: asString(stack.hlInstanceId),
    lokiPassword: logsToken.token,
    logsPolicyId: logsPolicy.id,
    prometheusInstanceId: asString(stack.hmInstancePromId),
    prometheusInstanceUrl: stack.hmInstancePromUrl,
    prometheusRemoteWriteUrl: ensurePath(stack.hmInstancePromUrl, "/api/prom/push"),
    prometheusUsername: asString(stack.hmInstancePromId),
    prometheusPassword: metricsToken.token,
    metricsPolicyId: metricsPolicy.id,
    otlpPolicyId: otlpPolicy.id,
    otlpToken: otlpToken.token,
  }
}

async function cleanupManagedPolicies(token: string | undefined, regionSlug: string | undefined, policyIds: Array<string | undefined>) {
  if (!token || !regionSlug) {
    return
  }

  for (const policyId of policyIds) {
    if (!policyId) {
      continue
    }
    await grafanaDelete(token, `/api/v1/accesspolicies/${encodeURIComponent(policyId)}?region=${encodeURIComponent(regionSlug)}`)
  }
}

class GrafanaCloudResourceProvider implements pulumi.dynamic.ResourceProvider {
  public async create(inputs: GrafanaCloudResourceInputs): Promise<pulumi.dynamic.CreateResult> {
    const outs = await reconcile(inputs)
    return {
      id: `${outs.stackSlug}:${outs.stackId}`,
      outs,
    }
  }

  public async diff(
    id: pulumi.ID,
    olds: GrafanaCloudResourceOutputs,
    news: GrafanaCloudResourceInputs,
  ): Promise<pulumi.dynamic.DiffResult> {
    const trackedKeys: Array<keyof GrafanaCloudResourceInputs> = [
      "accessPolicyToken",
      "stackSlug",
      "logsPolicyName",
      "logsPolicyDisplayName",
      "logsTokenName",
      "logsTokenDisplayName",
      "metricsPolicyName",
      "metricsPolicyDisplayName",
      "metricsTokenName",
      "metricsTokenDisplayName",
      "otlpPolicyName",
      "otlpPolicyDisplayName",
      "otlpTokenName",
      "otlpTokenDisplayName",
    ]

    const changes = trackedKeys.some((key) => olds[key] !== news[key])

    return {
      changes,
    }
  }

  public async update(
    id: pulumi.ID,
    olds: GrafanaCloudResourceOutputs,
    news: GrafanaCloudResourceInputs,
  ): Promise<pulumi.dynamic.UpdateResult> {
    const outs = await reconcile(news)

    if (
      olds.regionSlug &&
      news.accessPolicyToken &&
      (olds.logsPolicyId !== outs.logsPolicyId ||
        olds.metricsPolicyId !== outs.metricsPolicyId ||
        olds.otlpPolicyId !== outs.otlpPolicyId)
    ) {
      await cleanupManagedPolicies(news.accessPolicyToken, olds.regionSlug, [
        olds.logsPolicyId,
        olds.metricsPolicyId,
        olds.otlpPolicyId,
      ])
    }

    return { outs }
  }

  public async delete(id: pulumi.ID, props: GrafanaCloudResourceOutputs): Promise<void> {
    await cleanupManagedPolicies(props.accessPolicyToken, props.regionSlug, [
      props.logsPolicyId,
      props.metricsPolicyId,
      props.otlpPolicyId,
    ])
  }
}

export class GrafanaCloudResource extends pulumi.dynamic.Resource {
  public readonly stackId!: pulumi.Output<string>
  public readonly stackUrl!: pulumi.Output<string>
  public readonly stackSlug!: pulumi.Output<string>
  public readonly regionSlug!: pulumi.Output<string>
  public readonly lokiInstanceId!: pulumi.Output<string>
  public readonly lokiInstanceUrl!: pulumi.Output<string>
  public readonly lokiHost!: pulumi.Output<string>
  public readonly lokiUsername!: pulumi.Output<string>
  public readonly lokiPassword!: pulumi.Output<string>
  public readonly prometheusInstanceId!: pulumi.Output<string>
  public readonly prometheusInstanceUrl!: pulumi.Output<string>
  public readonly prometheusRemoteWriteUrl!: pulumi.Output<string>
  public readonly prometheusUsername!: pulumi.Output<string>
  public readonly prometheusPassword!: pulumi.Output<string>
  public readonly otlpToken!: pulumi.Output<string>

  public constructor(name: string, args: GrafanaCloudResourceArgs, opts?: pulumi.CustomResourceOptions) {
    super(
      new GrafanaCloudResourceProvider(),
      name,
      {
        ...args,
        stackId: undefined,
        stackUrl: undefined,
        regionSlug: undefined,
        lokiInstanceId: undefined,
        lokiInstanceUrl: undefined,
        lokiHost: undefined,
        lokiUsername: undefined,
        lokiPassword: undefined,
        prometheusInstanceId: undefined,
        prometheusInstanceUrl: undefined,
        prometheusRemoteWriteUrl: undefined,
        prometheusUsername: undefined,
        prometheusPassword: undefined,
        otlpToken: undefined,
      },
      {
      ...opts,
      additionalSecretOutputs: ["lokiPassword", "prometheusPassword", "otlpToken"],
      },
    )
  }
}
