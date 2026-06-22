import { prisma } from "@/lib/db";
import { buildInsights } from "@/lib/insights";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const conn = await prisma.xeroConnection.findFirst().catch(() => null);
  if (!conn) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <h1 className="text-3xl font-bold">Guardrail NZ</h1>
        <p className="mt-2 text-slate-600">Connect your Xero org to see cash health.</p>
        <a
          href="/api/xero/connect"
          className="mt-6 inline-block rounded bg-slate-900 px-4 py-2 text-white"
        >
          Connect Xero
        </a>
      </main>
    );
  }
  const insights = await buildInsights(conn.tenantId);
  return <Dashboard tenantName={conn.tenantName} insights={insights} />;
}
