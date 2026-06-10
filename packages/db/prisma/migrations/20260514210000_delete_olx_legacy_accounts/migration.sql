-- One-shot cleanup: drop all OLX accounts so they can be re-onboarded against UA endpoints.
-- ChannelAccount → cascade to Conversation → Message, Attachment, ConversationTag,
-- ChannelSyncCheckpoint, RozetkaOrderState (no-op for OLX) per Prisma onDelete: Cascade.
DELETE FROM "ChannelAccount" WHERE channel = 'OLX';
