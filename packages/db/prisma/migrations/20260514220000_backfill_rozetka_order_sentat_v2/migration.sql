-- v2 backfill: the previous backfill (20260514200000_backfill_rozetka_order_sentat)
-- used `to_timestamp(...) AT TIME ZONE 'Europe/Kyiv'` which is the inverse of what
-- we wanted. `to_timestamp` returns a `timestamptz` already pinned to session TZ,
-- and `AT TIME ZONE 'Europe/Kyiv'` then converts that instant FROM UTC INTO
-- Kyiv-local — leaving us with a naive timestamp that's 2-3 hours ahead of the
-- correct UTC instant.
--
-- Fix: cast the parsed string to a NAIVE `timestamp` first, then `AT TIME ZONE
-- 'Europe/Kyiv'` reads it as Kyiv-local and produces the correct UTC. Idempotent
-- on rows that already match the body, so safe to overwrite without a delta guard.
UPDATE "Message" m
SET "sentAt" = (
  (substring(m."text" from 'Дата:\s*([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2})'))::timestamp
    AT TIME ZONE 'Europe/Kyiv'
)
WHERE m."externalMessageId" LIKE 'order:%:created'
  AND m."text" ~ 'Дата:\s*[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}';
