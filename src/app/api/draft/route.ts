import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
import { draftReminderEmail } from "@/lib/insights";

export async function POST(req: NextRequest) {
  const { invoiceRef } = await req.json();
  if (!invoiceRef) return NextResponse.json({ error: "invoiceRef required" }, { status: 400 });
  const conn = await prisma.xeroConnection.findFirst();
  if (!conn) return NextResponse.json({ error: "Not connected" }, { status: 400 });
  const draft = await draftReminderEmail(conn.tenantId, invoiceRef);
  return NextResponse.json({ draft });
}
