-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "requireVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "autoApproveReviews" BOOLEAN NOT NULL DEFAULT false,
    "enableSchemaMarkup" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ShopSettings" ("autoApproveReviews", "createdAt", "id", "requireVerifiedPurchase", "shop", "updatedAt") SELECT "autoApproveReviews", "createdAt", "id", "requireVerifiedPurchase", "shop", "updatedAt" FROM "ShopSettings";
DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Review_shop_type_productId_status_createdAt_idx" ON "Review"("shop", "type", "productId", "status", "createdAt");
