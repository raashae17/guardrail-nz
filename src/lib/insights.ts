import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import { daysOverdue } from "./anonymize";

export type Severity = "RED" | "ORANGE" | "GREEN";

export interface ActionCard {
  severity: Severity;
  kind: "OVERDUE_INVOICE" | "PRICE_ALERT" | "MARGIN" | "GENERIC";
  title: string;
  body: string;
  invoiceRef?: string;
  contactToken?: string;
  amount?: number;
}

export interface DashboardInsights {
  runwayDays: number;
  runwayLabel: string;
  cards: ActionCard[];
}

function runwayLabel(days: number): string {
  if (days >= 60) return "Safe";
  if (days >= 30) return "Watch";
  return "Tight";
}

async function computeRunway(tenantId: string): Promise<number> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [txs, bills] = await Promise.all([
    prisma.bankTransaction.findMany({ where: { tenantId, date: { gte: since } } }),
    prisma.bill.findMany({ where: { tenantId } }),
  ]);

  const cashOnHand = txs.reduce((s, t) => {
    const sign = t.type?.toUpperCase().includes("RECEIVE") ? 1 : -1;
    return s + sign * Number(t.total);
  }, 0);

  const outflow90 = txs
    .filter((t) => !t.type?.toUpperCase().includes("RECEIVE"))
    .reduce((s, t) => s + Number(t.total), 0);
  const dailyBurn = outflow90 / 90 || 1;

  const openBills = bills.reduce((s, b) => s + Number(b.amountDue), 0);
  const net = Math.max(cashOnHand - openBills, 0);
  return Math.max(0, Math.floor(net / dailyBurn));
}

interface AnonInvoice {
  invoiceRef: string;
  contactToken: string;
  status: string;
  daysOverdue: number | null;
  amountDue: number;
}

interface AnonBill {
  supplierToken: string;
  date: string | null;
  total: number;
  topLine?: { desc: string; unit: number };
}

function stripAddress(text: string): string {
  // crude removal of street numbers + obvious address tokens before LLM
  return text.replace(/\b\d+\s+[A-Z][a-z]+\s+(Street|St|Road|Rd|Ave|Avenue|Lane|Ln)\b/gi, "");
}

async function loadAnonInvoices(tenantId: string): Promise<AnonInvoice[]> {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, status: { in: ["AUTHORISED", "SUBMITTED"] } },
    include: { contact: true },
    orderBy: { dueDate: "asc" },
    take: 100,
  });
  return invoices.map((i) => ({
    invoiceRef: i.invoiceNumber ?? i.xeroInvoiceId.slice(0, 8),
    contactToken: i.contact?.anonToken ?? "C_UNKNOWN",
    status: i.status,
    daysOverdue: daysOverdue(i.dueDate),
    amountDue: Number(i.amountDue),
  }));
}

async function loadAnonBills(tenantId: string): Promise<AnonBill[]> {
  const bills = await prisma.bill.findMany({
    where: { tenantId },
    orderBy: { date: "desc" },
    take: 200,
  });
  return bills.map((b) => {
    const items = (b.lineItemsJson as Array<{ Description?: string; UnitAmount?: number }> | null) ?? [];
    const top = items[0];
    return {
      supplierToken: `S_${Buffer.from(b.supplierName).toString("hex").slice(0, 8).toUpperCase()}`,
      date: b.date?.toISOString().slice(0, 10) ?? null,
      total: Number(b.total),
      topLine: top
        ? { desc: stripAddress(top.Description ?? "").slice(0, 60), unit: top.UnitAmount ?? 0 }
        : undefined,
    };
  });
}

function localCards(invoices: AnonInvoice[]): ActionCard[] {
  return invoices
    .filter((i) => (i.daysOverdue ?? 0) > 0)
    .slice(0, 3)
    .map<ActionCard>((i) => ({
      severity: (i.daysOverdue ?? 0) > 14 ? "RED" : "ORANGE",
      kind: "OVERDUE_INVOICE",
      title: `Invoice ${i.invoiceRef} is ${i.daysOverdue} days late`,
      body: `${i.contactToken} owes you $${i.amountDue.toFixed(2)}. Tap to nudge.`,
      invoiceRef: i.invoiceRef,
      contactToken: i.contactToken,
      amount: i.amountDue,
    }));
}

export async function buildInsights(tenantId: string): Promise<DashboardInsights> {
  const [invoices, bills, runwayDays] = await Promise.all([
    loadAnonInvoices(tenantId),
    loadAnonBills(tenantId),
    computeRunway(tenantId),
  ]);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { runwayDays, runwayLabel: runwayLabel(runwayDays), cards: localCards(invoices) };
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const resp = await client.messages.create({
    model,
    max_tokens: 1500,
    system:
      'You analyze anonymized NZ tradie AR/AP data. Contacts use tokens like C_ABCDEF12 and suppliers S_XXXXXXXX — never invent real names. Detect overdue invoices and supplier unit-cost hikes (>5%). Return strict JSON: {"cards":[{"severity":"RED|ORANGE","kind":"OVERDUE_INVOICE|PRICE_ALERT|MARGIN","title":"...","body":"...","invoiceRef":"...","contactToken":"...","amount":0}]}. Max 3 cards, most urgent first.',
    messages: [
      {
        role: "user",
        content: `Open invoices: ${JSON.stringify(invoices)}\n\nRecent bills: ${JSON.stringify(bills)}\n\nReturn JSON only.`,
      },
    ],
  });
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { cards: [] };
    return {
      runwayDays,
      runwayLabel: runwayLabel(runwayDays),
      cards: (parsed.cards ?? []).slice(0, 3),
    };
  } catch {
    return { runwayDays, runwayLabel: runwayLabel(runwayDays), cards: localCards(invoices) };
  }
}

export async function draftReminderEmail(tenantId: string, invoiceRef: string): Promise<string> {
  const inv = await prisma.invoice.findFirst({
    where: { tenantId, OR: [{ invoiceNumber: invoiceRef }, { xeroInvoiceId: { startsWith: invoiceRef } }] },
    include: { contact: true },
  });
  if (!inv) throw new Error("Invoice not found");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const overdue = daysOverdue(inv.dueDate) ?? 0;
  const payload = {
    invoiceRef: inv.invoiceNumber ?? inv.xeroInvoiceId.slice(0, 8),
    contactToken: inv.contact?.anonToken ?? "C_UNKNOWN",
    amountDue: Number(inv.amountDue),
    daysOverdue: overdue,
  };

  if (!apiKey) {
    return `Subject: Friendly reminder — invoice ${payload.invoiceRef}\n\nHi {{customer_name}},\n\nOur records show invoice ${payload.invoiceRef} for $${payload.amountDue.toFixed(2)} is ${overdue} days overdue. Could you confirm payment status?\n\nThanks,\n{{your_name}}`;
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const resp = await client.messages.create({
    model,
    max_tokens: 600,
    system:
      "Draft a polite, professional NZ-English payment reminder for a tradie. Use placeholders {{customer_name}} and {{your_name}} — contact is anonymized.",
    messages: [{ role: "user", content: `Anonymized invoice: ${JSON.stringify(payload)}` }],
  });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
