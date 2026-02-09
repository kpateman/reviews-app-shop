-- DropIndex
DROP INDEX "Review_shop_type_productId_status_createdAt_idx";

-- DropIndex
DROP INDEX "Review_status_idx";

-- DropIndex
DROP INDEX "Review_productId_idx";

-- CreateIndex
CREATE INDEX "Review_shop_status_idx" ON "Review"("shop", "status");

-- CreateIndex
CREATE INDEX "Review_shop_status_type_idx" ON "Review"("shop", "status", "type");

-- CreateIndex
CREATE INDEX "Review_shop_productId_status_idx" ON "Review"("shop", "productId", "status");

-- CreateIndex
CREATE INDEX "Review_shop_customerEmail_idx" ON "Review"("shop", "customerEmail");

-- CreateIndex
CREATE INDEX "Review_productId_status_idx" ON "Review"("productId", "status");

-- CreateIndex
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");
