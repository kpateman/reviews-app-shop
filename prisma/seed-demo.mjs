// Demo data seed script for Lean Reviews
// Usage: node prisma/seed-demo.mjs
// Inserts 20 company reviews + 10 product reviews into the local dev database.
// Safe to re-run — checks for existing demo data first.

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config(); // loads DATABASE_URL from .env

const prisma = new PrismaClient();

const SHOP = "mydevtestingstore-2.myshopify.com";
const PRODUCT_ID = "gid://shopify/Product/9121098793214";
const PRODUCT_TITLE = "The 3p Fulfilled Snowboard";
const PRODUCT_HANDLE = "the-3p-fulfilled-snowboard";

const IMAGES = [
  "https://images.unsplash.com/photo-1418662589339-364ad47f98a2?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1584890131712-18ee8e3ed49c?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1625154869776-100eba31abbb?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://plus.unsplash.com/premium_photo-1708834155836-4eec278332b6?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1518085050105-3c33befa5442?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://plus.unsplash.com/premium_photo-1664303435784-0f8600225208?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://plus.unsplash.com/premium_photo-1708612612957-f19b099208a2?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1536099876051-79f4cbffeed1?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://plus.unsplash.com/premium_photo-1708612613583-c504781e2c2d?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1565733362858-3c610e8044cc?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://plus.unsplash.com/premium_photo-1708834160447-b25af045b8f6?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1642452793650-299824453b1f?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://plus.unsplash.com/premium_photo-1661825525351-0dd1b1df019f?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://plus.unsplash.com/premium_photo-1708612612949-b2eaa75af46d?fm=jpg&q=60&w=400&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function img(index) {
  return [{ filename: "snowboard-photo.jpg", url: IMAGES[index], cloudinaryPublicId: null, status: "approved" }];
}

function imgs(i1, i2) {
  return [
    { filename: "snowboard-photo-1.jpg", url: IMAGES[i1], cloudinaryPublicId: null, status: "approved" },
    { filename: "snowboard-photo-2.jpg", url: IMAGES[i2], cloudinaryPublicId: null, status: "approved" },
  ];
}

function order(n) {
  return `gid://shopify/Order/500100000000${n}`;
}

const companyReviews = [
  {
    customerName: "Jake Morrison", customerEmail: "jake.morrison@example.com",
    rating: 5, title: "Best snowboard shop I've found online",
    content: "Been snowboarding for twelve years and tried plenty of shops, but this one stands out. The range is genuinely impressive — everything from beginner setups to high-end freestyle boards. My order arrived in two days, packaged brilliantly. Will be back every season.",
    orderId: order(1), createdAt: daysAgo(330), images: img(0),
  },
  {
    customerName: "Sophie Hartley", customerEmail: "sophie.hartley@example.com",
    rating: 5, title: "Incredible service, incredible kit",
    content: "Ordered a full beginner setup for my first season and the team were so helpful when I called with questions. Everything arrived together, even got a handwritten note in the box. The gear quality is exactly as described. Already planning my next order.",
    orderId: order(2), createdAt: daysAgo(300), images: img(1),
  },
  {
    customerName: "Tom Dawson", customerEmail: "tom.dawson@example.com",
    rating: 5, title: "Absolutely love this store",
    content: "Third year buying from here and the experience keeps getting better. The website is easy to navigate, checkout is straightforward, and delivery is always fast. Had a small query about sizing last winter and got a reply within the hour. Proper customer service.",
    orderId: null, createdAt: daysAgo(270), images: img(2),
  },
  {
    customerName: "Lauren Webb", customerEmail: "lauren.webb@example.com",
    rating: 4, title: "Really good, minor packaging issue",
    content: "Love this shop and the products are brilliant. Only dropping one star because the outer box arrived with a corner bashed in — the board inside was absolutely fine though, clearly packed well internally. Would definitely order again.",
    orderId: order(4), createdAt: daysAgo(245), images: img(3),
  },
  {
    customerName: "Callum Reid", customerEmail: "callum.reid@example.com",
    rating: 5, title: "Top quality from top to bottom",
    content: "Ordered bindings and boots to go with a board I already owned. Both arrived within 48 hours, both perfect quality. The boots in particular are exceptional — properly stiff support but still comfortable enough to walk to the lift in. Exactly what I needed.",
    orderId: order(5), createdAt: daysAgo(215), images: img(4),
  },
  {
    customerName: "Megan Clarke", customerEmail: "megan.clarke@example.com",
    rating: 5, title: "Passionate about snowboarding",
    content: "You can tell this shop is run by people who genuinely ride. The product descriptions are accurate, the advice on the blog is actually useful, and when I asked which wax to use for mixed conditions, I got a detailed, helpful answer. That kind of knowledge makes the difference.",
    orderId: null, createdAt: daysAgo(185), images: img(5),
  },
  {
    customerName: "Dan Foster", customerEmail: "dan.foster@example.com",
    rating: 5, title: "Five seasons and counting",
    content: "Been buying from here since my first proper board purchase five years ago. Prices are competitive, stock is always good even mid-season, and returns are handled without any fuss. Wouldn't go anywhere else.",
    orderId: order(7), createdAt: daysAgo(162), images: [],
  },
  {
    customerName: "Emily Nash", customerEmail: "emily.nash@example.com",
    rating: 5, title: "Perfect for gifts",
    content: "Bought a snowboard helmet and goggles as a birthday present for my partner. The gift wrapping option was brilliant — it all arrived beautifully presented. He was delighted. Great quality products and he's been wearing the helmet every day on the mountain this season.",
    orderId: null, createdAt: daysAgo(155), images: [],
  },
  {
    customerName: "Ryan Blackwood", customerEmail: "ryan.blackwood@example.com",
    rating: 5, title: "Fastest delivery I've experienced",
    content: "Ordered on a Tuesday afternoon, arrived Wednesday morning. Absolutely ridiculous how fast that was. The board was in perfect condition, boxed up properly and exactly as described. Sets a high bar for every other shop out there.",
    orderId: order(9), createdAt: daysAgo(130), images: [],
  },
  {
    customerName: "Natalie Simmons", customerEmail: "natalie.simmons@example.com",
    rating: 4, title: "Great range, slight delay on one item",
    content: "Ordered two items in the same basket — one arrived the next day, the second took nearly a week. When I emailed they explained it was dispatched from a different warehouse and apologised. Nice to get a clear explanation. Products themselves are great quality.",
    orderId: null, createdAt: daysAgo(125), images: [],
  },
  {
    customerName: "Oliver Grant", customerEmail: "oliver.grant@example.com",
    rating: 5, title: "My go-to shop for everything snowboarding",
    content: "Board, boots, bindings, helmet, goggles, gloves, socks — all from here over the past two winters. Never had a single issue. The loyalty is earned: good prices, fast delivery, and genuine product knowledge. Highly recommended.",
    orderId: order(11), createdAt: daysAgo(100), images: [],
  },
  {
    customerName: "Hannah Pearce", customerEmail: "hannah.pearce@example.com",
    rating: 5, title: "Couldn't be happier",
    content: "Just picked up a new board ahead of a trip to Verbier. Was nervous about buying something so significant online but the detailed size guide and the option to call and speak to someone made all the difference. The board is perfect. Can't wait to get it on the mountain.",
    orderId: null, createdAt: daysAgo(95), images: [],
  },
  {
    customerName: "Marcus Thompson", customerEmail: "marcus.thompson@example.com",
    rating: 3, title: "Good shop, had a returns issue",
    content: "Ordered a jacket that turned out to be the wrong size. The return process took longer than expected and required a few chasing emails. Got it sorted in the end and the replacement arrived quickly. Products are good quality, just the returns process could be smoother.",
    orderId: null, createdAt: daysAgo(78), images: [],
  },
  {
    customerName: "Freya Campbell", customerEmail: "freya.campbell@example.com",
    rating: 5, title: "Outstanding from start to finish",
    content: "Brilliant experience from browsing to delivery. The filtering on the website makes it really easy to find what you're after, checkout was quick, and the board arrived ahead of schedule. Already recommended to three friends.",
    orderId: order(14), createdAt: daysAgo(65), images: [],
  },
  {
    customerName: "Connor Walsh", customerEmail: "connor.walsh@example.com",
    rating: 5, title: "Exactly what snowboarding shops should be",
    content: "Great prices, proper product knowledge, and genuine enthusiasm for the sport. Had a lengthy email conversation about which flex rating to go for as an intermediate rider and got really considered advice. Ended up with exactly the right board.",
    orderId: null, createdAt: daysAgo(60), images: [],
  },
  {
    customerName: "Amy Lockwood", customerEmail: "amy.lockwood@example.com",
    rating: 4, title: "Very happy, will be back",
    content: "Solid shop with a great range. The board I bought is excellent and arrived quickly. Only reason I'm not giving five stars is that the sizing chart for the boots was slightly off — ended up exchanging for a half size up. Returns were straightforward though.",
    orderId: order(16), createdAt: daysAgo(46), images: [],
  },
  {
    customerName: "Luke Henderson", customerEmail: "luke.henderson@example.com",
    rating: 5, title: "Brilliant for beginners",
    content: "Complete beginner and felt overwhelmed choosing my first setup. The beginner's guide on the website is genuinely helpful and the shop team responded to my questions patiently. Ended up with a great starter package and have had a brilliant first season. Thank you!",
    orderId: null, createdAt: daysAgo(44), images: [],
  },
  {
    customerName: "Zoe Preston", customerEmail: "zoe.preston@example.com",
    rating: 5, title: "Season ready thanks to this shop",
    content: "Left it quite late ordering ahead of our Austria trip and these guys came through. Everything arrived within two days with time to spare for fitting. The quality of everything — board, bindings, boots — is exactly as described. Already thinking about next season's upgrade.",
    orderId: order(18), createdAt: daysAgo(32), images: [],
  },
  {
    customerName: "Sam Whitfield", customerEmail: "sam.whitfield@example.com",
    rating: 5, title: "Can't fault a single thing",
    content: "Second order from here this season. First time I bought a board; this time I picked up a new helmet and goggles. Both orders handled perfectly, products exactly as described, delivery quick. There's a reason I keep coming back.",
    orderId: null, createdAt: daysAgo(21), images: [],
  },
  {
    customerName: "Jess Barker", customerEmail: "jess.barker@example.com",
    rating: 4, title: "Solid shop with great kit",
    content: "Good selection, fair prices and a website that doesn't make you want to throw your laptop out of the window. My snowboard arrived well packaged and the board itself is brilliant. Would have given five stars but tracking updates stopped for a day mid-delivery which was nerve-wracking.",
    orderId: order(20), createdAt: daysAgo(14), images: [],
  },
];

const productReviews = [
  {
    customerName: "Matt Sullivan", customerEmail: "matt.sullivan@example.com",
    rating: 5, title: "Best board I've ever ridden",
    content: "Upgraded from a mid-range board I'd been on for three seasons and the difference is night and day. The edge hold on hardpack is superb — I was immediately more confident on steep blues and into blacks. The flex is just right for my freeride style. Absolutely worth every penny.",
    orderId: order(21), createdAt: daysAgo(245), images: img(6),
  },
  {
    customerName: "Rachel Moore", customerEmail: "rachel.moore@example.com",
    rating: 5, title: "Blown away by the quality",
    content: "Wasn't sure whether to go up a price bracket but I'm so glad I did. The build quality is exceptional — the construction feels solid and the base slides beautifully with minimal waxing. Took it to Chamonix for a week and it handled everything I threw at it.",
    orderId: order(22), createdAt: daysAgo(215), images: img(7),
  },
  {
    customerName: "Ben Cartwright", customerEmail: "ben.cartwright@example.com",
    rating: 4, title: "Great board, took a run or two to adjust",
    content: "Coming from a stiffer board so the first run felt unusual, but by the second day I was completely dialled in. The playfulness through the turns is addictive. Really fun on groomers and surprisingly capable in the off-piste we found after the snowfall. Re-wax before first use though — factory wax wasn't great.",
    orderId: null, createdAt: daysAgo(185), images: img(8),
  },
  {
    customerName: "Isla Douglas", customerEmail: "isla.douglas@example.com",
    rating: 5, title: "Ripped the mountain with this board",
    content: "Third full season on this and it still feels as responsive as day one. The edge hold in icy morning conditions is what really impresses me — some boards get sketchy early doors but this grips confidently. Great all-mountain performer. Going back to buy the newer model before next season.",
    orderId: order(24), createdAt: daysAgo(162), images: img(9),
  },
  {
    customerName: "Josh Keane", customerEmail: "josh.keane@example.com",
    rating: 5, title: "Perfect for all conditions",
    content: "Powder day? Brilliant. Groomers? Brilliant. Park laps? Absolutely brilliant. This board handles everything without compromise. I ride mostly all-mountain and this is the most versatile board I've owned. The twin shape lets me ride switch without thinking about it. Photos from my first week out with it in the Alps.",
    orderId: null, createdAt: daysAgo(125), images: imgs(10, 11),
  },
  {
    customerName: "Chloe Simmons", customerEmail: "chloe.simmons@example.com",
    rating: 5, title: "Upgraded and couldn't be happier",
    content: "Finally took the plunge and upgraded from my old beginners' board and what a difference. The control this gives you is in another league. On steeper terrain especially, the confidence boost is massive. Pair it with decent bindings and it completely transforms your riding.",
    orderId: order(26), createdAt: daysAgo(95), images: imgs(12, 13),
  },
  {
    customerName: "Aaron Reid", customerEmail: "aaron.reid@example.com",
    rating: 4, title: "Really good value at this price point",
    content: "Compared to other boards in this range I tried at a demo day, this was the standout. The flex pattern is well balanced — not too soft for carving, not so stiff it punishes you for small mistakes. Great everyday board for intermediate to advanced riders.",
    orderId: order(27), createdAt: daysAgo(78), images: [],
  },
  {
    customerName: "Phoebe Grant", customerEmail: "phoebe.grant@example.com",
    rating: 5, title: "Incredible ride quality",
    content: "Bought this after reading countless reviews and the real world experience matches every positive thing I'd read. The pop off the tail is fantastic for anyone who likes to play in the park, and the directional shape gives it proper drive when you want to lay into big carves. Brilliant board.",
    orderId: null, createdAt: daysAgo(60), images: [],
  },
  {
    customerName: "Danny Cole", customerEmail: "danny.cole@example.com",
    rating: 3, title: "Good board, runs slightly wide for my foot size",
    content: "Performance wise this is a really good board. However if you have narrower feet, do check the waist width carefully before buying — I'm a size 9 boot and there's a touch more overhang than I'd like. It hasn't caused actual problems, just something I'd factor in if buying again. Otherwise rides really well.",
    orderId: null, createdAt: daysAgo(46), images: [],
  },
  {
    customerName: "Ellie Warren", customerEmail: "ellie.warren@example.com",
    rating: 5, title: "Season saver — perfect replacement board",
    content: "My old board snapped hitting a hidden rock and I needed a replacement fast before a trip to Andorra. Ordered on a Monday and had it by Wednesday. No time to fully tune it and it still performed brilliantly. The edge quality straight out of the box is impressive. Really happy with the purchase.",
    orderId: order(30), createdAt: daysAgo(21), images: [],
  },
];

async function main() {
  const existing = await prisma.review.count({ where: { shop: SHOP } });
  if (existing > 0) {
    console.log(`⚠️  Found ${existing} existing reviews for ${SHOP}.`);
    console.log("   To re-seed, delete existing reviews first:");
    console.log(`   node -e "import('@prisma/client').then(({PrismaClient})=>new PrismaClient().review.deleteMany({where:{shop:'${SHOP}'}}).then(r=>console.log('Deleted',r.count,'reviews'))"`);
    process.exit(0);
  }

  console.log(`Seeding ${companyReviews.length} company reviews...`);
  for (const r of companyReviews) {
    await prisma.review.create({
      data: {
        shop: SHOP, type: "company",
        productId: null, productTitle: null, productHandle: null,
        customerEmail: r.customerEmail, customerName: r.customerName,
        orderId: r.orderId ?? null, customerId: null,
        rating: r.rating, title: r.title, content: r.content,
        status: "approved", createdAt: r.createdAt,
        images: r.images.length > 0 ? { create: r.images } : undefined,
      },
    });
  }

  console.log(`Seeding ${productReviews.length} product reviews...`);
  for (const r of productReviews) {
    await prisma.review.create({
      data: {
        shop: SHOP, type: "product",
        productId: PRODUCT_ID, productTitle: PRODUCT_TITLE, productHandle: PRODUCT_HANDLE,
        customerEmail: r.customerEmail, customerName: r.customerName,
        orderId: r.orderId ?? null, customerId: null,
        rating: r.rating, title: r.title, content: r.content,
        status: "approved", createdAt: r.createdAt,
        images: r.images.length > 0 ? { create: r.images } : undefined,
      },
    });
  }

  console.log("✅ Done! 30 reviews seeded.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
