import { createHash, randomBytes } from "crypto";

const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";

export function generatePkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(state: string, challenge: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID!,
    redirect_uri: process.env.XERO_REDIRECT_URI!,
    scope: process.env.XERO_SCOPES!,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params}`;
}

export interface XeroTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export async function exchangeCode(code: string, verifier: string): Promise<XeroTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.XERO_CLIENT_ID!,
    code,
    redirect_uri: process.env.XERO_REDIRECT_URI!,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Xero token exchange failed: ${res.status}`);
  return res.json();
}

export async function refreshTokens(refreshToken: string): Promise<XeroTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.XERO_CLIENT_ID!,
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Xero refresh failed: ${res.status}`);
  return res.json();
}

export async function listConnections(accessToken: string) {
  const res = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Connections fetch failed: ${res.status}`);
  return res.json() as Promise<Array<{ tenantId: string; tenantName: string }>>;
}
