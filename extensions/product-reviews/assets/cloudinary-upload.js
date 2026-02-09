/**
 * Cloudinary client-side upload helper
 * Uploads images directly to Cloudinary using unsigned preset
 */

const CLOUDINARY_CONFIG = {
  cloudName: 'dkxpqdcyx',
  uploadPreset: 'reviews_unsigned',
};

/**
 * Upload a file directly to Cloudinary
 * @param {File} file - The image file
 * @returns {Promise<{url: string, publicId: string}>}
 */
export async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
  formData.append('folder', 'reviews');
  formData.append('tags', 'review,shopify');

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      url: data.secure_url,
      publicId: data.public_id,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}
