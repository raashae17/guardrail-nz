import { prisma } from "@/lib/db";
import { buildInsights } from "@/lib/insights";
import { INDUSTRY_CONFIG, type IndustryDemo } from "@/lib/demo";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";

const VALID_DEMOS: IndustryDemo[] = ["trades", "hospitality", "ecommerce"];

export default async function Page({
  searchParams,
}: {
  searchParams: { demo?: string };
}) {
  const demoKey = searchParams.demo as IndustryDemo | undefined;
  if (demoKey && VALID_DEMOS.includes(demoKey)) {
    const cfg = INDUSTRY_CONFIG[demoKey];
    return (
      <Dashboard
        tenantName={cfg.tenantName}
        insights={cfg.insights}
        demoKey={demoKey}
      />
    );
  }

  const conn = await prisma.xeroConnection.findFirst().catch(() => null);
  if (!conn) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <h1 className="text-center text-4xl font-black tracking-tight">Guardrail</h1>
        <p className="mt-3 text-center text-slate-600">
          Cash health for NZ business. One number. Three cards. Zero spreadsheets.
        </p>

        <a
          href="/api/xero/connect"
          className="mt-10 inline-flex items-center justify-center gap-2 rounded-xl bg-[#13B5EA] px-5 py-4 text-base font-semibold text-white shadow-sm"
        >
          Sign in with Xero
        </a>

        <div className="mt-10">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
            Try a live demo
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {VALID_DEMOS.map((key) => {
              const cfg = INDUSTRY_CONFIG[key];
              return (
                <a
                  key={key}
                  href={`/?demo=${key}`}
                  className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-slate-400"
                >
                  <span className="text-3xl">{cfg.emoji}</span>
                  <div>
                    <p className="font-semibold text-slate-900">{cfg.label}</p>
                    <p className="text-sm text-slate-500">{cfg.tagline}</p>
                  </div>
                  <span className="ml-auto text-slate-400">→</span>
                </a>
              );
            })}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          Read-only by default · granular scopes · tokens encrypted at rest
        </p>
      </main>
    );
  }

  const insights = await buildInsights(conn.tenantId);
  return <Dashboard tenantName={conn.tenantName} insights={insights} />;
}
