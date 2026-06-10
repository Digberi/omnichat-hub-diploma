-- Backfill: tag existing OLX-Доставка system messages with the
-- `olx_delivery_notice` metadata shape so the inbox renders them as a card
-- instead of a plain text bubble. The OLX Partner API v2 doesn't expose any
-- structural flag for system messages (confirmed via swagger grep), so we
-- match by text pattern — same detection the worker uses for new messages.
--
-- Direction-gated: only IN rows. The seller can write "Відправлю OLX
-- Доставкою" themselves; tagging those as system notices would render their
-- own outgoing message as an inbound card.
--
-- NBSP normalization: OLX templates sometimes use U+00A0 (NBSP) or U+202F
-- (narrow NBSP) between "OLX" and "Доставк". Postgres' `[[:space:]]` matches
-- only ASCII whitespace under most locales, so translate those code points
-- to plain space before applying the regex. chr(160) + chr(8239) are the
-- portable forms; the worker's JS regex uses the corresponding character
-- class so the two paths stay in sync.
--
-- Idempotent: only touches messages whose metadata is NULL. Re-applying is
-- a no-op. Doesn't override messages already tagged as attachments — those
-- are mutually exclusive in OLX's data model (system messages are text-only).
UPDATE "Message" m
SET "metadata" = jsonb_build_object(
  'kind', 'olx_delivery_notice',
  'schemaVersion', 1,
  'notice', CASE
    WHEN char_length(m."text") > 500 THEN substring(m."text" FROM 1 FOR 500) || E'…'
    ELSE m."text"
  END,
  'adminUrl', 'https://www.olx.ua/uk/myaccount/delivery/seller/'
)
FROM "Conversation" c
WHERE m."conversationId" = c."id"
  AND c."channel" = 'OLX'
  AND m."direction" = 'IN'
  AND translate(m."text", chr(160) || chr(8239), '  ') ~* 'OLX[[:space:]]+Доставк'
  AND m."metadata" IS NULL;
