import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
import { encrypt } from "@/lib/crypto";
import { exchangeCode, listConnections } from "@/lib/xero-oauth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return NextResponse.json({ error: "Missing code/state" }, { status: 400 });

  const row = await prisma.oAuthState.findUnique({ where: { state } });
  if (!row) return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  await prisma.oAuthState.delete({ where: { state } });

  const tokens = await exchangeCode(code, row.codeVerifier);
  const connections = await listConnections(tokens.access_token);
  if (connections.length === 0) return NextResponse.json({ error: "No tenants" }, { status: 400 });

  for (const c of connections) {
    await prisma.xeroConnection.upsert({
      where: { tenantId: c.tenantId },
      create: {
        tenantId: c.tenantId,
        tenantName: c.tenantName,
        encryptedAccess: encrypt(tokens.access_token),
        encryptedRefresh: encrypt(tokens.refresh_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        tenantName: c.tenantName,
        encryptedAccess: encrypt(tokens.access_token),
        encryptedRefresh: encrypt(tokens.refresh_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
  }

  return NextResponse.redirect(new URL("/", req.url));
}
