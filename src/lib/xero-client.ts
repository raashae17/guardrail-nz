import { prisma } from "./db";
import { decrypt, encrypt } from "./crypto";
import { refreshTokens } from "./xero-oauth";

const API = "https://api.xero.com/api.xro/2.0";

async function getValidAccessToken(tenantId: string): Promise<string> {
  const conn = await prisma.xeroConnection.findUnique({ where: { tenantId } });
  if (!conn) throw new Error(`No connection for tenant ${tenantId}`);
  if (conn.expiresAt.getTime() > Date.now() + 60_000) {
    return decrypt(conn.encryptedAccess);
  }
  const refreshed = await refreshTokens(decrypt(conn.encryptedRefresh));
  await prisma.xeroConnection.update({
    where: { tenantId },
    data: {
      encryptedAccess: encrypt(refreshed.access_token),
      encryptedRefresh: encrypt(refreshed.refresh_token),
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    },
  });
  return refreshed.access_token;
}

export async function xeroGet<T = unknown>(tenantId: string, path: string): Promise<T> {
  const token = await getValidAccessToken(tenantId);
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Xero ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}
