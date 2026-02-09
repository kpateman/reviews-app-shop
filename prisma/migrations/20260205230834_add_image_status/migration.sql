-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReviewImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "ReviewImage_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ReviewImage" ("filename", "id", "reviewId", "url") SELECT "filename", "id", "reviewId", "url" FROM "ReviewImage";
DROP TABLE "ReviewImage";
ALTER TABLE "new_ReviewImage" RENAME TO "ReviewImage";
CREATE INDEX "ReviewImage_reviewId_idx" ON "ReviewImage"("reviewId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
