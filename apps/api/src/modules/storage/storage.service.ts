import { Injectable, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketLifecycleConfigurationCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

function nonEmptyOr(value: string | undefined, fallback: string): string {
  const v = typeof value === "string" ? value.trim() : ""
  return v.length > 0 ? v : fallback
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly requestTimeoutMs: number
  private readonly retryAttempts: number
  private readonly retryBaseDelayMs: number
  private readonly attachmentTtlDays: number
  private readonly applyLifecycle: boolean
  private ensuredBucket = false
  private ensuredLifecycle = false
  private readonly operationStats = new Map<
    string,
    {
      total: number
      failed: number
      retried: number
      totalDurationMs: number
      samples: number
      lastErrorAt?: string | null
      lastErrorMessage?: string | null
      lastSuccessAt?: string | null
      lastFailureAt?: string | null
    }
  >()
  private lastPingAt: string | null = null

  async onModuleInit() {
    // Best-effort init (bucket + lifecycle) so failures surface early in logs/metrics.
    // Readiness (`/ready`) is the strict gate.
    await this.ensureBucket().catch(() => undefined)
  }

  constructor(private readonly config: ConfigService) {
    const endpoint = nonEmptyOr(this.config.get<string>("STORAGE_ENDPOINT"), "http://localhost:9000")
    const region = nonEmptyOr(this.config.get<string>("STORAGE_REGION"), "us-east-1")
    const accessKeyId = nonEmptyOr(this.config.get<string>("STORAGE_ACCESS_KEY"), "minioadmin")
    const secretAccessKey = nonEmptyOr(this.config.get<string>("STORAGE_SECRET_KEY"), "minioadmin")
    this.bucket = nonEmptyOr(this.config.get<string>("STORAGE_BUCKET"), "omnichat")
    this.requestTimeoutMs = this.config.get<number>("STORAGE_REQUEST_TIMEOUT_MS") ?? 5000
    this.retryAttempts = this.config.get<number>("STORAGE_RETRY_ATTEMPTS") ?? 3
    this.retryBaseDelayMs = this.config.get<number>("STORAGE_RETRY_DELAY_MS") ?? 100
    this.attachmentTtlDays = this.config.get<number>("ATTACHMENT_TTL_DAYS") ?? 7

    const explicitLifecycle = this.config.get<boolean>("STORAGE_APPLY_LIFECYCLE")
    this.applyLifecycle = explicitLifecycle ?? true

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
  }

  getMetrics() {
    const operations: Record<
      string,
      {
        total: number
        failed: number
        retried: number
        avgDurationMs: number | null
        lastErrorAt: string | null
        lastErrorMessage: string | null
        lastSuccessAt: string | null
        lastFailureAt: string | null
      }
    > = {}

    for (const [operation, value] of this.operationStats.entries()) {
      operations[operation] = {
        total: value.total,
        failed: value.failed,
        retried: value.retried,
        avgDurationMs: value.samples > 0 ? Math.round(value.totalDurationMs / value.samples) : null,
        lastErrorAt: value.lastErrorAt ?? null,
        lastErrorMessage: value.lastErrorMessage ?? null,
        lastSuccessAt: value.lastSuccessAt ?? null,
        lastFailureAt: value.lastFailureAt ?? null,
      }
    }

    return {
      bucket: this.bucket,
      endpoint: nonEmptyOr(this.config.get<string>("STORAGE_ENDPOINT"), "http://localhost:9000"),
      lastPingAt: this.lastPingAt,
      operations,
    }
  }

  private recordAttempt(
    operation: string,
    ms: number,
    ok: boolean,
    retryCount: number,
    errorMessage?: string,
  ): void {
    const now = new Date().toISOString()
    const state = this.operationStats.get(operation) ?? {
      total: 0,
      failed: 0,
      retried: 0,
      totalDurationMs: 0,
      samples: 0,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastSuccessAt: null,
      lastFailureAt: null,
    }

    state.total += 1
    state.samples += 1
    state.totalDurationMs += ms
    state.retried += retryCount

    if (ok) {
      state.lastSuccessAt = now
    } else {
      state.failed += 1
      state.lastFailureAt = now
      state.lastErrorAt = now
      if (errorMessage) {
        state.lastErrorMessage = errorMessage
      }
    }

    this.operationStats.set(operation, state)
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async executeWithRetry<T>(opts: { operation: string; action: () => Promise<T> }): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt < this.retryAttempts; attempt += 1) {
      try {
        const startedAt = Date.now()
        const result = await opts.action()
        this.recordAttempt(opts.operation, Date.now() - startedAt, true, attempt)
        return result
      } catch (err) {
        lastError = err

        if (attempt + 1 >= this.retryAttempts) {
          this.recordAttempt(opts.operation, 0, false, attempt, String(err))
          const e = err instanceof Error ? err : new Error(String(err))
          ;(e as any).storageOperation = opts.operation
          ;(e as any).storageAttempts = attempt + 1
          throw e
        }

        const delay = this.retryBaseDelayMs * 2 ** attempt
        await this.delay(delay)
      }
    }

    throw lastError
  }

  private async ensureBucket(): Promise<void> {
    if (this.ensuredBucket) {
      if (!this.ensuredLifecycle) await this.ensureLifecycle()
      return
    }
    try {
      await this.executeWithRetry({
        operation: "head-bucket",
        action: () =>
          this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
            abortSignal: AbortSignal.timeout(this.requestTimeoutMs),
          }),
      })
    } catch (err: any) {
      const status = err?.$metadata?.httpStatusCode
      if (status !== 404) throw err
      await this.executeWithRetry({
        operation: "create-bucket",
        action: () =>
          this.client.send(new CreateBucketCommand({ Bucket: this.bucket }), {
            abortSignal: AbortSignal.timeout(this.requestTimeoutMs),
          }),
      })
    }
    this.ensuredBucket = true
    await this.ensureLifecycle()
  }

  private async ensureLifecycle(): Promise<void> {
    if (this.ensuredLifecycle) return

    if (!this.applyLifecycle) {
      this.ensuredLifecycle = true
      return
    }
    if (!Number.isFinite(this.attachmentTtlDays) || this.attachmentTtlDays <= 0) {
      this.ensuredLifecycle = true
      return
    }

    const ourRule = {
      ID: "expire-attachments",
      Status: "Enabled",
      Filter: { Prefix: "attachments/" },
      Expiration: { Days: this.attachmentTtlDays },
    } as const

    let existingRules: any[] = []
    try {
      const current = await this.executeWithRetry({
        operation: "get-bucket-lifecycle",
        action: () =>
          this.client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: this.bucket }), {
            abortSignal: AbortSignal.timeout(this.requestTimeoutMs),
          }),
      })
      existingRules = Array.isArray((current as any)?.Rules) ? (current as any).Rules : []
    } catch (err: any) {
      const status = err?.$metadata?.httpStatusCode
      if (status === 404) {
        existingRules = []
      } else if (status === 403) {
        // Avoid repeated attempts if the principal cannot read lifecycle.
        this.ensuredLifecycle = true
        return
      } else {
        // Best-effort: do not overwrite unknown lifecycle config on transient errors.
        return
      }
    }

    const mergedRules = [...existingRules.filter((r) => r?.ID !== ourRule.ID), ourRule]

    try {
      await this.executeWithRetry({
        operation: "put-bucket-lifecycle",
        action: () =>
          this.client.send(
            new PutBucketLifecycleConfigurationCommand({
              Bucket: this.bucket,
              LifecycleConfiguration: {
                Rules: mergedRules,
              },
            }),
            { abortSignal: AbortSignal.timeout(this.requestTimeoutMs) },
          ),
      })
      this.ensuredLifecycle = true
    } catch (err: any) {
      const status = err?.$metadata?.httpStatusCode
      if (status === 403) {
        // Avoid repeated attempts if the principal cannot write lifecycle.
        this.ensuredLifecycle = true
        return
      }
      // Best-effort. In production this is usually managed by IaC.
    }
  }

  async ping(): Promise<void> {
    const startedAt = Date.now()
    await this.ensureBucket()
    await this.executeWithRetry({
      operation: "healthcheck",
      action: () =>
        this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
          abortSignal: AbortSignal.timeout(this.requestTimeoutMs),
        }),
    })
    this.lastPingAt = new Date(startedAt).toISOString()
  }

  async putObject(input: { key: string; body: Buffer; contentType: string; originalName?: string | null }) {
    await this.ensureBucket()
    await this.executeWithRetry({
      operation: "put-object",
      action: () =>
        this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: input.key,
            Body: input.body,
            ContentType: input.contentType,
            ContentDisposition: input.originalName ? `attachment; filename="${input.originalName}"` : "attachment",
            Metadata: input.originalName ? { originalName: input.originalName } : undefined,
          }),
          { abortSignal: AbortSignal.timeout(this.requestTimeoutMs) },
        ),
    })
  }

  async deleteObject(input: { key: string }) {
    await this.ensureBucket()
    await this.executeWithRetry({
      operation: "delete-object",
      action: () =>
        this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: input.key }), {
          abortSignal: AbortSignal.timeout(this.requestTimeoutMs),
        }),
    })
  }

  async deleteObjects(input: { keys: string[] }) {
    await this.ensureBucket()
    const keys = input.keys.map((k) => k.trim()).filter(Boolean)
    if (keys.length === 0) return

    // S3 delete is limited to 1000 keys per request.
    for (let offset = 0; offset < keys.length; offset += 1000) {
      const chunk = keys.slice(offset, offset + 1000)
      await this.executeWithRetry({
        operation: "delete-objects",
        action: () =>
          this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: {
                Objects: chunk.map((k) => ({ Key: k })),
              },
            }),
            { abortSignal: AbortSignal.timeout(this.requestTimeoutMs) },
          ),
      })
    }
  }

  async getPresignedDownloadUrl(input: { key: string; expiresInSeconds: number }): Promise<string> {
    await this.ensureBucket()
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: input.key })
    return this.executeWithRetry({
      operation: "presign-url",
      action: async () => getSignedUrl(this.client, cmd, { expiresIn: input.expiresInSeconds }),
    })
  }

  async headObject(input: { key: string }): Promise<boolean> {
    await this.ensureBucket()
    try {
      await this.executeWithRetry({
        operation: "head-object",
        action: () =>
          this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: input.key }), {
            abortSignal: AbortSignal.timeout(this.requestTimeoutMs),
          }),
      })
      return true
    } catch (err: any) {
      const status = err?.$metadata?.httpStatusCode
      if (status === 404) return false
      throw err
    }
  }
}
