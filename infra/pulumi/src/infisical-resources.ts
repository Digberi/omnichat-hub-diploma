import * as pulumi from "@pulumi/pulumi"

// ---------------------------------------------------------------------------
// Shared auth + HTTP helpers
// ---------------------------------------------------------------------------

interface CommonInputs {
  clientId: string
  clientSecret: string
  siteUrl: string
}

async function loginAndGetToken(inputs: CommonInputs): Promise<string> {
  const url = `${inputs.siteUrl.replace(/\/$/, "")}/api/v1/auth/universal-auth/login`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: inputs.clientId, clientSecret: inputs.clientSecret }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Infisical UA login -> ${res.status}: ${text}`)
  }
  const body = (await res.json()) as { accessToken?: string; access_token?: string }
  const accessToken = body.accessToken ?? body.access_token
  if (!accessToken) throw new Error("Infisical UA login: no accessToken in response")
  return accessToken
}

async function infisicalRequest(
  ctx: CommonInputs,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<any> {
  const accessToken = await loginAndGetToken(ctx)
  const url = `${ctx.siteUrl.replace(/\/$/, "")}${path}`
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Infisical ${method} ${path} -> ${res.status}: ${text}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ---------------------------------------------------------------------------
// InfisicalKmsKey — creates / deletes a KEK in Infisical KMS
// ---------------------------------------------------------------------------

interface KmsKeyInputs extends CommonInputs {
  projectId: string
  name: string
  description?: string
}

interface KmsKeyOutputs extends KmsKeyInputs {
  keyId: string
}

const kmsKeyProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: KmsKeyInputs): Promise<pulumi.dynamic.CreateResult> {
    const body = await infisicalRequest(inputs, "POST", "/api/v1/kms/keys", {
      projectId: inputs.projectId,
      name: inputs.name,
      description: inputs.description ?? "",
      encryptionAlgorithm: "aes-256-gcm",
    })
    // Defensive extraction — Infisical may return { key: { id } } or { id } or { data: { id } }
    const keyId: string =
      body?.key?.id ?? body?.id ?? body?.data?.id ?? body?.data?.key?.id
    if (!keyId) {
      throw new Error(`Infisical KMS key create: no id in response: ${JSON.stringify(body)}`)
    }
    return { id: keyId, outs: { ...inputs, keyId } }
  },

  async delete(id: string, props: KmsKeyOutputs): Promise<void> {
    await infisicalRequest(props, "DELETE", `/api/v1/kms/keys/${id}`)
  },

  async diff(
    _id: string,
    prev: KmsKeyOutputs,
    next: KmsKeyInputs,
  ): Promise<pulumi.dynamic.DiffResult> {
    const replaces: string[] = []
    if (prev.name !== next.name) replaces.push("name")
    if (prev.projectId !== next.projectId) replaces.push("projectId")
    return { changes: replaces.length > 0, replaces }
  },

  async read(id: string, props: KmsKeyOutputs): Promise<pulumi.dynamic.ReadResult> {
    // KMS keys are immutable after creation — return current state as-is.
    return { id, props }
  },
}

export class InfisicalKmsKey extends pulumi.dynamic.Resource {
  public readonly keyId!: pulumi.Output<string>

  constructor(
    name: string,
    args: {
      clientId: pulumi.Input<string>
      clientSecret: pulumi.Input<string>
      siteUrl: pulumi.Input<string>
      projectId: pulumi.Input<string>
      name: pulumi.Input<string>
      description?: pulumi.Input<string>
    },
    opts?: pulumi.CustomResourceOptions,
  ) {
    super(kmsKeyProvider, name, { keyId: undefined, ...args }, opts)
  }
}
