-- Add per-delivery timestamps to OutboxEvent to avoid duplicate websocket emits when push delivery retries.

ALTER TABLE "OutboxEvent"
  ADD COLUMN IF NOT EXISTS "wsDeliveredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pushDeliveredAt" TIMESTAMP(3);

