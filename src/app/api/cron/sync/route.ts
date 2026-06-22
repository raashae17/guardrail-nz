import { NextRequest, NextResponse } from "next/server";
import { syncAll } from "@/lib/sync";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await syncAll();
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
