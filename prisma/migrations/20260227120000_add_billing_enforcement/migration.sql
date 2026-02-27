-- Add cached plan field to ShopSettings
ALTER TABLE "ShopSettings" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';

-- Create DiscountCodeLog table for monthly cap enforcement
CREATE TABLE "DiscountCodeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DiscountCodeLog_shop_createdAt_idx" ON "DiscountCodeLog"("shop", "createdAt");
