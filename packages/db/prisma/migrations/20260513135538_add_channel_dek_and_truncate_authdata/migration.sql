-- CreateTable
CREATE TABLE "ChannelDek" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "encryptedDek" TEXT NOT NULL,
    "kekKeyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "ChannelDek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelDek_workspaceId_isActive_idx" ON "ChannelDek"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelDek_workspaceId_version_key" ON "ChannelDek"("workspaceId", "version");

-- AddForeignKey
ALTER TABLE "ChannelDek" ADD CONSTRAINT "ChannelDek_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Clean break from the legacy static-key ciphertext format.
-- Owners must reconnect marketplace channels post-deploy.
UPDATE "ChannelAccount" SET "authDataEncrypted" = NULL WHERE "authDataEncrypted" IS NOT NULL;
