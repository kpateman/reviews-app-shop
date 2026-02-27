import crypto from "crypto";
import { unauthenticated } from "../shopify.server";
import prisma from "../db.server";

/**
 * Generate a unique single-use discount code for a reviewer.
 * Returns the discount code string, or null on failure.
 */
export async function createReviewDiscountCode(shop, percentage, customerName) {
  try {
    const { admin } = await unauthenticated.admin(shop);
    const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
    const code = `THANKYOU-${suffix}`;
    const title = `Review reward for ${customerName}`;

    const response = await admin.graphql(
      `mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                codes(first: 1) {
                  nodes {
                    code
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          basicCodeDiscount: {
            title,
            code,
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
            usageLimit: 1,
            appliesOncePerCustomer: true,
            customerGets: {
              value: {
                percentage: percentage / 100, // API expects 0.0-1.0
              },
              items: {
                all: true,
              },
            },
          },
        },
      },
    );

    const data = await response.json();
    const errors = data.data?.discountCodeBasicCreate?.userErrors;
    if (errors?.length > 0) {
      console.error("Discount creation errors:", errors);
      return null;
    }

    const createdCode =
      data.data?.discountCodeBasicCreate?.codeDiscountNode?.codeDiscount?.codes?.nodes?.[0]?.code;
    const finalCode = createdCode || code;

    // Log for monthly cap enforcement
    try {
      await prisma.discountCodeLog.create({ data: { shop, code: finalCode } });
    } catch (logErr) {
      console.error("Failed to log discount code:", logErr?.message || logErr);
    }

    return finalCode;
  } catch (err) {
    console.error("Failed to create review discount code:", err?.message || err);
    return null;
  }
}
