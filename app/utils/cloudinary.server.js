import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary with explicit cloud name
cloudinary.config({
  cloud_name: process.env.VITE_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
});

if (!cloudinary.config().cloud_name) {
  console.error("❌ Cloudinary not configured! Set VITE_CLOUDINARY_CLOUD_NAME in .env");
}

/**
 * Upload a base64 image to Cloudinary
 * @param {string} base64Data - Base64 encoded image data (e.g., "data:image/jpeg;base64,...")
 * @param {string} filename - Original filename
 * @param {string} folder - Cloudinary folder path (e.g., "reviews/shop-name")
 * @returns {Promise<{url: string, publicId: string}>} Upload result with Cloudinary URL
 */
export async function uploadImageToCloudinary(base64Data, filename, folder = "reviews") {
  try {
    if (!base64Data || !base64Data.startsWith("data:image")) {
      throw new Error("Invalid base64 image data");
    }

    const result = await cloudinary.uploader.upload(base64Data, {
      folder,
      resource_type: "auto",
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      quality: "auto",
      fetch_format: "auto",
      tags: ["review", "shopify"],
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    console.error("Cloudinary upload error:", error?.message || error);
    throw new Error(`Failed to upload image: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Delete an image from Cloudinary by public ID
 * @param {string} publicId - Cloudinary public ID
 */
export async function deleteImageFromCloudinary(publicId) {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Cloudinary delete error:", error?.message || error);
    // Don't throw - log and continue
  }
}

/**
 * Generate a Cloudinary URL with transformations
 * @param {string} publicId - Cloudinary public ID
 * @param {object} options - Transformation options
 */
export function getCloudinaryUrl(publicId, options = {}) {
  const defaults = {
    quality: "auto",
    fetch_format: "auto",
  };
  return cloudinary.url(publicId, { ...defaults, ...options });
}
