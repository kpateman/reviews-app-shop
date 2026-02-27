import { PLAN_NAMES } from "../shopify.server";
import prisma from "../db.server";

export { PLAN_NAMES };

export const FREE_PLAN = "free";

export const PLAN_LIMITS = {
  [FREE_PLAN]: {
    maxReviews: 50,
    monthlyEmails: 10,
    monthlyDiscountCodes: 5,
  },
  [PLAN_NAMES.STARTER]: {
    maxReviews: 500,
    monthlyEmails: 250,
    monthlyDiscountCodes: Infinity,
  },
  [PLAN_NAMES.PRO]: {
    maxReviews: Infinity,
    monthlyEmails: Infinity,
    monthlyDiscountCodes: Infinity,
  },
};

const ALLOWLISTED_SHOPS = (process.env.ALLOWLISTED_SHOPS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isAllowlisted(shop) {
  return ALLOWLISTED_SHOPS.includes(shop);
}

export async function getShopPlan(billing, shop) {
  if (isAllowlisted(shop)) return PLAN_NAMES.PRO;

  try {
    const { appSubscriptions } = await billing.check({
      plans: [PLAN_NAMES.STARTER, PLAN_NAMES.PRO],
    });

    if (appSubscriptions.some((s) => s.name === PLAN_NAMES.PRO)) {
      return PLAN_NAMES.PRO;
    }
    if (appSubscriptions.some((s) => s.name === PLAN_NAMES.STARTER)) {
      return PLAN_NAMES.STARTER;
    }
  } catch (e) {
    console.error("Billing check error:", e?.message || e);
  }

  return FREE_PLAN;
}

export function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS[FREE_PLAN];
}

/**
 * Read the cached plan from ShopSettings (for storefront/proxy routes
 * that don't have a billing object). Defaults to free if not set.
 */
export async function getShopPlanFromDb(shop) {
  if (isAllowlisted(shop)) return PLAN_NAMES.PRO;
  try {
    const settings = await prisma.shopSettings.findUnique({
      where: { shop },
      select: { plan: true },
    });
    return settings?.plan || FREE_PLAN;
  } catch (e) {
    return FREE_PLAN;
  }
}

/**
 * Check Shopify billing, persist the plan to ShopSettings so storefront
 * routes can read it without a billing object, and return the plan name.
 */
export async function syncShopPlan(billing, shop) {
  const plan = await getShopPlan(billing, shop);
  try {
    await prisma.shopSettings.upsert({
      where: { shop },
      update: { plan },
      create: { shop, plan },
    });
  } catch (e) {
    console.error("Failed to sync shop plan to DB:", e?.message || e);
  }
  return plan;
}

/**
 * Check whether the shop can store another review under their plan.
 * Returns { allowed: bool, count: number|null, limit: number|null }
 */
export async function checkReviewCap(shop, plan) {
  const limits = getPlanLimits(plan);
  if (limits.maxReviews === Infinity) return { allowed: true, count: null, limit: null };
  const count = await prisma.review.count({ where: { shop } });
  return { allowed: count < limits.maxReviews, count, limit: limits.maxReviews };
}

/**
 * Check whether the shop can send another review request email this month.
 * Returns { allowed: bool, count: number|null, limit: number|null }
 */
export async function checkEmailCap(shop, plan) {
  const limits = getPlanLimits(plan);
  if (limits.monthlyEmails === Infinity) return { allowed: true, count: null, limit: null };
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const count = await prisma.reviewRequestToken.count({
    where: { shop, createdAt: { gte: startOfMonth } },
  });
  return { allowed: count < limits.monthlyEmails, count, limit: limits.monthlyEmails };
}

/**
 * Check whether the shop can generate another discount code this month.
 * Returns { allowed: bool, count: number|null, limit: number|null }
 */
export async function checkDiscountCap(shop, plan) {
  const limits = getPlanLimits(plan);
  if (limits.monthlyDiscountCodes === Infinity) return { allowed: true, count: null, limit: null };
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const count = await prisma.discountCodeLog.count({
    where: { shop, createdAt: { gte: startOfMonth } },
  });
  return { allowed: count < limits.monthlyDiscountCodes, count, limit: limits.monthlyDiscountCodes };
}
