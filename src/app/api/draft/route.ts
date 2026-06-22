import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { draftReminderEmail, draftSupplierNegotiation } from "@/lib/insights";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const conn = await prisma.xeroConnection.findFirst();
  if (!conn) return NextResponse.json({ error: "Not connected" }, { status: 400 });

  // Supplier negotiation draft
  if (body.kind === "PRICE_ALERT") {
    const { supplierName, supplierToken, itemDescription, oldUnit, newUnit, changePct } = body;
    if (!supplierToken) return NextResponse.json({ error: "supplierToken required" }, { status: 400 });
    const result = await draftSupplierNegotiation({ supplierName, supplierToken, itemDescription, oldUnit, newUnit, changePct });
    return NextResponse.json(result);
  }

  // Invoice reminder draft
  const { invoiceRef } = body;
  if (!invoiceRef) return NextResponse.json({ error: "invoiceRef required" }, { status: 400 });
  const draft = await draftReminderEmail(conn.tenantId, invoiceRef);
  return NextResponse.json({ draft });
}
