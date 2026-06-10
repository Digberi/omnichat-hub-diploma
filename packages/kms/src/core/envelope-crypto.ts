import { aesGcmDecrypt, aesGcmEncrypt } from "./aes-gcm"
import { formatCiphertext, parseCiphertext } from "./ciphertext"
import type { DekManager } from "./dek-manager"
import { trace, type Span } from "@opentelemetry/api"

const tracer = trace.getTracer("@omnichat/kms")

export interface EnvelopeCryptoServiceOptions {
  dekManager: DekManager
}

export class EnvelopeCryptoService {
  constructor(private readonly opts: EnvelopeCryptoServiceOptions) {}

  async encrypt(workspaceId: string, payload: unknown): Promise<string> {
    return tracer.startActiveSpan("kms.envelope.encrypt", async (span: Span) => {
      try {
        span.setAttribute("omnichat.workspace_id", workspaceId)
        const { dek, version } = await this.opts.dekManager.getActiveDek(workspaceId)
        span.setAttribute("omnichat.dek.version", version)
        const plaintext = Buffer.from(JSON.stringify(payload), "utf8")
        const { iv, tag, ciphertext } = aesGcmEncrypt(dek, plaintext)
        return formatCiphertext({ version, iv, tag, ciphertext })
      } finally {
        span.end()
      }
    })
  }

  async decrypt(workspaceId: string, encoded: string): Promise<unknown> {
    return tracer.startActiveSpan("kms.envelope.decrypt", async (span: Span) => {
      try {
        span.setAttribute("omnichat.workspace_id", workspaceId)
        const { version, iv, tag, ciphertext } = parseCiphertext(encoded)
        span.setAttribute("omnichat.dek.version", version)
        const dek = await this.opts.dekManager.getDekByVersion(workspaceId, version)
        const plaintext = aesGcmDecrypt(dek, { iv, tag, ciphertext })
        return JSON.parse(plaintext.toString("utf8"))
      } finally {
        span.end()
      }
    })
  }
}
