-- Re-run of 20260518150000 backfill with the correct ordering. The previous
-- migration used `ORDER BY createdAt DESC` to pick each conversation's latest
-- message, but the OLX/Rozetka workers batch-insert every message of a thread
-- in a single tick — they all share an identical `createdAt`. Postgres'
-- DISTINCT ON tie-break is then undefined, so the first migration silently
-- picked an arbitrary message per conversation and only flipped `needsReply`
-- when that arbitrary pick happened to be OUT.
--
-- Order by `sentAt` (the provider's wall-clock timestamp) first, fall back to
-- `createdAt` for our own outgoing rows where `sentAt` might be null when the
-- row was first inserted.
WITH latest_msg AS (
  SELECT DISTINCT ON (m."conversationId")
    m."conversationId",
    m."direction"
  FROM "Message" m
  ORDER BY
    m."conversationId",
    m."sentAt" DESC NULLS LAST,
    m."createdAt" DESC
)
UPDATE "Conversation" c
SET "needsReply" = false
FROM latest_msg
WHERE c."id" = latest_msg."conversationId"
  AND c."channel" IN ('OLX', 'ROZETKA')
  AND c."needsReply" = true
  AND latest_msg."direction" = 'OUT';
