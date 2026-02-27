import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.reviewImage.findMany({ where: { url: { contains: "w=3000" } } });
for (const r of rows) {
  await p.reviewImage.update({ where: { id: r.id }, data: { url: r.url.replace(/w=3000/g, "w=400") } });
}
console.log(rows.length + " image URLs updated");
await p.$disconnect();
