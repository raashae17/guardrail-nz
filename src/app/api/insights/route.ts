import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildInsights } from "@/lib/insights";

export async function GET() {
  const conn = await prisma.xeroConnection.findFirst();
  if (!conn) return NextResponse.json({ connected: false });
  const insights = await buildInsights(conn.tenantId);
  return NextResponse.json({ connected: true, tenantName: conn.tenantName, ...insights });
}
