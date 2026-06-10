-- Retroactive cleanup: OLX/Rozetka chat sync used to leave needsReply=true on
-- conversations even when the seller had already replied via the channel's
-- native UI. The runtime fix (apps/workers/src/modules/channel-sync/*) now
-- clears needsReply on synced OUT messages, but this migration is needed for
-- the existing backlog of stuck-true rows.
--
-- Rule: if the latest message on a conversation has direction='OUT', the seller
-- has responded and the conversation should not be flagged as needing a reply.
-- Restricted to channels where the bug existed (OLX, ROZETKA). Idempotent:
-- AND clause only touches rows that are currently in the wrong state.
WITH latest_msg AS (
  SELECT DISTINCT ON (m."conversationId")
    m."conversationId",
    m."direction"
  FROM "Message" m
  ORDER BY m."conversationId", m."createdAt" DESC
)
UPDATE "Conversation" c
SET "needsReply" = false
FROM latest_msg
WHERE c."id" = latest_msg."conversationId"
  AND c."channel" IN ('OLX', 'ROZETKA')
  AND c."needsReply" = true
  AND latest_msg."direction" = 'OUT';
