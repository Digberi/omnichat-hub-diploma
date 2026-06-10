import { ErrorCode } from "./enums"

export type ErrorResponseV1 = {
  code: ErrorCode
  message: string
  requestId?: string

  // Optional metadata for debugging / client behavior.
  statusCode?: number
  error?: string
  path?: string
  details?: unknown
}
