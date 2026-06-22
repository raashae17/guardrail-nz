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

export async function syncTenant(tenantId: string) {
  const [contacts, invoices, txs] = await Promise.all([
    xeroGet<XeroContactsResp>(tenantId, "/Contacts"),
    xeroGet<XeroInvoicesResp>(tenantId, "/Invoices?Statuses=AUTHORISED,SUBMITTED"),
    xeroGet<XeroBankTxResp>(tenantId, "/BankTransactions"),
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
}

export async function syncAll() {
  const conns = await prisma.xeroConnection.findMany();
  for (const c of conns) await syncTenant(c.tenantId);
}
