import { prisma } from "@/lib/db";
import { buildInsights } from "@/lib/insights";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const conn = await prisma.xeroConnection.findFirst().catch(() => null);
  if (!conn) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
        <h1 className="text-4xl font-black tracking-tight">Guardrail</h1>
        <p className="mt-3 text-slate-600">
          Cash health for NZ tradies. One number. Three cards. Zero spreadsheets.
        </p>
        <a
          href="/api/xero/connect"
          className="mt-10 inline-flex items-center justify-center gap-2 rounded-xl bg-[#13B5EA] px-5 py-4 text-base font-semibold text-white shadow-sm"
        >
          Sign in with Xero
        </a>
        <p className="mt-3 text-xs text-slate-400">
          Read-only by default · granular scopes · tokens encrypted at rest
        </p>
      </main>
    );
  }
  const insights = await buildInsights(conn.tenantId);
  return <Dashboard tenantName={conn.tenantName} insights={insights} />;
}
