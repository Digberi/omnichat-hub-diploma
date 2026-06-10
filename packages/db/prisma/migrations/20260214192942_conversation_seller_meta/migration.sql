-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'partial', 'refunded');

-- CreateEnum
CREATE TYPE "ShippingStatus" AS ENUM ('not_shipped', 'shipped', 'delivered', 'returned');

-- DropIndex
DROP INDEX "Conversation_buyerDisplayName_trgm_idx";

-- DropIndex
DROP INDEX "Conversation_contextTitle_trgm_idx";

-- DropIndex
DROP INDEX "Message_text_trgm_idx";

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "buyerHistoryJson" JSONB,
ADD COLUMN     "buyerIsOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "buyerLastSeenAt" TIMESTAMP(3),
ADD COLUMN     "followUpAt" TIMESTAMP(3),
ADD COLUMN     "orderAmount" INTEGER,
ADD COLUMN     "paymentStatus" "PaymentStatus",
ADD COLUMN     "sellerNote" TEXT,
ADD COLUMN     "shippingStatus" "ShippingStatus",
ADD COLUMN     "ttn" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_followUpAt_idx" ON "Conversation"("workspaceId", "followUpAt");
