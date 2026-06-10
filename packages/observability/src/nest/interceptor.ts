import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common"
import { type Observable, tap } from "rxjs"
import { trace } from "@opentelemetry/api"

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle()

    const span = trace.getActiveSpan()
    if (!span || !span.isRecording()) return next.handle()

    const req = context.switchToHttp().getRequest()
    const userId = req?.user?.id
    if (typeof userId === "string") span.setAttribute("omnichat.user_id", userId)

    const orgId = req?.user?.orgId ?? req?.user?.actor_org_id
    if (typeof orgId === "string") span.setAttribute("omnichat.actor_org_id", orgId)

    const params = req?.params ?? {}
    if (typeof params.conversationId === "string") {
      span.setAttribute("omnichat.conversation_id", params.conversationId)
    }
    if (typeof params.channelAccountId === "string") {
      span.setAttribute("omnichat.channel_account_id", params.channelAccountId)
    }

    const headers = req?.headers ?? {}
    const requestId = headers["x-request-id"]
    if (typeof requestId === "string") span.setAttribute("omnichat.request_id", requestId)

    // channel_type: requires controller metadata via @SetMetadata("channelType", "olx")
    const handler = context.getHandler()
    const channelType =
      typeof Reflect.getMetadata === "function" ? Reflect.getMetadata("channelType", handler) : undefined
    if (typeof channelType === "string") span.setAttribute("omnichat.channel_type", channelType)

    return next.handle().pipe(
      tap({
        error: (err) => {
          if (err && typeof err === "object") span.recordException(err as Error)
        },
      }),
    )
  }
}
