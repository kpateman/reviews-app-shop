-- Add widget title fields to ShopSettings
ALTER TABLE "ShopSettings" ADD COLUMN "productReviewsTitle" TEXT NOT NULL DEFAULT 'Customer Reviews';
ALTER TABLE "ShopSettings" ADD COLUMN "siteReviewsTitle" TEXT NOT NULL DEFAULT 'What People Are Saying';
ALTER TABLE "ShopSettings" ADD COLUMN "carouselTitle" TEXT NOT NULL DEFAULT 'What Our Customers Say';
ALTER TABLE "ShopSettings" ADD COLUMN "reviewFormTitle" TEXT NOT NULL DEFAULT 'Write a Review';
ALTER TABLE "ShopSettings" ADD COLUMN "photoGalleryTitle" TEXT NOT NULL DEFAULT 'Customer Photos';
