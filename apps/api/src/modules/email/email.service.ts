import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Resend } from "resend"

type SendEmailInput = {
  to: string
  subject: string
  text: string
  html: string
  idempotencyKey?: string
}

type SendAuthOtpInput = {
  to: string
  code: string
  ttlMin: number
  idempotencyKey?: string
}

type EmailProvider = "console" | "resend"

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private readonly provider: EmailProvider
  private readonly resendClient: Resend | null

  constructor(private readonly config: ConfigService) {
    const rawProvider = this.config.get<string>("EMAIL_PROVIDER") ?? "console"
    this.provider = rawProvider === "resend" ? "resend" : "console"
    this.resendClient =
      this.provider === "resend" ? new Resend(this.config.getOrThrow<string>("RESEND_API_KEY")) : null
  }

  async sendAuthOtp(input: SendAuthOtpInput): Promise<void> {
    const subject = `${input.code} is your OmniChat sign-in code`
    const text =
      `Your OmniChat sign-in code is ${input.code}.\n\n` +
      `It expires in ${input.ttlMin} minutes.\n\n` +
      `If you did not request this code, you can ignore this email.`
    const html =
      `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">` +
      `<p>Your OmniChat sign-in code is:</p>` +
      `<p style="font-size:32px;font-weight:700;letter-spacing:4px;margin:16px 0">${input.code}</p>` +
      `<p>It expires in ${input.ttlMin} minutes.</p>` +
      `<p>If you did not request this code, you can ignore this email.</p>` +
      `</div>`

    await this.send({
      to: input.to,
      subject,
      text,
      html,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    })
  }

  private async send(input: SendEmailInput): Promise<void> {
    if (this.provider === "console") {
      // eslint-disable-next-line no-console
      console.log(`[email] to=${input.to} subject="${input.subject}"\n${input.text}`)
      return
    }

    const resend = this.resendClient
    if (!resend) {
      throw new Error("Resend client is not configured")
    }

    const from = this.config.getOrThrow<string>("EMAIL_FROM")
    const replyTo = this.config.get<string>("EMAIL_REPLY_TO") || undefined
    const payload = {
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(replyTo ? { replyTo } : {}),
    }
    const options = input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined

    const { data, error } = await resend.emails.send(payload, options)
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`)
    }

    this.logger.log(`Email sent to ${input.to} (${data?.id ?? "no-id"})`)
  }
}
