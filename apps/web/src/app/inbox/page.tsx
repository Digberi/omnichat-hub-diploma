"use client"

import { EmptyChatState } from "@/components/chat/ChatWindow"

// Renders inside <InboxLayout>'s `{children}` slot when no conversation is
// selected. The sidebar (search, tabs, list) lives in the layout, so it
// stays mounted while the user clicks between this empty state and a
// specific conversation under /inbox/<id>.
const InboxIndexPage = () => <EmptyChatState />

export default InboxIndexPage
