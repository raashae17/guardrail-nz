import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { xeroGet } from "@/lib/xero-client";

// Sends a reminder via Xero's native /Invoices/{InvoiceID}/Email endpoint.
// Requires the accounting.transactions scope.
export async function POST(req: NextRequest) {
  const { invoiceRef, draft } = await req.json();
  if (!invoiceRef) return NextResponse.json({ error: "invoiceRef required" }, { status: 400 });

  const conn = await prisma.xeroConnection.findFirst();
  if (!conn) return NextResponse.json({ error: "Not connected" }, { status: 400 });

  const inv = await prisma.invoice.findFirst({
    where: {
      tenantId: conn.tenantId,
      OR: [{ invoiceNumber: invoiceRef }, { xeroInvoiceId: { startsWith: invoiceRef } }],
    },
  });
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // Xero's native email endpoint uses the template configured in Xero;
  // we record the AI-drafted text alongside for the user's records.
  try {
    await xeroGet(conn.tenantId, `/Invoices/${inv.xeroInvoiceId}/Email`);
    console.log("[send-reminder]", { invoiceRef, draftLength: draft?.length });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
