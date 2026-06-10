-- CreateTable
CREATE TABLE "RozetkaOrderState" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelAccountId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "lastSeenStatus" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RozetkaOrderState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RozetkaOrderState_workspaceId_idx" ON "RozetkaOrderState"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "RozetkaOrderState_channelAccountId_externalOrderId_key" ON "RozetkaOrderState"("channelAccountId", "externalOrderId");

-- AddForeignKey
ALTER TABLE "RozetkaOrderState" ADD CONSTRAINT "RozetkaOrderState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RozetkaOrderState" ADD CONSTRAINT "RozetkaOrderState_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One-shot backfill note: existing ROZETKA conversations were keyed on chat.id;
-- after this migration the application code re-keys them lazily on chat.order_id
-- when next polled. No SQL UPDATE here. Dedup is by
-- (workspaceId, channelAccountId, externalConversationId) findFirst, so an
-- already-existing chat-id-keyed conversation continues to receive messages
-- until the operator clears it. The new RozetkaOrderState table tracks
-- per-(account, order) last-seen status for emitting status-transition messages.
