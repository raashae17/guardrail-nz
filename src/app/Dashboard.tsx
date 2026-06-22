"use client";

import { useState } from "react";
import type { ActionItem, DashboardInsights, Health } from "@/lib/insights";

const HEALTH_STYLES: Record<Health, string> = {
  GREEN: "bg-emerald-500",
  ORANGE: "bg-amber-500",
  RED: "bg-rose-500",
};

const HEALTH_LABEL: Record<Health, string> = {
  GREEN: "Healthy",
  ORANGE: "Watch",
  RED: "Action needed",
};

export default function Dashboard({
  tenantName,
  insights,
}: {
  tenantName: string;
  insights: DashboardInsights;
}) {
  const [modal, setModal] = useState<{ invoiceRef: string; draft: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function openDraft(item: ActionItem) {
    if (!item.invoiceRef) return;
    setLoading(item.invoiceRef);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceRef: item.invoiceRef }),
      });
      const { draft } = await res.json();
      setModal({ invoiceRef: item.invoiceRef, draft });
      setSent(false);
    } finally {
      setLoading(null);
    }
  }

  async function send() {
    if (!modal) return;
    await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(modal),
    });
    setSent(true);
  }

  return (
    <main className="mx-auto max-w-3xl p-10">
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Guardrail NZ</h1>
        <span className="text-sm text-slate-500">{tenantName}</span>
      </header>

      <section className="mt-8 rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Current cash health
        </h2>
        <div className="mt-3 flex items-center gap-3">
          <span className={`inline-block h-4 w-4 rounded-full ${HEALTH_STYLES[insights.health]}`} />
          <span className="text-2xl font-semibold">{HEALTH_LABEL[insights.health]}</span>
        </div>
      </section>

      <section className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Action items</h2>
        <ul className="mt-4 divide-y">
          {insights.actionItems.length === 0 && (
            <li className="py-3 text-slate-500">Nothing urgent right now.</li>
          )}
          {insights.actionItems.map((item, i) => (
            <li key={i} className="flex items-center justify-between py-3">
              <span>{item.message}</span>
              {item.kind === "OVERDUE_INVOICE" && item.invoiceRef && (
                <button
                  onClick={() => openDraft(item)}
                  disabled={loading === item.invoiceRef}
                  className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  {loading === item.invoiceRef ? "Drafting…" : "Draft reminder"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {modal && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Reminder draft — {modal.invoiceRef}</h3>
            <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">
              {modal.draft}
            </pre>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setModal(null)}
                className="rounded border px-3 py-1.5 text-sm"
              >
                Close
              </button>
              <button
                onClick={send}
                disabled={sent}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {sent ? "Sent" : "Send reminder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
