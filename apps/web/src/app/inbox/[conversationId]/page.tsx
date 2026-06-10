"use client"

import { use } from "react"

import { ChatWindow, EmptyChatState } from "@/components/chat/ChatWindow"
import { useAppStore } from "@/store"

interface InboxConversationPageProps {
  // Next 16 makes route params async — unwrap with `use()`.
  params: Promise<{ conversationId: string }>
}

// Renders inside <InboxLayout>'s `{children}` slot when the URL targets a
// specific conversation. The sidebar stays mounted; only this component
// re-renders when the user picks a different chat.
const InboxConversationPage = ({ params }: InboxConversationPageProps) => {
  const { conversationId } = use(params)
  // Read from store rather than re-fetching: the layout's bootstrap call
  // already populated `conversations` for the workspace. If the id isn't in
  // the store (deep link to a chat we don't have), fall back to the empty
  // state instead of rendering nothing.
  const conversation = useAppStore((s) => s.conversations.find((c) => c.id === conversationId))
  if (!conversation) return <EmptyChatState />
  return <ChatWindow conversation={conversation} />
}

export default InboxConversationPage
