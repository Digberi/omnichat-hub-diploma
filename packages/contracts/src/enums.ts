export enum RealtimeEventType {
  ConversationUpdated = "conversation.updated",
  MessageNew = "message.new",
  MessageUpdated = "message.updated",
  SyncError = "sync.error",
  PushError = "push.error",
  MetricsRollupCompleted = "metrics.rollup.completed",
}

export enum FolderScope {
  ALL = "ALL",
  UNREAD = "UNREAD",
  CHANNEL = "CHANNEL",
  SNOOZED = "SNOOZED",
  ARCHIVED = "ARCHIVED",
}

export enum Channel {
  OLX = "OLX",
  PROM = "PROM",
  ROZETKA = "ROZETKA",
}

export enum ChannelAuthType {
  OAUTH = "OAUTH",
  TOKEN = "TOKEN",
}

export enum DevicePlatform {
  IOS = "IOS",
  ANDROID = "ANDROID",
  WEB = "WEB",
}

export enum TemplateScope {
  GLOBAL = "GLOBAL",
  CHANNEL = "CHANNEL",
}

export enum ErrorCode {
  BadRequest = "BAD_REQUEST",
  Unauthorized = "UNAUTHORIZED",
  Forbidden = "FORBIDDEN",
  ValidationFailed = "VALIDATION_FAILED",
  ResourceNotFound = "RESOURCE_NOT_FOUND",
  Conflict = "CONFLICT",
  TooManyRequests = "TOO_MANY_REQUESTS",
  Internal = "INTERNAL",
}
