import { prisma } from "../db";
import { detectMarginLeaks } from "../analysis";
import type { ActionCard } from "../insights";

// Keywords that identify a progress/stage invoice in Xero reference or invoice number fields
const STAGE_PATTERNS = [
  /progress\s*(invoice|payment|claim)?/i,
  /stage\s*\d+/i,
  /\bPI[-\s]?\d+/i,
  /milestone\s*\d+/i,
  /pc\s*\d+/i, // "PC1", "PC2" — progress claim
  /drawdown/i,
  /retention/i,
];

function isProgressInvoice(ref: string | null, num: string | null): boolean {
  const text = `${ref ?? ""} ${num ?? ""}`;
  return STAGE_PATTERNS.some((p) => p.test(text));
}

function extractStageNumber(ref: string | null, num: string | null): number | null {
  const text = `${ref ?? ""} ${num ?? ""}`;
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// ---------------------------------------------------------------------------
// Progress invoice analysis
// ---------------------------------------------------------------------------
export interface ProgressSummary {
  jobRef: string;
  contactToken: string;
  stages: Array<{
    invoiceRef: string;
    stageNumber: number | null;
    status: string;
    amountDue: number;
    daysOverdue: number | null;
  }>;
  totalOutstanding: number;
  hasOverdueStage: boolean;
  maxDaysOverdue: number;
}

export async function analyzeProgressInvoices(tenantId: string): Promise<ProgressSummary[]> {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, isProgressStage: true, status: { in: ["AUTHORISED", "SUBMITTED"] } },
    include: { contact: true },
    orderBy: { issueDate: "asc" },
  });

  // Group by contact (proxy for job)
  const jobMap = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const key = inv.contactId ?? inv.xeroInvoiceId;
    if (!jobMap.has(key)) jobMap.set(key, []);
    jobMap.get(key)!.push(inv);
  }

  const summaries: ProgressSummary[] = [];
  for (const [, stages] of jobMap) {
    const contact = stages[0].contact;
    const now = Date.now();
    const stageData = stages.map((inv) => {
      const overdue = inv.dueDate ? Math.max(0, Math.floor((now - inv.dueDate.getTime()) / 86_400_000)) : null;
      return {
        invoiceRef: inv.invoiceNumber ?? inv.xeroInvoiceId.slice(0, 8),
        stageNumber: inv.stageNumber,
        status: inv.status,
        amountDue: Number(inv.amountDue),
        daysOverdue: overdue && overdue > 0 ? overdue : null,
      };
    });

    const overdueStages = stageData.filter((s) => (s.daysOverdue ?? 0) > 0);
    summaries.push({
      jobRef: `JOB-${contact?.anonToken?.slice(-4) ?? "XXXX"}`,
      contactToken: contact?.anonToken ?? "C_UNKNOWN",
      stages: stageData,
      totalOutstanding: stageData.reduce((s, i) => s + i.amountDue, 0),
      hasOverdueStage: overdueStages.length > 0,
      maxDaysOverdue: Math.max(0, ...overdueStages.map((s) => s.daysOverdue ?? 0)),
    });
  }

  return summaries.sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue);
}

// ---------------------------------------------------------------------------
// Quote exposure: compare materials on QuotedJobs vs current bill prices
// ---------------------------------------------------------------------------
export interface QuoteExposure {
  jobReference: string;
  contactToken: string;
  quotedAt: Date;
  exposureAmount: number;
  affectedItems: Array<{ description: string; quotedUnit: number; currentUnit: number; changePct: number }>;
}

export async function analyzeQuoteExposure(tenantId: string): Promise<QuoteExposure[]> {
  const [jobs, leaks] = await Promise.all([
    prisma.quotedJob.findMany({ where: { tenantId } }),
    detectMarginLeaks(tenantId),
  ]);

  const leakMap = new Map(leaks.map((l) => [l.itemDescription.toLowerCase(), l]));
  const exposures: QuoteExposure[] = [];

  for (const job of jobs) {
    const items = job.lineItemsJson as Array<{ description: string; qty: number; unitAtQuote: number }>;
    const affected: QuoteExposure["affectedItems"] = [];
    let totalExposure = 0;

    for (const item of items) {
      const leak = leakMap.get(item.description.toLowerCase());
      if (!leak) continue;
      const exposurePerUnit = leak.newUnit - leak.oldUnit;
      const itemExposure = exposurePerUnit * item.qty;
      totalExposure += itemExposure;
      affected.push({
        description: item.description,
        quotedUnit: item.unitAtQuote,
        currentUnit: leak.newUnit,
        changePct: leak.changePct,
      });
    }

    if (affected.length > 0) {
      await prisma.quotedJob.update({
        where: { id: job.id },
        data: { exposureAmount: totalExposure, flagged: true },
      });
      exposures.push({
        jobReference: job.jobReference,
        contactToken: job.contactToken,
        quotedAt: job.quotedAt,
        exposureAmount: totalExposure,
        affectedItems: affected,
      });
    }
  }

  return exposures.sort((a, b) => b.exposureAmount - a.exposureAmount);
}

// ---------------------------------------------------------------------------
// Combine into action cards for the dashboard
// ---------------------------------------------------------------------------
export async function tradesActionCards(tenantId: string): Promise<ActionCard[]> {
  const [progress, exposure, leaks] = await Promise.all([
    analyzeProgressInvoices(tenantId),
    analyzeQuoteExposure(tenantId),
    detectMarginLeaks(tenantId),
  ]);

  const cards: ActionCard[] = [];

  // Overdue progress stages — most urgent first
  for (const job of progress.filter((j) => j.hasOverdueStage).slice(0, 2)) {
    const worstStage = job.stages.find((s) => s.daysOverdue === job.maxDaysOverdue)!;
    cards.push({
      severity: job.maxDaysOverdue > 14 ? "RED" : "ORANGE",
      kind: "OVERDUE_INVOICE",
      title: `Stage payment ${job.maxDaysOverdue} days overdue — ${job.jobRef}`,
      body: `${job.contactToken} owes $${worstStage.amountDue.toLocaleString()} (${job.stages.length}-stage job, $${job.totalOutstanding.toLocaleString()} total outstanding). Missing this could hold up your next subcontractor payment.`,
      invoiceRef: worstStage.invoiceRef,
      contactToken: job.contactToken,
      amount: worstStage.amountDue,
    });
  }

  // Quote exposure cards
  for (const exp of exposure.slice(0, 1)) {
    const topItem = exp.affectedItems[0];
    cards.push({
      severity: "ORANGE",
      kind: "PRICE_ALERT",
      title: `Quote exposure: ${exp.jobReference} margin at risk`,
      body: `Material prices moved since your quote date (${exp.quotedAt.toLocaleDateString("en-NZ")}). Estimated under-margin: $${exp.exposureAmount.toFixed(0)}. Consider a variation notice.`,
      supplierToken: `S_EXPOSURE`,
      itemDescription: topItem.description,
      oldUnit: topItem.quotedUnit,
      newUnit: topItem.currentUnit,
      changePct: topItem.changePct,
    });
  }

  // Raw supplier price alerts not linked to a quoted job
  if (cards.length < 3) {
    for (const leak of leaks.slice(0, 3 - cards.length)) {
      cards.push({
        severity: "ORANGE",
        kind: "PRICE_ALERT",
        title: `${leak.supplierToken} raised unit cost ${leak.changePct}%`,
        body: `"${leak.itemDescription}" up $${(leak.newUnit - leak.oldUnit).toFixed(2)}/unit over 6 months.`,
        supplierName: leak.supplierName,
        supplierToken: leak.supplierToken,
        itemDescription: leak.itemDescription,
        oldUnit: leak.oldUnit,
        newUnit: leak.newUnit,
        changePct: leak.changePct,
      });
    }
  }

  return cards.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Sync helper: flag progress invoices on upsert
// ---------------------------------------------------------------------------
export function classifyInvoice(reference: string | null, invoiceNumber: string | null) {
  const isProgress = isProgressInvoice(reference, invoiceNumber);
  const stageNumber = isProgress ? extractStageNumber(reference, invoiceNumber) : null;
  return { isProgressStage: isProgress, stageNumber };
}
