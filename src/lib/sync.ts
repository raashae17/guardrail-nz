import { prisma } from "./db";
import { xeroGet } from "./xero-client";
import { tokenForContact } from "./anonymize";
import { classifyInvoice } from "./pipeline/trades";

interface XeroInvoicesResp {
  Invoices: Array<{
    InvoiceID: string;
    InvoiceNumber?: string;
    Reference?: string;
    Type: string;
    Status: string;
    DateString?: string;
    DueDateString?: string;
    Total: number;
    AmountDue: number;
    Contact?: { ContactID: string };
    LineItems?: Array<{ Description?: string; Quantity?: number; UnitAmount?: number }>;
  }>;
}

interface XeroContactsResp {
  Contacts: Array<{ ContactID: string; Name: string }>;
}

interface XeroBankTxResp {
  BankTransactions: Array<{
    BankTransactionID: string;
    Type: string;
    Status: string;
    DateString: string;
    Total: number;
  }>;
}

export async function syncTenant(tenantId: string) {
  const [contacts, invoices, accpayInvoices, txs] = await Promise.all([
    xeroGet<XeroContactsResp>(tenantId, "/Contacts"),
    xeroGet<XeroInvoicesResp>(tenantId, '/Invoices?Statuses=AUTHORISED,SUBMITTED,PAID&where=Type=="ACCREC"'),
    xeroGet<XeroInvoicesResp>(tenantId, '/Invoices?where=Type=="ACCPAY"'),
    xeroGet<XeroBankTxResp>(tenantId, "/BankTransactions"),
  ]);

  // Contacts
  for (const c of contacts.Contacts) {
    await prisma.contact.upsert({
      where: { xeroContactId: c.ContactID },
      create: {
        xeroContactId: c.ContactID,
        tenantId,
        anonToken: tokenForContact(c.ContactID),
        name: c.Name,
      },
      update: { name: c.Name },
    });
  }

  // Sales invoices (ACCREC) — detect progress/stage invoices
  for (const inv of invoices.Invoices) {
    const contact = inv.Contact
      ? await prisma.contact.findUnique({ where: { xeroContactId: inv.Contact.ContactID } })
      : null;
    const { isProgressStage, stageNumber } = classifyInvoice(inv.Reference ?? null, inv.InvoiceNumber ?? null);

    await prisma.invoice.upsert({
      where: { xeroInvoiceId: inv.InvoiceID },
      create: {
        xeroInvoiceId: inv.InvoiceID,
        tenantId,
        invoiceNumber: inv.InvoiceNumber,
        reference: inv.Reference,
        status: inv.Status,
        issueDate: inv.DateString ? new Date(inv.DateString) : null,
        dueDate: inv.DueDateString ? new Date(inv.DueDateString) : null,
        total: inv.Total,
        amountDue: inv.AmountDue,
        contactId: contact?.id,
        isProgressStage,
        stageNumber,
        lineItemsJson: inv.LineItems ?? [],
      },
      update: {
        status: inv.Status,
        dueDate: inv.DueDateString ? new Date(inv.DueDateString) : null,
        amountDue: inv.AmountDue,
        isProgressStage,
        stageNumber,
        lineItemsJson: inv.LineItems ?? [],
      },
    });
  }

  // Bills (ACCPAY) — supplier invoices
  for (const b of accpayInvoices.Invoices) {
    const supplierName = b.Contact
      ? (await prisma.contact.findUnique({ where: { xeroContactId: b.Contact.ContactID } }))?.name ?? "Unknown"
      : "Unknown";

    await prisma.bill.upsert({
      where: { xeroInvoiceId: b.InvoiceID },
      create: {
        xeroInvoiceId: b.InvoiceID,
        tenantId,
        supplierName,
        date: b.DateString ? new Date(b.DateString) : null,
        dueDate: b.DueDateString ? new Date(b.DueDateString) : null,
        total: b.Total,
        amountDue: b.AmountDue,
        lineItemsJson: b.LineItems ?? [],
      },
      update: {
        supplierName,
        date: b.DateString ? new Date(b.DateString) : null,
        dueDate: b.DueDateString ? new Date(b.DueDateString) : null,
        total: b.Total,
        amountDue: b.AmountDue,
        lineItemsJson: b.LineItems ?? [],
      },
    });
  }

  // Bank transactions
  for (const tx of txs.BankTransactions) {
    await prisma.bankTransaction.upsert({
      where: { xeroTxId: tx.BankTransactionID },
      create: {
        xeroTxId: tx.BankTransactionID,
        tenantId,
        type: tx.Type,
        status: tx.Status,
        date: new Date(tx.DateString),
        total: tx.Total,
      },
      update: { status: tx.Status, total: tx.Total },
    });
  }

  // Update contact risk metrics
  await updateContactMetrics(tenantId);
}

async function updateContactMetrics(tenantId: string) {
  const contacts = await prisma.contact.findMany({
    where: { tenantId },
    include: { invoices: { where: { status: "PAID" } } },
  });

  for (const c of contacts) {
    const paid = c.invoices.filter((i) => i.dueDate);
    const avgDaysLate =
      paid.length === 0
        ? 0
        : paid.reduce((s, i) => {
            return s + Math.max(0, (i.updatedAt.getTime() - i.dueDate!.getTime()) / 86_400_000);
          }, 0) / paid.length;
    const totalRevenue = c.invoices.reduce((s, i) => s + Number(i.total), 0);

    await prisma.contact.update({
      where: { id: c.id },
      data: { avgDaysLate, totalRevenue },
    });
  }
}

export async function syncAll() {
  const conns = await prisma.xeroConnection.findMany();
  for (const c of conns) await syncTenant(c.tenantId);
}
