import crypto from "crypto";
import prisma from "../db.server";

const TOKEN_EXPIRY_DAYS = 30;
const CLEANUP_DAYS = 60;

/**
 * Generate a review request token for a customer + product.
 * Reuses an existing unexpired/unused token if one exists.
 */
export async function generateReviewToken({ shop, productId, productTitle, customerId, customerEmail, customerName, orderId }) {
  // Cleanup old expired tokens (cheap, runs inline)
  await prisma.reviewRequestToken.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - CLEANUP_DAYS * 86400000) } },
  }).catch(() => {});

  // Reuse existing active token for same customer + product
  const existing = await prisma.reviewRequestToken.findFirst({
    where: { shop, customerEmail, productId, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (existing) return { token: existing.token };

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 86400000);

  await prisma.reviewRequestToken.create({
    data: { token, shop, productId, productTitle, customerId, customerEmail, customerName, orderId, expiresAt },
  });

  return { token };
}

/**
 * Validate a review request token. Returns the record if valid, null otherwise.
 */
export async function validateReviewToken(token) {
  if (!token || typeof token !== "string") return null;

  const record = await prisma.reviewRequestToken.findUnique({ where: { token } });
  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt < new Date()) return null;

  return record;
}

/**
 * Mark a token as used after successful review submission.
 */
export async function markTokenUsed(token) {
  await prisma.reviewRequestToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });
}

/**
 * Build the storefront review URL for a given token.
 * Goes through Shopify's app proxy so it gets HMAC-signed.
 */
export function buildReviewUrl(shopDomain, token, rating = null) {
  const base = `https://${shopDomain}/apps/reviews/write`;
  const params = new URLSearchParams({ token });
  if (rating) params.set("rating", String(rating));
  return `${base}?${params.toString()}`;
}
