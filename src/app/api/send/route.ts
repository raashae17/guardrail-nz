import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { invoiceRef, draft } = await req.json();
  // TODO: wire to email provider (Postmark/SES). For MVP: log and acknowledge.
  console.log("[send-reminder]", { invoiceRef, length: draft?.length });
  return NextResponse.json({ ok: true });
}
