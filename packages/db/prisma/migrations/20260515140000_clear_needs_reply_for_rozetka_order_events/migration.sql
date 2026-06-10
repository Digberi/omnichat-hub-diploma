-- Clear needsReply for Rozetka conversations whose LATEST incoming message is a
-- synthetic order event. These were wrongly marked needsReply=true by the
-- previous applyIncomingMessageEffects path (operator has nothing to reply to).
--
-- Strategy: for each Rozetka conversation, find the most recent IN message; if
-- its externalMessageId is order:*, the inbox shouldn't show a "needs reply"
-- badge. We don't touch conversations whose latest incoming is a real chat
-- message — those legitimately wait for an operator reply.
WITH latest_in AS (
  SELECT DISTINCT ON (m."conversationId")
    m."conversationId",
    m."externalMessageId"
  FROM "Message" m
  WHERE m."direction" = 'IN'
  ORDER BY m."conversationId", m."createdAt" DESC
)
UPDATE "Conversation" c
SET "needsReply" = false
FROM latest_in
WHERE c."id" = latest_in."conversationId"
  AND c."channel" = 'ROZETKA'
  AND c."needsReply" = true
  AND latest_in."externalMessageId" LIKE 'order:%';
