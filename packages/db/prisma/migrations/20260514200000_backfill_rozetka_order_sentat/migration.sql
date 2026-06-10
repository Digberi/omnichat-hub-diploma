-- One-off backfill: fix Message.sentAt for "order:*:created" messages that were emitted
-- with new Date() (poll wall clock) before commit 40cf7628 introduced parsing the
-- order's actual created timestamp. The text body contains the original order date in
-- the line "Дата: YYYY-MM-DD HH:MM:SS" — extract it and rewrite sentAt accordingly.
--
-- Safe to skip if the regex finds nothing (older message format may have changed).
-- Idempotent: re-running parses the same date string, computes the same UTC instant.
UPDATE "Message" m
SET "sentAt" = (
  to_timestamp(
    substring(m."text" from 'Дата:\s*([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2})'),
    'YYYY-MM-DD HH24:MI:SS'
  ) AT TIME ZONE 'Europe/Kyiv'
)
WHERE m."externalMessageId" LIKE 'order:%:created'
  AND m."text" ~ 'Дата:\s*[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}'
  -- Only rewrite rows where sentAt is suspiciously close to createdAt (i.e. set to "now"
  -- at poll time, not to the order's real date). Difference < 5 minutes → backfill.
  AND ABS(EXTRACT(EPOCH FROM (m."sentAt" - m."createdAt"))) < 300;
