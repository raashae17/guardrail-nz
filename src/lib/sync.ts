import { prisma } from "./db";
import { xeroGet } from "./xero-client";
import { tokenForContact } from "./anonymize";

interface XeroInvoicesResp {
  Invoices: Array<{
    InvoiceID: string;
    InvoiceNumber?: string;
    Status: string;
    DueDateString?: string;
    Total: number;
    AmountDue: number;
    Contact?: { ContactID: string };
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

interface XeroBillsResp {
  Invoices: Array<{
    InvoiceID: string;
    Type: string;
    Status: string;
    DateString?: string;
    DueDateString?: string;
    Total: number;
    AmountDue: number;
    Contact?: { Name: string };
    LineItems?: Array<{ Description?: string; Quantity?: number; UnitAmount?: number; AccountCode?: string }>;
  }>;
}

export async function syncTenant(tenantId: string) {
  const [contacts, invoices, txs, bills] = await Promise.all([
    xeroGet<XeroContactsResp>(tenantId, "/Contacts"),
    xeroGet<XeroInvoicesResp>(tenantId, "/Invoices?Statuses=AUTHORISED,SUBMITTED,PAID"),
    xeroGet<XeroBankTxResp>(tenantId, "/BankTransactions"),
    xeroGet<XeroBillsResp>(tenantId, "/Invoices?where=Type==\"ACCPAY\""),
  ]);

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

  for (const inv of invoices.Invoices) {
    const contact = inv.Contact
      ? await prisma.contact.findUnique({ where: { xeroContactId: inv.Contact.ContactID } })
      : null;
    await prisma.invoice.upsert({
      where: { xeroInvoiceId: inv.InvoiceID },
      create: {
        xeroInvoiceId: inv.InvoiceID,
        tenantId,
        invoiceNumber: inv.InvoiceNumber,
        status: inv.Status,
        dueDate: inv.DueDateString ? new Date(inv.DueDateString) : null,
        total: inv.Total,
        amountDue: inv.AmountDue,
        contactId: contact?.id,
      },
      update: {
        status: inv.Status,
        dueDate: inv.DueDateString ? new Date(inv.DueDateString) : null,
        total: inv.Total,
        amountDue: inv.AmountDue,
        contactId: contact?.id,
      },
    });
  }

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

  for (const b of bills.Invoices) {
    await prisma.bill.upsert({
      where: { xeroInvoiceId: b.InvoiceID },
      create: {
        xeroInvoiceId: b.InvoiceID,
        tenantId,
        supplierName: b.Contact?.Name ?? "Unknown",
        date: b.DateString ? new Date(b.DateString) : null,
        dueDate: b.DueDateString ? new Date(b.DueDateString) : null,
        total: b.Total,
        amountDue: b.AmountDue,
        lineItemsJson: b.LineItems ?? [],
      },
      update: {
        supplierName: b.Contact?.Name ?? "Unknown",
        date: b.DateString ? new Date(b.DateString) : null,
        dueDate: b.DueDateString ? new Date(b.DueDateString) : null,
        total: b.Total,
        amountDue: b.AmountDue,
        lineItemsJson: b.LineItems ?? [],
      },
    });
  }
}

export async function syncAll() {
  const conns = await prisma.xeroConnection.findMany();
  for (const c of conns) await syncTenant(c.tenantId);
}
