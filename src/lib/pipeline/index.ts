import { prisma } from "../db";
import { buildInsights as genericInsights } from "../insights";
import { tradesActionCards } from "./trades";
import { hospitalityActionCards } from "./hospitality";
import type { DashboardInsights } from "../insights";

export async function buildIndustryInsights(tenantId: string): Promise<DashboardInsights> {
  const conn = await prisma.xeroConnection.findUnique({ where: { tenantId } });
  const industry = conn?.industry;

  // Compute runway the same way regardless of industry
  const base = await genericInsights(tenantId);

  if (industry === "trades") {
    const cards = await tradesActionCards(tenantId);
    return { ...base, cards };
  }

  if (industry === "hospitality") {
    const cards = await hospitalityActionCards(tenantId);
    return { ...base, cards };
  }

  // Generic path for ecommerce / unknown
  return base;
}
