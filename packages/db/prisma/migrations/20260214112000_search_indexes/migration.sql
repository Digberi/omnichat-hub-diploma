-- Search performance primitives:
-- - FTS (to_tsvector) expression indexes
-- - pg_trgm extension + trigram GIN indexes for fuzzy/ILIKE fallback

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Message: full-text + trigram
CREATE INDEX IF NOT EXISTS "Message_text_tsv_idx"
  ON "Message"
  USING GIN (to_tsvector('simple', COALESCE("text", '')));

CREATE INDEX IF NOT EXISTS "Message_text_trgm_idx"
  ON "Message"
  USING GIN ("text" gin_trgm_ops);

-- Conversation: full-text + trigram
CREATE INDEX IF NOT EXISTS "Conversation_search_tsv_idx"
  ON "Conversation"
  USING GIN (to_tsvector('simple', COALESCE("buyerDisplayName", '') || ' ' || COALESCE("contextTitle", '')));

CREATE INDEX IF NOT EXISTS "Conversation_buyerDisplayName_trgm_idx"
  ON "Conversation"
  USING GIN ("buyerDisplayName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Conversation_contextTitle_trgm_idx"
  ON "Conversation"
  USING GIN ("contextTitle" gin_trgm_ops);

