import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import { daysOverdue } from "./anonymize";
import { buildRiskProfiles, detectMarginLeaks, type MarginLeak, type RiskProfile } from "./analysis";

export type Severity = "RED" | "ORANGE" | "GREEN";

export interface ActionCard {
  severity: Severity;
  kind: "OVERDUE_INVOICE" | "PRICE_ALERT" | "MARGIN" | "GENERIC";
  title: string;
  body: string;
  invoiceRef?: string;
  contactToken?: string;
  contactId?: string;
  amount?: number;
  // for supplier negotiation
  supplierName?: string;
  supplierToken?: string;
  itemDescription?: string;
  oldUnit?: number;
  newUnit?: number;
  changePct?: number;
}

export interface DashboardInsights {
  runwayDays: number;
  runwayLabel: string;
  cards: ActionCard[];
}

export function runwayLabel(days: number): string {
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
  return Math.max(0, Math.floor(Math.max(cashOnHand - openBills, 0) / dailyBurn));
}

interface AnonInvoice {
  invoiceRef: string;
  contactToken: string;
  contactId: string;
  daysOverdue: number | null;
  amountDue: number;
  avgDaysLate: number;
  riskTier: string;
  revenueRank: number;
}

async function loadAnonInvoices(
  tenantId: string,
  riskMap: Map<string, RiskProfile>
): Promise<AnonInvoice[]> {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, status: { in: ["AUTHORISED", "SUBMITTED"] } },
    include: { contact: true },
    orderBy: { dueDate: "asc" },
    take: 100,
  });
  return invoices.map((i) => {
    const risk = i.contact ? riskMap.get(i.contact.id) : undefined;
    return {
      invoiceRef: i.invoiceNumber ?? i.xeroInvoiceId.slice(0, 8),
      contactToken: i.contact?.anonToken ?? "C_UNKNOWN",
      contactId: i.contact?.id ?? "",
      daysOverdue: daysOverdue(i.dueDate),
      amountDue: Number(i.amountDue),
      avgDaysLate: risk?.avgDaysLate ?? 0,
      riskTier: risk?.tier ?? "LOW",
      revenueRank: risk?.revenueRank ?? 99,
    };
  });
}

function localCards(invoices: AnonInvoice[], leaks: MarginLeak[]): ActionCard[] {
  const overdueCards: ActionCard[] = invoices
    .filter((i) => (i.daysOverdue ?? 0) > 0)
    .slice(0, 2)
    .map((i) => ({
      severity: (i.daysOverdue ?? 0) > 14 || i.riskTier === "HIGH" ? "RED" : "ORANGE",
      kind: "OVERDUE_INVOICE",
      title: `Invoice ${i.invoiceRef} is ${i.daysOverdue} days late`,
      body: `${i.contactToken} owes you $${i.amountDue.toFixed(2)}. Tap to draft a reminder.`,
      invoiceRef: i.invoiceRef,
      contactToken: i.contactToken,
      contactId: i.contactId,
      amount: i.amountDue,
    }));

  const leakCards: ActionCard[] = leaks.slice(0, 1).map((l) => ({
    severity: "ORANGE",
    kind: "PRICE_ALERT",
    title: `${l.supplierToken} raised unit cost ${l.changePct}%`,
    body: `"${l.itemDescription}" went from $${l.oldUnit.toFixed(2)} to $${l.newUnit.toFixed(2)}. Tap to draft a negotiation email.`,
    supplierName: l.supplierName,
    supplierToken: l.supplierToken,
    itemDescription: l.itemDescription,
    oldUnit: l.oldUnit,
    newUnit: l.newUnit,
    changePct: l.changePct,
  }));

  return [...overdueCards, ...leakCards].slice(0, 3);
}

export async function buildInsights(tenantId: string): Promise<DashboardInsights> {
  const [riskMap, leaks, runwayDays] = await Promise.all([
    buildRiskProfiles(tenantId),
    detectMarginLeaks(tenantId),
    computeRunway(tenantId),
  ]);
  const invoices = await loadAnonInvoices(tenantId, riskMap);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { runwayDays, runwayLabel: runwayLabel(runwayDays), cards: localCards(invoices, leaks) };
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const resp = await client.messages.create({
    model,
    max_tokens: 1800,
    system: `You analyze anonymized NZ tradie AR/AP data.
Contacts use tokens like C_ABCDEF12 and suppliers S_XXXXXXXX — never use real names.
Each invoice includes avgDaysLate and riskTier (LOW/MEDIUM/HIGH) to inform urgency.
Detect: overdue invoices (OVERDUE_INVOICE) and supplier unit-cost hikes ≥5% over 6 months (PRICE_ALERT).
Return strict JSON only:
{"cards":[{"severity":"RED|ORANGE","kind":"OVERDUE_INVOICE|PRICE_ALERT","title":"...","body":"...","invoiceRef":"...","contactToken":"...","contactId":"...","amount":0,"supplierToken":"...","supplierName":"...","itemDescription":"...","oldUnit":0,"newUnit":0,"changePct":0}]}
Max 3 cards, most urgent first.`,
    messages: [
      {
        role: "user",
        content: `Open invoices (with risk profile): ${JSON.stringify(invoices)}\n\nSupplier price leaks (6-month): ${JSON.stringify(leaks)}\n\nReturn JSON only.`,
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
    return { runwayDays, runwayLabel: runwayLabel(runwayDays), cards: (parsed.cards ?? []).slice(0, 3) };
  } catch {
    return { runwayDays, runwayLabel: runwayLabel(runwayDays), cards: localCards(invoices, leaks) };
  }
}

// ---------------------------------------------------------------------------
// Draft: customer reminder (tone-aware) or supplier negotiation
// ---------------------------------------------------------------------------

export async function draftReminderEmail(tenantId: string, invoiceRef: string): Promise<string> {
  const inv = await prisma.invoice.findFirst({
    where: { tenantId, OR: [{ invoiceNumber: invoiceRef }, { xeroInvoiceId: { startsWith: invoiceRef } }] },
    include: { contact: true },
  });
  if (!inv) throw new Error("Invoice not found");

  const overdue = daysOverdue(inv.dueDate) ?? 0;
  const riskMap = await buildRiskProfiles(tenantId);
  const risk = inv.contact ? riskMap.get(inv.contact.id) : undefined;

  const payload = {
    invoiceRef: inv.invoiceNumber ?? inv.xeroInvoiceId.slice(0, 8),
    contactToken: inv.contact?.anonToken ?? "C_UNKNOWN",
    amountDue: Number(inv.amountDue),
    daysOverdue: overdue,
    avgDaysLate: risk?.avgDaysLate ?? 0,
    riskTier: risk?.tier ?? "LOW",
    revenueRank: risk?.revenueRank ?? 99,
  };

  const toneGuide =
    payload.riskTier === "HIGH" || payload.revenueRank <= 3
      ? "Friendly, warm, conversational Kiwi tone. Use phrases like 'Hope the week's treating you well' or 'Just sliding this to the top of your mind'. They are a key client — preserve the relationship. Avoid legalistic language."
      : payload.riskTier === "MEDIUM"
      ? "Polite but clear Kiwi tone. Mention it's overdue, ask for an ETA on payment, keep it professional and brief."
      : "Firm but courteous NZ business tone. State the overdue amount and due date clearly. Request payment or contact by end of week.";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return `Subject: Just a quick one — invoice ${payload.invoiceRef}\n\nHope the week's treating you well!\n\nJust sliding this to the top of your mind — invoice ${payload.invoiceRef} for $${payload.amountDue.toFixed(2)} is ${overdue} days overdue. No dramas, just keen to get it sorted when you get a chance.\n\nCheers,\n{{your_name}}`;
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const resp = await client.messages.create({
    model,
    max_tokens: 600,
    system: `You draft NZ business payment reminders. Use placeholders {{customer_name}} and {{your_name}}. Contact is anonymized — never invent a name. Tone guide: ${toneGuide}`,
    messages: [{ role: "user", content: `Invoice details: ${JSON.stringify(payload)}` }],
  });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export async function draftSupplierNegotiation(leak: {
  supplierName: string;
  supplierToken: string;
  itemDescription: string;
  oldUnit: number;
  newUnit: number;
  changePct: number;
}): Promise<{ ownerAlert: string; supplierEmail: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const fallbackAlert = `Price alert: ${leak.supplierToken} raised "${leak.itemDescription}" by ${leak.changePct}% ($${leak.oldUnit.toFixed(2)} → $${leak.newUnit.toFixed(2)}). This is compressing your margin. Consider negotiating a bulk rate or finding an alternate supplier.`;
  const fallbackEmail = `Subject: Following up on recent pricing — ${leak.itemDescription}\n\nKia ora,\n\nWe've been a loyal customer and noticed "${leak.itemDescription}" has increased by ${leak.changePct}% recently. We'd love to continue the relationship — is there a bulk purchase arrangement or loyalty discount we could discuss to help us manage margins?\n\nHappy to have a chat.\n\nNgā mihi,\n{{your_name}}`;

  if (!apiKey) return { ownerAlert: fallbackAlert, supplierEmail: fallbackEmail };

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const resp = await client.messages.create({
    model,
    max_tokens: 1000,
    system: `You help NZ tradies protect their margins. Write in plain, professional NZ English. Return strict JSON:
{"ownerAlert":"...","supplierEmail":"..."}
ownerAlert: 2-3 sentence internal note to the business owner explaining the margin impact and options (bulk buy, alternate supplier, price pass-through).
supplierEmail: polite email to the supplier asking if a bulk discount, loyalty rate, or volume commitment could restore the original pricing. Use placeholder {{your_name}}. Do not use the supplier's real name — refer to them as 'your team'.`,
    messages: [
      {
        role: "user",
        content: `Supplier token: ${leak.supplierToken}. Item: "${leak.itemDescription}". Old unit: $${leak.oldUnit.toFixed(2)}. New unit: $${leak.newUnit.toFixed(2)}. Change: ${leak.changePct}%.`,
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { ownerAlert: fallbackAlert, supplierEmail: fallbackEmail };
  } catch {
    return { ownerAlert: fallbackAlert, supplierEmail: fallbackEmail };
  }
}
