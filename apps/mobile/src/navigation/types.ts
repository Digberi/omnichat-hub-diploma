export type RootStackParamList = {
  Login: undefined
  Inbox: undefined
  Chat: { conversationId: string; title?: string }
  Templates: undefined
  Settings: undefined
  Context: { conversationId: string }
  Tags: undefined
  Statuses: undefined
}
