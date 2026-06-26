import { prisma } from "../db";
import { detectMarginLeaks } from "../analysis";
import type { ActionCard } from "../insights";

// ---------------------------------------------------------------------------
// Margin calculator — given new ingredient cost, what price is needed?
// ---------------------------------------------------------------------------
export interface MarginAlert {
  menuItemName: string;
  category: string;
  currentPrice: number;
  currentMarginPct: number;
  targetMarginPct: number;
  suggestedPrice: number;
  priceDelta: number;
  drivenBy: string; // ingredient causing the squeeze
}

export async function analyzeMenuMargins(tenantId: string): Promise<MarginAlert[]> {
  const [items, leaks] = await Promise.all([
    prisma.menuItem.findMany({ where: { tenantId } }),
    detectMarginLeaks(tenantId),
  ]);

  const leakByIngredient = new Map(
    leaks.map((l) => [l.itemDescription.toLowerCase(), l])
  );

  const alerts: MarginAlert[] = [];

  for (const item of items) {
    const cogs = item.cogsJson as Array<{ ingredient: string; unitCost: number; qty: number }>;
    let totalCogs = 0;
    let drivenBy = "";

    for (const line of cogs) {
      const leak = leakByIngredient.get(line.ingredient.toLowerCase());
      // Use latest price from detected leaks, otherwise stored cost
      const currentUnit = leak ? leak.newUnit : line.unitCost;
      totalCogs += currentUnit * line.qty;
      if (leak && leak.changePct >= 5) drivenBy = line.ingredient;
    }

    const price = Number(item.currentPrice);
    const currentMarginPct = price > 0 ? ((price - totalCogs) / price) * 100 : 0;
    const target = Number(item.targetMarginPct);

    if (currentMarginPct < target - 2) {
      // Required price = COGS / (1 - targetMargin%)
      const suggestedPrice = totalCogs / (1 - target / 100);
      alerts.push({
        menuItemName: item.name,
        category: item.category,
        currentPrice: price,
        currentMarginPct: Math.round(currentMarginPct * 10) / 10,
        targetMarginPct: target,
        suggestedPrice: Math.ceil(suggestedPrice * 20) / 20, // round to nearest $0.05
        priceDelta: Math.ceil(suggestedPrice * 20) / 20 - price,
        drivenBy: drivenBy || "ingredient cost increase",
      });

      await prisma.menuItem.update({
        where: { id: item.id },
        data: {
          marginAlert: true,
          suggestedPrice: Math.ceil(suggestedPrice * 20) / 20,
        },
      });
    }
  }

  return alerts.sort((a, b) => a.currentMarginPct - b.currentMarginPct);
}

// ---------------------------------------------------------------------------
// High-frequency low-value line item parser
// Groups small daily/weekly transactions to find total category COGS delta
// ---------------------------------------------------------------------------
export interface CategoryCostTrend {
  category: string; // "dairy" | "coffee" | "produce" | "packaging" etc
  supplierToken: string;
  monthlySpendPrev: number;
  monthlySpendCurrent: number;
  changePct: number;
  itemCount: number;
}

const CATEGORY_KEYWORDS: Record<string, RegExp> = {
  dairy: /milk|cream|butter|cheese|yoghurt|dairy/i,
  coffee: /coffee|bean|espresso|blend|roast/i,
  produce: /vegetable|fruit|lettuce|tomato|herb|salad|avocado/i,
  meat: /chicken|beef|pork|lamb|fish|seafood|mince/i,
  packaging: /bag|cup|lid|container|napkin|takeaway|packaging/i,
  freight: /freight|delivery|courier|shipping/i,
};

function categoriseItem(description: string): string {
  for (const [cat, regex] of Object.entries(CATEGORY_KEYWORDS)) {
    if (regex.test(description)) return cat;
  }
  return "other";
}

export async function analyzeHighFrequencyLineItems(tenantId: string): Promise<CategoryCostTrend[]> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86_400_000);

  const bills = await prisma.bill.findMany({
    where: { tenantId, date: { gte: sixtyDaysAgo } },
  });

  type BucketEntry = { supplierName: string; prev: number; current: number; count: number };
  const buckets = new Map<string, BucketEntry>();

  for (const bill of bills) {
    const items = (bill.lineItemsJson as Array<{ Description?: string; UnitAmount?: number; Quantity?: number }> | null) ?? [];
    for (const item of items) {
      if (!item.Description || !item.UnitAmount) continue;
      const cat = categoriseItem(item.Description);
      const lineTotal = (item.UnitAmount ?? 0) * (item.Quantity ?? 1);
      const isRecent = bill.date && bill.date >= thirtyDaysAgo;
      const key = `${cat}||${bill.supplierName}`;

      if (!buckets.has(key)) {
        buckets.set(key, { supplierName: bill.supplierName, prev: 0, current: 0, count: 0 });
      }
      const b = buckets.get(key)!;
      b.count++;
      if (isRecent) b.current += lineTotal;
      else b.prev += lineTotal;
    }
  }

  const trends: CategoryCostTrend[] = [];
  for (const [key, b] of buckets) {
    const cat = key.split("||")[0];
    if (b.prev === 0 || b.current === 0) continue;
    const changePct = ((b.current - b.prev) / b.prev) * 100;
    if (Math.abs(changePct) >= 4) {
      trends.push({
        category: cat,
        supplierToken: `S_${Buffer.from(b.supplierName).toString("hex").slice(0, 8).toUpperCase()}`,
        monthlySpendPrev: Math.round(b.prev),
        monthlySpendCurrent: Math.round(b.current),
        changePct: Math.round(changePct * 10) / 10,
        itemCount: b.count,
      });
    }
  }

  return trends.sort((a, b) => b.changePct - a.changePct);
}

// ---------------------------------------------------------------------------
// Combine into action cards
// ---------------------------------------------------------------------------
export async function hospitalityActionCards(tenantId: string): Promise<ActionCard[]> {
  const [marginAlerts, categoryTrends, leaks] = await Promise.all([
    analyzeMenuMargins(tenantId),
    analyzeHighFrequencyLineItems(tenantId),
    detectMarginLeaks(tenantId),
  ]);

  const cards: ActionCard[] = [];

  // Menu margin alerts — most squeezed first
  for (const alert of marginAlerts.slice(0, 2)) {
    cards.push({
      severity: alert.currentMarginPct < alert.targetMarginPct - 10 ? "RED" : "ORANGE",
      kind: "PRICE_ALERT",
      title: `${alert.menuItemName} margin at ${alert.currentMarginPct}%`,
      body: `Target is ${alert.targetMarginPct}%. Driven by ${alert.drivenBy}. To restore margin: raise price by $${alert.priceDelta.toFixed(2)} to $${alert.suggestedPrice.toFixed(2)}.`,
      supplierToken: `S_MENU`,
      itemDescription: alert.drivenBy,
      oldUnit: alert.currentPrice,
      newUnit: alert.suggestedPrice,
      changePct: (alert.priceDelta / alert.currentPrice) * 100,
    });
  }

  // Category-level spend trends if no margin alerts filled slots
  for (const trend of categoryTrends.slice(0, 3 - cards.length)) {
    cards.push({
      severity: trend.changePct > 10 ? "RED" : "ORANGE",
      kind: "PRICE_ALERT",
      title: `${trend.category.charAt(0).toUpperCase() + trend.category.slice(1)} costs up ${trend.changePct}%`,
      body: `Monthly spend: $${trend.monthlySpendPrev} → $${trend.monthlySpendCurrent} (+$${trend.monthlySpendCurrent - trend.monthlySpendPrev}). ${trend.itemCount} line items analysed.`,
      supplierToken: trend.supplierToken,
      itemDescription: `${trend.category} supplies`,
      oldUnit: trend.monthlySpendPrev,
      newUnit: trend.monthlySpendCurrent,
      changePct: trend.changePct,
    });
  }

  // Fall through to raw line-item leaks
  for (const leak of leaks.slice(0, 3 - cards.length)) {
    cards.push({
      severity: "ORANGE",
      kind: "PRICE_ALERT",
      title: `${leak.supplierToken} raised unit cost ${leak.changePct}%`,
      body: `"${leak.itemDescription}" up from $${leak.oldUnit.toFixed(2)} to $${leak.newUnit.toFixed(2)}.`,
      supplierName: leak.supplierName,
      supplierToken: leak.supplierToken,
      itemDescription: leak.itemDescription,
      oldUnit: leak.oldUnit,
      newUnit: leak.newUnit,
      changePct: leak.changePct,
    });
  }

  return cards.slice(0, 3);
}
