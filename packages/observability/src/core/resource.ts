export interface ResourceInput {
  serviceName: string
  deploymentEnv: string
  serviceVersion?: string
}

export interface BuiltResource {
  attributes: Record<string, string | number | boolean | undefined>
}

export function buildResource(input: ResourceInput): BuiltResource {
  const attrs: Record<string, string | number | boolean | undefined> = {
    "service.name": input.serviceName,
    "deployment.environment": input.deploymentEnv,
  }
  if (input.serviceVersion) attrs["service.version"] = input.serviceVersion
  return { attributes: attrs }
}
