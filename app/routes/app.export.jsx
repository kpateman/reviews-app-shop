import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function escapeCsv(value) {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toRow(fields) {
  return fields.map(escapeCsv).join(",");
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const reviews = await prisma.review.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    include: { images: { select: { url: true, status: true } } },
  });

  const headers = [
    "id",
    "type",
    "status",
    "rating",
    "title",
    "content",
    "customerName",
    "customerEmail",
    "productTitle",
    "productHandle",
    "createdAt",
    "reply",
    "repliedAt",
    "imageUrls",
  ];

  const rows = reviews.map((r) => toRow([
    r.id,
    r.type,
    r.status,
    r.rating,
    r.title,
    r.content,
    r.customerName,
    r.customerEmail,
    r.productTitle ?? "",
    r.productHandle ?? "",
    r.createdAt.toISOString(),
    r.reply ?? "",
    r.repliedAt ? r.repliedAt.toISOString() : "",
    r.images.filter(i => i.status === "approved").map(i => i.url).join(";"),
  ]));

  const csv = [toRow(headers), ...rows].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lean-reviews-${date}.csv"`,
    },
  });
}
