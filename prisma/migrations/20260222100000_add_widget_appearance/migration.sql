-- Add global widget appearance fields to ShopSettings
ALTER TABLE "ShopSettings" ADD COLUMN "widgetStarColor" TEXT NOT NULL DEFAULT '#f5a623';
ALTER TABLE "ShopSettings" ADD COLUMN "widgetPrimaryColor" TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE "ShopSettings" ADD COLUMN "widgetBorderRadius" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "ShopSettings" ADD COLUMN "widgetBadgeColor" TEXT NOT NULL DEFAULT '#2e7d32';
ALTER TABLE "ShopSettings" ADD COLUMN "widgetBgColor" TEXT NOT NULL DEFAULT '#ffffff';
ALTER TABLE "ShopSettings" ADD COLUMN "widgetTextColor" TEXT NOT NULL DEFAULT '#444444';
