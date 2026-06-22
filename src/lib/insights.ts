import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import { daysOverdue, type AnonymizedInvoice } from "./anonymize";

export type Health = "GREEN" | "ORANGE" | "RED";

export interface ActionItem {
  kind: "OVERDUE_INVOICE" | "SUPPLIER_COST" | "GENERIC";
  invoiceRef?: string;
  contactToken?: string;
  message: string;
}

export interface DashboardInsights {
  health: Health;
  actionItems: ActionItem[];
}

async function loadAnonymizedInvoices(tenantId: string): Promise<AnonymizedInvoice[]> {
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
    dueDate: i.dueDate?.toISOString() ?? null,
    total: Number(i.total),
    amountDue: Number(i.amountDue),
    daysOverdue: daysOverdue(i.dueDate),
  }));
}

function localHealth(rows: AnonymizedInvoice[]): Health {
  const overdueAmount = rows
    .filter((r) => (r.daysOverdue ?? 0) > 0)
    .reduce((s, r) => s + r.amountDue, 0);
  const totalOpen = rows.reduce((s, r) => s + r.amountDue, 0) || 1;
  const ratio = overdueAmount / totalOpen;
  if (ratio > 0.4) return "RED";
  if (ratio > 0.15) return "ORANGE";
  return "GREEN";
}

export async function buildInsights(tenantId: string): Promise<DashboardInsights> {
  const rows = await loadAnonymizedInvoices(tenantId);
  const health = localHealth(rows);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const items: ActionItem[] = rows
      .filter((r) => (r.daysOverdue ?? 0) > 0)
      .slice(0, 3)
      .map((r) => ({
        kind: "OVERDUE_INVOICE",
        invoiceRef: r.invoiceRef,
        contactToken: r.contactToken,
        message: `Invoice ${r.invoiceRef} is ${r.daysOverdue} days overdue ($${r.amountDue.toFixed(2)}).`,
      }));
    return { health, actionItems: items };
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const resp = await client.messages.create({
    model,
    max_tokens: 1024,
    system:
      "You analyze anonymized SMB AR data. Contacts are tokens like C_ABCDEF12 — never invent real names. Return up to 3 urgent action items as strict JSON: {\"actionItems\":[{\"kind\":\"OVERDUE_INVOICE\",\"invoiceRef\":\"...\",\"contactToken\":\"...\",\"message\":\"...\"}]}",
    messages: [
      {
        role: "user",
        content: `Open invoices (anonymized):\n${JSON.stringify(rows, null, 2)}\n\nReturn JSON only.`,
      },
    ],
  });
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { actionItems: [] };
    return { health, actionItems: (parsed.actionItems ?? []).slice(0, 3) };
  } catch {
    return { health, actionItems: [] };
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
    return `Subject: Friendly reminder — invoice ${payload.invoiceRef}\n\nHi {{customer_name}},\n\nOur records show invoice ${payload.invoiceRef} for $${payload.amountDue.toFixed(2)} is ${overdue} days overdue. Could you confirm payment status at your earliest convenience?\n\nThanks,\n{{your_name}}`;
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const resp = await client.messages.create({
    model,
    max_tokens: 600,
    system:
      "Draft a polite, professional NZ-English payment reminder email. Use placeholders {{customer_name}} and {{your_name}} — the contact is anonymized.",
    messages: [{ role: "user", content: `Anonymized invoice: ${JSON.stringify(payload)}` }],
  });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
