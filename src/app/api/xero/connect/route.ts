import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { buildAuthorizeUrl, generatePkce } from "@/lib/xero-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const { verifier, challenge } = generatePkce();
  await prisma.oAuthState.create({ data: { state, codeVerifier: verifier } });
  return NextResponse.redirect(buildAuthorizeUrl(state, challenge));
}
