-- Strip HTML from existing Rozetka order/status messages.
-- PR #44 emitted message bodies as HTML (<p>, <b>, <a>, <img>) but the inbox
-- and push notifications render Message.text as plain text — operators saw
-- literal "<p>...</p><a href=...>" tags. Code is reverted to plain newlines;
-- this migration normalizes already-stored rows.
--
-- Strategy:
--   * Replace closing "</p>" with newline so paragraph breaks survive.
--   * Strip every other tag entirely.
--   * Collapse runs of 3+ newlines down to 2.
--
-- Idempotent: re-running on already-plain text produces the same output.
UPDATE "Message" m
SET "text" = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(m."text", '</p>', E'\n', 'gi'),
      '<[^>]+>', '', 'g'
    ),
    E'\n{3,}', E'\n\n', 'g'
  ),
  '&amp;', '&', 'g'
)
WHERE m."externalMessageId" LIKE 'order:%'
  AND m."text" ~ '<[a-z][^>]*>';
