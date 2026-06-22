import { prisma } from "./db";
import { daysOverdue } from "./anonymize";

// ---------------------------------------------------------------------------
// Customer risk profile
// ---------------------------------------------------------------------------

export interface RiskProfile {
  contactId: string;
  avgDaysLate: number;
  tier: "LOW" | "MEDIUM" | "HIGH";
  revenueRank: number; // 1 = highest revenue contact
}

export async function buildRiskProfiles(tenantId: string): Promise<Map<string, RiskProfile>> {
  const contacts = await prisma.contact.findMany({
    where: { tenantId },
    include: {
      invoices: {
        where: { status: "PAID" },
        select: { dueDate: true, updatedAt: true, total: true },
      },
    },
  });

  const profiles = contacts.map((c) => {
    const paid = c.invoices.filter((i) => i.dueDate);
    const avgLate =
      paid.length === 0
        ? 0
        : paid.reduce((s, i) => {
            const diff = Math.max(
              0,
              (i.updatedAt.getTime() - i.dueDate!.getTime()) / 86_400_000
            );
            return s + diff;
          }, 0) / paid.length;
    const revenue = c.invoices.reduce((s, i) => s + Number(i.total), 0);
    return { contactId: c.id, avgDaysLate: avgLate, revenue };
  });

  profiles.sort((a, b) => b.revenue - a.revenue);

  const map = new Map<string, RiskProfile>();
  profiles.forEach((p, idx) => {
    map.set(p.contactId, {
      contactId: p.contactId,
      avgDaysLate: Math.round(p.avgDaysLate),
      tier: p.avgDaysLate <= 5 ? "LOW" : p.avgDaysLate <= 15 ? "MEDIUM" : "HIGH",
      revenueRank: idx + 1,
    });
  });
  return map;
}

// ---------------------------------------------------------------------------
// Margin leak detection — 6-month rolling unit-price trend per supplier/item
// ---------------------------------------------------------------------------

export interface MarginLeak {
  supplierName: string;
  supplierToken: string;
  itemDescription: string;
  oldUnit: number;
  newUnit: number;
  changePct: number;
}

function supplierToken(name: string): string {
  return `S_${Buffer.from(name).toString("hex").slice(0, 8).toUpperCase()}`;
}

export async function detectMarginLeaks(tenantId: string): Promise<MarginLeak[]> {
  const since = new Date(Date.now() - 180 * 86_400_000);
  const bills = await prisma.bill.findMany({
    where: { tenantId, date: { gte: since } },
    orderBy: { date: "asc" },
  });

  // group line items by supplier + description
  const map = new Map<
    string,
    { name: string; token: string; desc: string; entries: { date: Date; unit: number }[] }
  >();

  for (const b of bills) {
    const items =
      (b.lineItemsJson as Array<{ Description?: string; UnitAmount?: number }> | null) ?? [];
    for (const item of items) {
      if (!item.Description || !item.UnitAmount) continue;
      const key = `${b.supplierName}||${item.Description.slice(0, 80)}`;
      if (!map.has(key)) {
        map.set(key, {
          name: b.supplierName,
          token: supplierToken(b.supplierName),
          desc: item.Description.slice(0, 80),
          entries: [],
        });
      }
      map.get(key)!.entries.push({ date: b.date ?? new Date(), unit: item.UnitAmount });
    }
  }

  const leaks: MarginLeak[] = [];
  for (const group of map.values()) {
    if (group.entries.length < 2) continue;
    const sorted = group.entries.sort((a, b) => a.date.getTime() - b.date.getTime());
    const oldest = sorted[0].unit;
    const newest = sorted[sorted.length - 1].unit;
    const changePct = ((newest - oldest) / oldest) * 100;
    if (changePct >= 5) {
      leaks.push({
        supplierName: group.name,
        supplierToken: group.token,
        itemDescription: group.desc,
        oldUnit: oldest,
        newUnit: newest,
        changePct: Math.round(changePct * 10) / 10,
      });
    }
  }

  // most impactful leaks first
  return leaks.sort((a, b) => b.changePct - a.changePct);
}
