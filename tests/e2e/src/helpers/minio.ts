import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3"

function nonEmptyOr(value: string | undefined, fallback: string): string {
  const v = typeof value === "string" ? value.trim() : ""
  return v.length > 0 ? v : fallback
}

export function getMinioConfig() {
  return {
    endpoint: nonEmptyOr(process.env.STORAGE_ENDPOINT, "http://localhost:9000"),
    region: nonEmptyOr(process.env.STORAGE_REGION, "us-east-1"),
    accessKeyId: nonEmptyOr(process.env.STORAGE_ACCESS_KEY, "minioadmin"),
    secretAccessKey: nonEmptyOr(process.env.STORAGE_SECRET_KEY, "minioadmin"),
    bucket: nonEmptyOr(process.env.STORAGE_BUCKET, "omnichat"),
  } as const
}

export function createMinioS3Client(): S3Client {
  const cfg = getMinioConfig()
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  })
}

export async function deleteMinioObject(input: { key: string }): Promise<void> {
  const cfg = getMinioConfig()
  const client = createMinioS3Client()
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: cfg.bucket,
        Key: input.key,
      }),
    )
  } finally {
    client.destroy()
  }
}
