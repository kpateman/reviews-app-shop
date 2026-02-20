-- Replace autoApproveReviews (Boolean) with autoApproveMinRating (Int)
-- 0 = disabled, 1-5 = auto-approve reviews with this rating or above

-- SQLite doesn't support ALTER COLUMN, so we recreate the table
CREATE TABLE "new_ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "requireVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "autoApproveMinRating" INTEGER NOT NULL DEFAULT 0,
    "enableSchemaMarkup" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Migrate data: convert boolean to int (true -> 4 as a sensible default, false -> 0)
INSERT INTO "new_ShopSettings" ("id", "shop", "requireVerifiedPurchase", "autoApproveMinRating", "enableSchemaMarkup", "createdAt", "updatedAt")
SELECT "id", "shop", "requireVerifiedPurchase",
       CASE WHEN "autoApproveReviews" = 1 THEN 4 ELSE 0 END,
       "enableSchemaMarkup", "createdAt", "updatedAt"
FROM "ShopSettings";

DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");
