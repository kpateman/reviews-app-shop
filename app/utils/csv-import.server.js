import Papa from "papaparse";
import { v2 as cloudinary } from "cloudinary";
import prisma from "../db.server";
import cache from "./cache.server";

/**
 * Parse a Yotpo CSV export string into structured review data.
 * Returns an array of review objects with mapped fields.
 */
export function parseYotpoCsv(csvText) {
  const { data, errors } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (errors.length > 0) {
    // Only fail on quote errors — field mismatches are common in Yotpo CSVs
    // (trailing commas, extra empty columns)
    const critical = errors.filter((e) => e.type === "Quotes");
    if (critical.length > 0) {
      throw new Error(`CSV parse error: ${critical[0].message} (row ${critical[0].row})`);
    }
  }

  return data
    .filter((row) => row["Review Content"] || row["Review Title"])
    .map((row) => ({
      yotpoId: row["Review ID"] || null,
      type: row["Review Type"] === "site_review" ? "company" : "product",
      status: row["Review Status"] === "Published" ? "approved" : "pending",
      rating: Math.min(5, Math.max(1, parseInt(row["Review Score"], 10) || 5)),
      title: (row["Review Title"] || "(No title)").slice(0, 100),
      content: row["Review Content"] || row["Review Title"] || "",
      createdAt: row["Review Creation Date"] ? new Date(row["Review Creation Date"]) : new Date(),
      customerName: row["Reviewer Display Name"] || "Anonymous",
      customerEmail: row["Reviewer Email"] || "",
      productHandle: row["Product Handle"] || null,
      productTitle: row["Product Title"] || null,
      yotpoProductId: row["Product ID"] || null,
      orderId: row["Order ID"]
        ? `yotpo:${row["Order ID"]}`
        : row["Reviewer Type"]?.toLowerCase() === "verified_buyer"
          ? "yotpo:verified"
          : null,
      imageUrls: parseImageUrls(row["Published Image URLs"]),
      unpublishedImageUrls: parseImageUrls(row["Unpublished Image URLs"]),
    }));
}

function parseImageUrls(urlString) {
  if (!urlString || !urlString.trim()) return [];
  return urlString
    .split(";")
    .map((u) => u.trim())
    .filter((u) => u.startsWith("http"));
}

/**
 * Detect whether a CSV is from Yotpo or Judge.me by inspecting the header row.
 * Returns 'yotpo', 'judgeme', or 'unknown'.
 */
export function detectCsvFormat(csvText) {
  const firstLine = (csvText || "").split("\n")[0].toLowerCase();
  if (firstLine.includes("review content") || firstLine.includes("review score")) {
    return "yotpo";
  }
  if (firstLine.includes("reviewer_name") || firstLine.includes("reviewer_email")) {
    return "judgeme";
  }
  return "unknown";
}

/**
 * Parse a Judge.me CSV export string into structured review data.
 * Columns: title, body, rating, review_date, reviewer_name, reviewer_email,
 *          product_url, picture_urls, product_id, product_handle
 */
export function parseJudgeMeCsv(csvText) {
  const { data, errors } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const critical = errors.filter((e) => e.type === "Quotes");
  if (critical.length > 0) {
    throw new Error(`CSV parse error: ${critical[0].message} (row ${critical[0].row})`);
  }

  return data
    .filter((row) => row["body"] || row["title"])
    .map((row) => {
      // Use product_handle directly; fall back to extracting from product_url
      let productHandle = row["product_handle"]?.trim() || null;
      if (!productHandle && row["product_url"]) {
        const match = row["product_url"].match(/\/products\/([^/?#]+)/);
        if (match) productHandle = match[1];
      }

      return {
        yotpoId: null,
        type: productHandle ? "product" : "company",
        status: "approved", // Judge.me only exports published reviews
        rating: Math.min(5, Math.max(1, parseInt(row["rating"], 10) || 5)),
        title: (row["title"] || "(No title)").slice(0, 100),
        content: row["body"] || row["title"] || "",
        createdAt: parseJudgeMeDate(row["review_date"]),
        customerName: row["reviewer_name"] || "Anonymous",
        customerEmail: row["reviewer_email"] || "",
        productHandle,
        productTitle: null,
        yotpoProductId: row["product_id"] || null,
        orderId: null,
        imageUrls: parseCommaSeparatedUrls(row["picture_urls"]),
        unpublishedImageUrls: [],
      };
    });
}

function parseJudgeMeDate(dateStr) {
  if (!dateStr || !dateStr.trim()) return new Date();
  // DD/MM/YYYY
  const parts = dateStr.trim().split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const d = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return d;
  }
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

function parseCommaSeparatedUrls(urlString) {
  if (!urlString || !urlString.trim()) return [];
  return urlString
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.startsWith("http"));
}

/**
 * Look up Shopify product GIDs by handle using the Admin API.
 * Returns a map of handle → { id, title } for all matched products.
 */
export async function lookupProductsByHandle(admin, handles) {
  const productMap = {};
  // Batch lookups to avoid rate limits — 10 at a time
  const uniqueHandles = [...new Set(handles.filter(Boolean))];

  for (let i = 0; i < uniqueHandles.length; i += 10) {
    const batch = uniqueHandles.slice(i, i + 10);
    const promises = batch.map(async (handle) => {
      try {
        const response = await admin.graphql(
          `query productByHandle($query: String!) {
            products(first: 1, query: $query) {
              edges {
                node {
                  id
                  title
                  handle
                }
              }
            }
          }`,
          { variables: { query: `handle:${handle}` } },
        );
        const data = await response.json();
        const product = data.data?.products?.edges?.[0]?.node;
        if (product) {
          productMap[handle] = {
            id: product.id,
            title: product.title,
            handle: product.handle || handle,
          };
        }
      } catch (err) {
        console.error(`Failed to look up product handle "${handle}":`, err.message);
      }
    });
    await Promise.all(promises);
  }

  return productMap;
}

/**
 * Search for Shopify products by title query.
 * Used for manual mapping of unmatched products.
 */
export async function searchProducts(admin, query) {
  try {
    const response = await admin.graphql(
      `query searchProducts($query: String!) {
        products(first: 15, query: $query) {
          edges {
            node {
              id
              title
              handle
              featuredImage { url }
            }
          }
        }
      }`,
      { variables: { query } },
    );
    const data = await response.json();
    return (data.data?.products?.edges || []).map((e) => e.node);
  } catch (err) {
    console.error("Product search error:", err.message);
    return [];
  }
}

/**
 * Re-upload an image from a URL (e.g. Yotpo CDN) to Cloudinary.
 * Returns { url, publicId } or null on failure.
 */
export async function reuploadImageToCloudinary(imageUrl, folder = "reviews") {
  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder,
      resource_type: "auto",
      unique_filename: true,
      overwrite: false,
      quality: "auto",
      fetch_format: "auto",
      tags: ["review", "shopify", "yotpo-import"],
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (err) {
    console.error(`Failed to re-upload image ${imageUrl}:`, err.message);
    return null;
  }
}

/**
 * Import parsed reviews into the database.
 * - productMap: handle → { id, title } from lookupProductsByHandle or manual mapping
 * - manualMappings: handle → shopifyGid from user's manual selections
 * Returns { imported, skipped, errors, imageErrors }
 */
export async function importReviews(shop, reviews, productMap, manualMappings = {}) {
  const results = { imported: 0, skipped: 0, errors: [], imageErrors: 0 };
  const affectedProductIds = new Set();

  // Combine auto and manual mappings
  const allMappings = { ...productMap };
  const skippedHandles = new Set();
  for (const [handle, value] of Object.entries(manualMappings)) {
    if (value === "__skip__") {
      skippedHandles.add(handle);
      delete allMappings[handle];
    } else if (value && typeof value === "object") {
      // { id, title } from enriched manual mapping
      allMappings[handle] = value;
    } else if (value) {
      allMappings[handle] = { id: value, title: null };
    }
  }

  // Process in batches of 50
  for (let i = 0; i < reviews.length; i += 50) {
    const batch = reviews.slice(i, i + 50);

    for (const review of batch) {
      try {
        let productId = null;
        let productTitle = review.productTitle;

        if (review.type === "product" && review.productHandle) {
          if (skippedHandles.has(review.productHandle)) {
            results.skipped++;
            continue;
          }
          const mapped = allMappings[review.productHandle];
          if (mapped) {
            productId = mapped.id;
            if (mapped.title) productTitle = mapped.title;
          } else {
            // Product not mapped — skip this review
            results.skipped++;
            results.errors.push(
              `Skipped: "${review.title}" — product "${review.productHandle}" not mapped`,
            );
            continue;
          }
        }

        // Check for duplicates
        if (review.customerEmail) {
          const existing = await prisma.review.findFirst({
            where: {
              shop,
              customerEmail: review.customerEmail,
              productId: productId,
              type: review.type,
            },
          });
          if (existing) {
            results.skipped++;
            continue;
          }
        }

        // Create the review
        const created = await prisma.review.create({
          data: {
            shop,
            productId,
            productTitle,
            productHandle: allMappings[review.productHandle]?.handle || review.productHandle || null,
            customerId: null,
            customerEmail: review.customerEmail,
            customerName: review.customerName,
            orderId: review.orderId || null,
            type: review.type,
            rating: review.rating,
            title: review.title,
            content: review.content,
            status: review.status,
            createdAt: review.createdAt,
          },
        });

        // Re-upload images to Cloudinary
        if (review.imageUrls.length > 0) {
          for (const imageUrl of review.imageUrls) {
            const uploaded = await reuploadImageToCloudinary(imageUrl, `reviews/${shop}`);
            if (uploaded) {
              await prisma.reviewImage.create({
                data: {
                  reviewId: created.id,
                  filename: imageUrl.split("/").pop() || "imported-image",
                  url: uploaded.url,
                  cloudinaryPublicId: uploaded.publicId,
                  status: review.status === "approved" ? "approved" : "pending",
                },
              });
            } else {
              results.imageErrors++;
            }
          }
        }

        if (productId) affectedProductIds.add(productId);
        results.imported++;
      } catch (err) {
        results.errors.push(`Error importing "${review.title}": ${err.message}`);
      }
    }
  }

  // Invalidate cache for affected products
  try {
    await cache.delByPrefix(`reviews:${shop}`);
  } catch {
    // Cache invalidation is non-critical
  }

  return { ...results, affectedProductIds: [...affectedProductIds] };
}
