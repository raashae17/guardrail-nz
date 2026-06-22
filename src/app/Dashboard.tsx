"use client";

import { useState } from "react";
import type { ActionCard, DashboardInsights, Severity } from "@/lib/insights";
import { DEMO_DRAFT } from "@/lib/demo";

const RUNWAY_TONE = (days: number) =>
  days >= 60 ? "text-emerald-600" : days >= 30 ? "text-amber-600" : "text-rose-600";

const CARD_TONE: Record<Severity, string> = {
  RED: "border-rose-300 bg-rose-50",
  ORANGE: "border-amber-300 bg-amber-50",
  GREEN: "border-emerald-300 bg-emerald-50",
};

const CARD_DOT: Record<Severity, string> = {
  RED: "bg-rose-500",
  ORANGE: "bg-amber-500",
  GREEN: "bg-emerald-500",
};

export default function Dashboard({
  tenantName,
  insights,
  demo = false,
}: {
  tenantName: string;
  insights: DashboardInsights;
  demo?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [modal, setModal] = useState<{ card: ActionCard; draft: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const cards = insights.cards;
  const current = cards[index];

  async function openDraft(card: ActionCard) {
    if (!card.invoiceRef) return;
    setLoading(true);
    try {
      if (demo) {
        await new Promise((r) => setTimeout(r, 400));
        setModal({ card, draft: DEMO_DRAFT });
      } else {
        const res = await fetch("/api/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceRef: card.invoiceRef }),
        });
        const { draft } = await res.json();
        setModal({ card, draft });
      }
      setEditing(false);
      setSent(false);
    } finally {
      setLoading(false);
    }
  }

  async function sendViaXero() {
    if (!modal) return;
    setLoading(true);
    try {
      if (demo) {
        await new Promise((r) => setTimeout(r, 600));
      } else {
        await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceRef: modal.card.invoiceRef, draft: modal.draft }),
        });
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-5 pb-24 pt-10">
      <header className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-slate-500">Guardrail</span>
        <span className="text-xs text-slate-500">{tenantName}</span>
      </header>

      <section className="mt-10 text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-slate-500">
          Days of cash runway
        </p>
        <div className={`mt-2 text-7xl font-black tracking-tight ${RUNWAY_TONE(insights.runwayDays)}`}>
          {insights.runwayDays}
        </div>
        <p className="mt-1 text-lg font-semibold text-slate-700">{insights.runwayLabel}</p>
      </section>

      <section className="mt-12">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Action feed
          </h2>
          {cards.length > 0 && (
            <span className="text-xs text-slate-400">
              {Math.min(index + 1, cards.length)} / {cards.length}
            </span>
          )}
        </div>

        {cards.length === 0 ? (
          <div className="rounded-xl border bg-white p-6 text-center text-slate-500">
            Nothing urgent this morning.
          </div>
        ) : (
          <div className="relative">
            <div className={`rounded-2xl border-2 p-5 shadow-sm ${CARD_TONE[current.severity]}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${CARD_DOT[current.severity]}`} />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {current.kind.replace("_", " ")}
                </span>
              </div>
              <h3 className="mt-3 text-xl font-bold text-slate-900">{current.title}</h3>
              <p className="mt-2 text-slate-700">{current.body}</p>

              {current.kind === "OVERDUE_INVOICE" && current.invoiceRef && (
                <button
                  onClick={() => openDraft(current)}
                  disabled={loading}
                  className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
                >
                  {loading ? "Drafting…" : "Draft reminder"}
                </button>
              )}
            </div>

            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="rounded-full border bg-white px-4 py-2 text-sm disabled:opacity-30"
              >
                ← Prev
              </button>
              <button
                onClick={() => setIndex((i) => Math.min(cards.length - 1, i + 1))}
                disabled={index >= cards.length - 1}
                className="rounded-full border bg-white px-4 py-2 text-sm disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </section>

      {modal && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/60">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
            <h3 className="text-lg font-bold">
              Reminder — {modal.card.invoiceRef}
            </h3>

            {editing ? (
              <textarea
                value={modal.draft}
                onChange={(e) => setModal({ ...modal, draft: e.target.value })}
                rows={12}
                className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-sm"
              />
            ) : (
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">
                {modal.draft}
              </pre>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setEditing((e) => !e)}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-base font-semibold text-slate-700"
              >
                {editing ? "Done" : "Edit text"}
              </button>
              <button
                onClick={sendViaXero}
                disabled={loading || sent}
                className="flex-[1.4] rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
              >
                {sent ? "Sent ✓" : loading ? "Sending…" : "Send Reminder via Xero"}
              </button>
            </div>

            <button
              onClick={() => setModal(null)}
              className="mt-3 w-full py-2 text-sm text-slate-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
