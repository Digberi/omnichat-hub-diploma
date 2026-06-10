import { RealtimeEventType } from "./enums"

export type ConversationUpdatedPayload = {
  workspaceId: string
  conversationId: string
  at: string
  patch: Record<string, unknown>
}

export type MessageNewPayload = {
  workspaceId: string
  conversationId: string
  message: Record<string, unknown>
}

export type MessageUpdatedPayload = {
  workspaceId: string
  messageId: string
  patch: Record<string, unknown>
}

export type SyncErrorPayload = {
  workspaceId: string
  channelAccountId: string
  error: string
  at: string
}

export type OutboxPayloadV1 = {
  schemaVersion: 1
  workspaceId: string
  occurredAt: string
  data: Record<string, unknown>
}

export type EventEnvelope =
  | { type: RealtimeEventType.ConversationUpdated; payload: ConversationUpdatedPayload }
  | { type: RealtimeEventType.MessageNew; payload: MessageNewPayload }
  | { type: RealtimeEventType.MessageUpdated; payload: MessageUpdatedPayload }
  | { type: RealtimeEventType.SyncError; payload: SyncErrorPayload }
  | { type: RealtimeEventType.PushError; payload: SyncErrorPayload }
  | { type: RealtimeEventType.MetricsRollupCompleted; payload: { workspaceId: string; at: string } }

