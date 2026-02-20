-- Add review discount incentive settings
CREATE TABLE "new_ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "requireVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "autoApproveMinRating" INTEGER NOT NULL DEFAULT 0,
    "enableSchemaMarkup" BOOLEAN NOT NULL DEFAULT true,
    "reviewDiscountEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reviewDiscountPercentage" INTEGER NOT NULL DEFAULT 10,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_ShopSettings" ("id", "shop", "requireVerifiedPurchase", "autoApproveMinRating", "enableSchemaMarkup", "reviewDiscountEnabled", "reviewDiscountPercentage", "createdAt", "updatedAt")
SELECT "id", "shop", "requireVerifiedPurchase", "autoApproveMinRating", "enableSchemaMarkup", false, 10, "createdAt", "updatedAt"
FROM "ShopSettings";

DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");
