"use client"

import { useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"

import { getAccessToken } from "@/lib/tokens"

/**
 * Legacy /chat/<id> URL — kept for mobile push notifications, e-mail links,
 * etc. that may still point here. Redirects to the canonical /inbox/<id>
 * once authentication has been verified, so the conversation opens inside
 * the inbox layout (sidebar visible) instead of standalone.
 */
export default function ChatPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const conversationId = params?.id ?? ""
  const token = useMemo(() => getAccessToken(), [])

  useEffect(() => {
    if (!token) {
      router.replace(`/login?next=/inbox/${encodeURIComponent(conversationId)}`)
      return
    }
    if (!conversationId) {
      router.replace("/inbox")
      return
    }
    router.replace(`/inbox/${encodeURIComponent(conversationId)}`)
  }, [conversationId, router, token])

  return null
}
