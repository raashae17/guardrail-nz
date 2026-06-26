/**
 * Seed script — creates realistic test data for Trades and Hospitality tenants.
 * Run: npx tsx prisma/seed.ts
 *
 * Uses a fake tenantId so it works without a real Xero connection.
 * Set DATABASE_URL in .env before running.
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const TRADES_TENANT = "seed-trades-tenant-001";
const HOSP_TENANT = "seed-hosp-tenant-001";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}
function daysFromNow(n: number) {
  return new Date(Date.now() + n * 86_400_000);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function ensureConnection(tenantId: string, name: string, industry: string) {
  await prisma.xeroConnection.upsert({
    where: { tenantId },
    create: {
      tenantId,
      tenantName: name,
      industry,
      encryptedAccess: "SEED_NO_TOKEN",
      encryptedRefresh: "SEED_NO_TOKEN",
      expiresAt: daysFromNow(365),
    },
    update: { tenantName: name, industry },
  });
}

async function ensureContact(
  xeroContactId: string,
  tenantId: string,
  name: string,
  avgDaysLate = 0,
  totalRevenue = 0
) {
  const { createHash } = await import("crypto");
  const anonToken = `C_${createHash("sha256").update(xeroContactId).digest("hex").slice(0, 8).toUpperCase()}`;
  return prisma.contact.upsert({
    where: { xeroContactId },
    create: { xeroContactId, tenantId, anonToken, name, avgDaysLate, totalRevenue },
    update: { name, avgDaysLate, totalRevenue },
  });
}

// ---------------------------------------------------------------------------
// TRADES seed
// ---------------------------------------------------------------------------
async function seedTrades() {
  await ensureConnection(TRADES_TENANT, "Kiwi Build Co Ltd (Test)", "trades");

  const clients = await Promise.all([
    ensureContact("xt-client-001", TRADES_TENANT, "Thornton Family Trust", 22, 185000),
    ensureContact("xt-client-002", TRADES_TENANT, "Northshore Commercial Ltd", 3, 94000),
    ensureContact("xt-client-003", TRADES_TENANT, "Riverside Electrical Services", 8, 42000),
  ]);
  const [thornton, northshore, riverside] = clients;

  // Progress invoices — Thornton build (Stage 1 paid, Stage 2 overdue)
  await prisma.invoice.upsert({
    where: { xeroInvoiceId: "xi-pi-001" },
    create: {
      xeroInvoiceId: "xi-pi-001", tenantId: TRADES_TENANT,
      invoiceNumber: "PI-045", reference: "Stage 1 — Foundation & Slab",
      status: "PAID", issueDate: daysAgo(60), dueDate: daysAgo(46),
      total: 42000, amountDue: 0, contactId: thornton.id,
      isProgressStage: true, stageNumber: 1,
      lineItemsJson: [{ Description: "Foundation & concrete slab", Quantity: 1, UnitAmount: 42000 }],
    },
    update: { status: "PAID", amountDue: 0 },
  });
  await prisma.invoice.upsert({
    where: { xeroInvoiceId: "xi-pi-002" },
    create: {
      xeroInvoiceId: "xi-pi-002", tenantId: TRADES_TENANT,
      invoiceNumber: "PI-047", reference: "Stage 2 — Framing & Roof",
      status: "AUTHORISED", issueDate: daysAgo(22), dueDate: daysAgo(8),
      total: 18500, amountDue: 18500, contactId: thornton.id,
      isProgressStage: true, stageNumber: 2,
      lineItemsJson: [
        { Description: "90x45 H3 Framing per LM", Quantity: 800, UnitAmount: 6.70 },
        { Description: "Labour — framing crew", Quantity: 1, UnitAmount: 7060 },
      ],
    },
    update: { status: "AUTHORISED", amountDue: 18500 },
  });
  await prisma.invoice.upsert({
    where: { xeroInvoiceId: "xi-pi-003" },
    create: {
      xeroInvoiceId: "xi-pi-003", tenantId: TRADES_TENANT,
      invoiceNumber: "PI-051", reference: "Stage 1 — Electrical Rough-In",
      status: "AUTHORISED", issueDate: daysAgo(5), dueDate: daysFromNow(25),
      total: 8800, amountDue: 8800, contactId: riverside.id,
      isProgressStage: true, stageNumber: 1,
      lineItemsJson: [
        { Description: "3-core 2.5mm TPS cable per metre", Quantity: 400, UnitAmount: 2.18 },
        { Description: "Labour — electrician", Quantity: 1, UnitAmount: 7928 },
      ],
    },
    update: { amountDue: 8800 },
  });

  // Regular overdue invoice — Northshore
  await prisma.invoice.upsert({
    where: { xeroInvoiceId: "xi-reg-001" },
    create: {
      xeroInvoiceId: "xi-reg-001", tenantId: TRADES_TENANT,
      invoiceNumber: "INV-2201", reference: "Bathroom renovation — final",
      status: "AUTHORISED", issueDate: daysAgo(35), dueDate: daysAgo(5),
      total: 6200, amountDue: 6200, contactId: northshore.id,
      isProgressStage: false,
    },
    update: { amountDue: 6200 },
  });

  // Supplier bills — timber prices rising
  const billsData = [
    { id: "xb-001", supplier: "Carters Building Supplies", date: daysAgo(165), desc: "90x45 H3 Framing per LM", unit: 6.20, qty: 500 },
    { id: "xb-002", supplier: "Carters Building Supplies", date: daysAgo(120), desc: "90x45 H3 Framing per LM", unit: 6.28, qty: 480 },
    { id: "xb-003", supplier: "Carters Building Supplies", date: daysAgo(60), desc: "90x45 H3 Framing per LM", unit: 6.45, qty: 600 },
    { id: "xb-004", supplier: "Carters Building Supplies", date: daysAgo(14), desc: "90x45 H3 Framing per LM", unit: 6.70, qty: 800 },
    // Copper cable rising
    { id: "xb-005", supplier: "Ideal Electrical Wholesalers", date: daysAgo(160), desc: "3-core 2.5mm TPS cable per metre", unit: 2.18, qty: 300 },
    { id: "xb-006", supplier: "Ideal Electrical Wholesalers", date: daysAgo(90), desc: "3-core 2.5mm TPS cable per metre", unit: 2.26, qty: 350 },
    { id: "xb-007", supplier: "Ideal Electrical Wholesalers", date: daysAgo(30), desc: "3-core 2.5mm TPS cable per metre", unit: 2.44, qty: 400 },
  ];
  for (const b of billsData) {
    const total = new Prisma.Decimal(b.unit * b.qty);
    await prisma.bill.upsert({
      where: { xeroInvoiceId: b.id },
      create: {
        xeroInvoiceId: b.id, tenantId: TRADES_TENANT, supplierName: b.supplier,
        date: b.date, dueDate: new Date(b.date.getTime() + 30 * 86_400_000),
        total, amountDue: new Prisma.Decimal(0),
        lineItemsJson: [{ Description: b.desc, UnitAmount: b.unit, Quantity: b.qty }],
      },
      update: {},
    });
  }

  // Quoted jobs — PI-051 quoted at old copper price
  await prisma.quotedJob.upsert({
    where: { tenantId_jobReference: { tenantId: TRADES_TENANT, jobReference: "PI-051" } },
    create: {
      tenantId: TRADES_TENANT, jobReference: "PI-051",
      contactToken: riverside.anonToken,
      quotedAt: daysAgo(55),
      totalQuotedCost: new Prisma.Decimal(8800),
      lineItemsJson: [
        { description: "3-core 2.5mm TPS cable per metre", qty: 400, unitAtQuote: 2.18 },
      ],
      exposureAmount: new Prisma.Decimal(0),
    },
    update: {},
  });

  // Bank transactions for runway
  const txs = [
    { id: "xt-001", type: "RECEIVE", date: daysAgo(5), total: 42000 },
    { id: "xt-002", type: "SPEND", date: daysAgo(10), total: 8400 },
    { id: "xt-003", type: "SPEND", date: daysAgo(20), total: 12000 },
    { id: "xt-004", type: "SPEND", date: daysAgo(30), total: 6800 },
    { id: "xt-005", type: "RECEIVE", date: daysAgo(35), total: 15000 },
    { id: "xt-006", type: "SPEND", date: daysAgo(45), total: 9200 },
    { id: "xt-007", type: "SPEND", date: daysAgo(60), total: 14000 },
    { id: "xt-008", type: "SPEND", date: daysAgo(75), total: 7500 },
  ];
  for (const tx of txs) {
    await prisma.bankTransaction.upsert({
      where: { xeroTxId: tx.id },
      create: { xeroTxId: tx.id, tenantId: TRADES_TENANT, type: tx.type, status: "RECONCILED", date: tx.date, total: tx.total },
      update: {},
    });
  }

  console.log("✓ Trades seed complete");
}

// ---------------------------------------------------------------------------
// HOSPITALITY seed
// ---------------------------------------------------------------------------
async function seedHospitality() {
  await ensureConnection(HOSP_TENANT, "Aroha Café & Catering (Test)", "hospitality");

  const clients = await Promise.all([
    ensureContact("xh-client-001", HOSP_TENANT, "Wellington Events Group", 5, 28000),
    ensureContact("xh-client-002", HOSP_TENANT, "Te Papa Catering Contract", 2, 45000),
  ]);
  const [wevents] = clients;

  // Overdue catering invoice
  await prisma.invoice.upsert({
    where: { xeroInvoiceId: "xhi-001" },
    create: {
      xeroInvoiceId: "xhi-001", tenantId: HOSP_TENANT,
      invoiceNumber: "CAT-112", reference: "Annual gala catering — 150 pax",
      status: "AUTHORISED", issueDate: daysAgo(12), dueDate: daysAgo(5),
      total: 2840, amountDue: 2840, contactId: wevents.id,
      isProgressStage: false,
    },
    update: { amountDue: 2840 },
  });

  // Supplier bills — dairy and coffee rising over 6 months
  const hospBills = [
    // Dairy — rising
    { id: "xhb-001", supplier: "Meadowfresh Foodservice", date: daysAgo(170), desc: "Homogenised whole milk 10L", unit: 14.20, qty: 40 },
    { id: "xhb-002", supplier: "Meadowfresh Foodservice", date: daysAgo(140), desc: "Homogenised whole milk 10L", unit: 14.20, qty: 42 },
    { id: "xhb-003", supplier: "Meadowfresh Foodservice", date: daysAgo(110), desc: "Homogenised whole milk 10L", unit: 14.50, qty: 44 },
    { id: "xhb-004", supplier: "Meadowfresh Foodservice", date: daysAgo(80), desc: "Homogenised whole milk 10L", unit: 14.65, qty: 44 },
    { id: "xhb-005", supplier: "Meadowfresh Foodservice", date: daysAgo(40), desc: "Homogenised whole milk 10L", unit: 14.90, qty: 46 },
    { id: "xhb-006", supplier: "Meadowfresh Foodservice", date: daysAgo(7), desc: "Homogenised whole milk 10L", unit: 15.05, qty: 48 },
    // Coffee — rising
    { id: "xhb-007", supplier: "Flight Coffee Roasters", date: daysAgo(165), desc: "Single origin espresso blend 1kg", unit: 28.50, qty: 38 },
    { id: "xhb-008", supplier: "Flight Coffee Roasters", date: daysAgo(120), desc: "Single origin espresso blend 1kg", unit: 29.10, qty: 40 },
    { id: "xhb-009", supplier: "Flight Coffee Roasters", date: daysAgo(60), desc: "Single origin espresso blend 1kg", unit: 29.80, qty: 40 },
    { id: "xhb-010", supplier: "Flight Coffee Roasters", date: daysAgo(10), desc: "Single origin espresso blend 1kg", unit: 30.78, qty: 42 },
    // Produce — slight rise
    { id: "xhb-011", supplier: "Commonsense Organics", date: daysAgo(30), desc: "Mixed salad leaves 1kg", unit: 8.40, qty: 20 },
    { id: "xhb-012", supplier: "Commonsense Organics", date: daysAgo(7), desc: "Mixed salad leaves 1kg", unit: 9.20, qty: 22 },
  ];
  for (const b of hospBills) {
    const total = new Prisma.Decimal(b.unit * b.qty);
    await prisma.bill.upsert({
      where: { xeroInvoiceId: b.id },
      create: {
        xeroInvoiceId: b.id, tenantId: HOSP_TENANT, supplierName: b.supplier,
        date: b.date, dueDate: new Date(b.date.getTime() + 7 * 86_400_000),
        total, amountDue: new Prisma.Decimal(0),
        lineItemsJson: [{ Description: b.desc, UnitAmount: b.unit, Quantity: b.qty }],
      },
      update: {},
    });
  }

  // Menu items with COGS breakdown
  const menuItems = [
    {
      name: "Flat white",
      category: "beverage",
      currentPrice: 5.50,
      targetMarginPct: 70,
      cogsJson: [
        { ingredient: "Single origin espresso blend 1kg", unitCost: 30.78, qty: 0.018 }, // 18g per shot
        { ingredient: "Homogenised whole milk 10L", unitCost: 15.05, qty: 0.022 },       // 220ml per cup (per 10L = 0.022)
      ],
    },
    {
      name: "Eggs benedict",
      category: "food",
      currentPrice: 22.00,
      targetMarginPct: 65,
      cogsJson: [
        { ingredient: "Free range eggs 600g", unitCost: 7.80, qty: 0.33 },
        { ingredient: "Hollandaise mix", unitCost: 3.20, qty: 0.5 },
        { ingredient: "Streaky bacon 1kg", unitCost: 14.50, qty: 0.08 },
      ],
    },
    {
      name: "Catering — per head",
      category: "catering",
      currentPrice: 45.00,
      targetMarginPct: 60,
      cogsJson: [
        { ingredient: "Homogenised whole milk 10L", unitCost: 15.05, qty: 0.05 },
        { ingredient: "Mixed salad leaves 1kg", unitCost: 9.20, qty: 0.08 },
        { ingredient: "Streaky bacon 1kg", unitCost: 14.50, qty: 0.05 },
      ],
    },
  ];
  for (const m of menuItems) {
    await prisma.menuItem.upsert({
      where: { tenantId_name: { tenantId: HOSP_TENANT, name: m.name } },
      create: { tenantId: HOSP_TENANT, ...m, currentPrice: m.currentPrice, targetMarginPct: m.targetMarginPct, cogsJson: m.cogsJson },
      update: { currentPrice: m.currentPrice, cogsJson: m.cogsJson },
    });
  }

  // Bank transactions — tighter cash position
  const hospTxs = [
    { id: "xht-001", type: "RECEIVE", date: daysAgo(3), total: 4200 },
    { id: "xht-002", type: "SPEND", date: daysAgo(7), total: 2100 },
    { id: "xht-003", type: "SPEND", date: daysAgo(14), total: 1800 },
    { id: "xht-004", type: "RECEIVE", date: daysAgo(17), total: 3600 },
    { id: "xht-005", type: "SPEND", date: daysAgo(21), total: 2400 },
    { id: "xht-006", type: "SPEND", date: daysAgo(28), total: 1600 },
    { id: "xht-007", type: "RECEIVE", date: daysAgo(32), total: 2840 },
    { id: "xht-008", type: "SPEND", date: daysAgo(35), total: 2200 },
    { id: "xht-009", type: "SPEND", date: daysAgo(45), total: 1900 },
    { id: "xht-010", type: "SPEND", date: daysAgo(60), total: 2100 },
  ];
  for (const tx of hospTxs) {
    await prisma.bankTransaction.upsert({
      where: { xeroTxId: tx.id },
      create: { xeroTxId: tx.id, tenantId: HOSP_TENANT, type: tx.type, status: "RECONCILED", date: tx.date, total: tx.total },
      update: {},
    });
  }

  console.log("✓ Hospitality seed complete");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  console.log("Seeding database...");
  await seedTrades();
  await seedHospitality();
  console.log("Done. Tenant IDs:");
  console.log(`  Trades:      ${TRADES_TENANT}`);
  console.log(`  Hospitality: ${HOSP_TENANT}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
