import { NextRequest, NextResponse } from "next/server";
import { buildIndustryInsights } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

// GET /api/test/pipeline?tenantId=seed-trades-tenant-001
// Runs the full pipeline against seed data — useful before Xero is connected.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !process.env.ENABLE_TEST_ROUTES) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const insights = await buildIndustryInsights(tenantId);
  return NextResponse.json(insights, { status: 200 });
}
