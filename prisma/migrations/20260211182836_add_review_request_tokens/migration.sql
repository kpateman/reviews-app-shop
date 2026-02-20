-- CreateTable
CREATE TABLE "ReviewRequestToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "customerId" TEXT,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "orderId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequestToken_token_key" ON "ReviewRequestToken"("token");

-- CreateIndex
CREATE INDEX "ReviewRequestToken_shop_customerEmail_productId_idx" ON "ReviewRequestToken"("shop", "customerEmail", "productId");

-- CreateIndex
CREATE INDEX "ReviewRequestToken_expiresAt_idx" ON "ReviewRequestToken"("expiresAt");
