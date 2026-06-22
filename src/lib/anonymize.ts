import { createHash } from "crypto";

export function tokenForContact(xeroContactId: string): string {
  const h = createHash("sha256").update(xeroContactId).digest("hex");
  return `C_${h.slice(0, 8).toUpperCase()}`;
}

export interface AnonymizedInvoice {
  invoiceRef: string;
  contactToken: string;
  status: string;
  dueDate: string | null;
  total: number;
  amountDue: number;
  daysOverdue: number | null;
}

export function daysOverdue(due: Date | null): number | null {
  if (!due) return null;
  const diff = Date.now() - due.getTime();
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
}
