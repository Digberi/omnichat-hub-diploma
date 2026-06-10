import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common"
import { ErrorCode } from "@omnichat/contracts"
import { Prisma } from "@omnichat/db"
import * as Sentry from "@sentry/node"
import type { Request, Response } from "express"
import type { Logger } from "nestjs-pino"

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  private capture(exception: unknown, context: { requestId?: string; path?: string; method?: string }) {
    if (!Sentry.getClient()) return

    Sentry.withScope((scope) => {
      if (context.requestId) scope.setTag("request_id", context.requestId)
      if (context.path) scope.setTag("http.path", context.path)
      if (context.method) scope.setTag("http.method", context.method)
      scope.setTag("error.boundary", "http-exception-filter")
      Sentry.captureException(exception)
    })
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest<Request>()

    const requestId = (() => {
      const headerId = req.headers["x-request-id"]
      if (typeof headerId === "string" && headerId.length > 0) return headerId

      const reqAny = req as any
      if (typeof reqAny?.id === "string" && reqAny.id.length > 0) return reqAny.id

      const resHeader = res.getHeader("x-request-id")
      if (typeof resHeader === "string" && resHeader.length > 0) return resHeader
      if (Array.isArray(resHeader) && typeof resHeader[0] === "string" && resHeader[0].length > 0) return resHeader[0]

      return undefined
    })()

    const path = req.originalUrl ?? req.url

    const isErrorCode = (value: unknown): value is ErrorCode =>
      typeof value === "string" && (Object.values(ErrorCode) as string[]).includes(value)

    const codeFromStatus = (status: number, hasValidationIssues: boolean): ErrorCode => {
      switch (status) {
        case 400:
          return hasValidationIssues ? ErrorCode.ValidationFailed : ErrorCode.BadRequest
        case 401:
          return ErrorCode.Unauthorized
        case 403:
          return ErrorCode.Forbidden
        case 404:
          return ErrorCode.ResourceNotFound
        case 409:
          return ErrorCode.Conflict
        case 429:
          return ErrorCode.TooManyRequests
        default:
          return ErrorCode.Internal
      }
    }

    const send = (input: {
      statusCode: number
      code: ErrorCode
      error: string
      message: string
      details?: unknown
    }) => {
      const body: any = {
        code: input.code,
        statusCode: input.statusCode,
        error: input.error,
        message: input.message,
        requestId: requestId ?? null,
        path,
        ...(input.details !== undefined ? { details: input.details } : {}),
      }
      res.status(input.statusCode).json(body)
    }

    // Prisma errors (safety net).
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        send({
          statusCode: HttpStatus.CONFLICT,
          code: ErrorCode.Conflict,
          error: "Conflict",
          message: "Conflict",
        })
        return
      }
      if (exception.code === "P2025") {
        send({
          statusCode: HttpStatus.NOT_FOUND,
          code: ErrorCode.ResourceNotFound,
          error: "NotFound",
          message: "Resource not found",
        })
        return
      }

      this.logger.error(
        {
          err: exception,
          requestId,
          path,
          method: req.method,
        },
        "Unhandled Prisma error",
      )
      this.capture(exception, { requestId, path, method: req.method })

      send({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ErrorCode.Internal,
        error: "InternalServerError",
        message: "Internal server error",
      })
      return
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const response = exception.getResponse()

      let error = "Error"
      let message = "Error"
      let details: unknown | undefined
      let hasValidationIssues = false
      let explicitCode: ErrorCode | undefined

      if (typeof response === "string") {
        message = response
        error = exception.name ?? "Error"
      } else {
        const r = response as any
        if (isErrorCode(r?.code)) explicitCode = r.code

        if (typeof r?.error === "string") error = r.error
        else error = exception.name ?? "Error"

        const rawMsg = r?.message
        if (Array.isArray(rawMsg)) {
          hasValidationIssues = true
          message = "Validation failed"
          details = { issues: rawMsg }
        } else if (typeof rawMsg === "string") {
          message = rawMsg
        } else if (rawMsg != null) {
          message = String(rawMsg)
        } else if (typeof r?.error === "string") {
          message = r.error
        } else if (typeof exception.message === "string" && exception.message.length > 0) {
          message = exception.message
        }

        if (r?.details !== undefined) details = r.details
      }

      const code = explicitCode ?? codeFromStatus(status, hasValidationIssues)

      // Never leak details for 5xx.
      if (status >= 500) {
        this.logger.error(
          {
            err: exception,
            requestId,
            path,
            method: req.method,
          },
          "HTTP exception (5xx)",
        )
        this.capture(exception, { requestId, path, method: req.method })
        send({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          code: ErrorCode.Internal,
          error: "InternalServerError",
          message: "Internal server error",
        })
        return
      }

      send({
        statusCode: status,
        code,
        error,
        message,
        ...(details !== undefined ? { details } : {}),
      })
      return
    }

    this.logger.error(
      {
        err: exception,
        requestId,
        path,
        method: req.method,
      },
      "Unhandled exception",
    )
    this.capture(exception, { requestId, path, method: req.method })

    send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.Internal,
      error: "InternalServerError",
      message: "Internal server error",
    })
  }
}
