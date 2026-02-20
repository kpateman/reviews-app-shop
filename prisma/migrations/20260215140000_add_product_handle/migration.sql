-- Add productHandle column to Review for linking photos to product pages
ALTER TABLE "Review" ADD COLUMN "productHandle" TEXT;
