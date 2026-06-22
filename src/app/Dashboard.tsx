"use client";

import { useState } from "react";
import type { ActionCard, DashboardInsights, Severity } from "@/lib/insights";
import { INDUSTRY_CONFIG, type IndustryDemo } from "@/lib/demo";

const RUNWAY_TONE = (d: number) =>
  d >= 60 ? "text-emerald-600" : d >= 30 ? "text-amber-600" : "text-rose-600";

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

type InvoiceModal = {
  type: "invoice";
  card: ActionCard;
  draft: string;
};
type SupplierModal = {
  type: "supplier";
  card: ActionCard;
  ownerAlert: string;
  supplierEmail: string;
  activeTab: "alert" | "email";
};
type Modal = InvoiceModal | SupplierModal;

export default function Dashboard({
  tenantName,
  insights,
  demoKey,
}: {
  tenantName: string;
  insights: DashboardInsights;
  demoKey?: IndustryDemo;
}) {
  const demo = !!demoKey;
  const demoDrafts = demoKey ? INDUSTRY_CONFIG[demoKey].drafts : {};

  const [index, setIndex] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const cards = insights.cards;
  const current = cards[index];

  async function handleCardAction(card: ActionCard) {
    setLoading(true);
    try {
      if (card.kind === "OVERDUE_INVOICE") {
        let draft: string;
        if (demo && card.invoiceRef && demoDrafts[card.invoiceRef]) {
          await new Promise((r) => setTimeout(r, 350));
          draft = demoDrafts[card.invoiceRef].invoiceReminder!;
        } else {
          const res = await fetch("/api/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "OVERDUE_INVOICE", invoiceRef: card.invoiceRef }),
          });
          ({ draft } = await res.json());
        }
        setModal({ type: "invoice", card, draft });
        setEditing(false);
        setSent(false);
      } else if (card.kind === "PRICE_ALERT") {
        let ownerAlert: string;
        let supplierEmail: string;
        const draftKey = card.supplierToken ?? "";
        if (demo && demoDrafts[draftKey]) {
          await new Promise((r) => setTimeout(r, 450));
          ownerAlert = demoDrafts[draftKey].ownerAlert!;
          supplierEmail = demoDrafts[draftKey].supplierEmail!;
        } else {
          const res = await fetch("/api/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "PRICE_ALERT",
              supplierName: card.supplierName,
              supplierToken: card.supplierToken,
              itemDescription: card.itemDescription,
              oldUnit: card.oldUnit,
              newUnit: card.newUnit,
              changePct: card.changePct,
            }),
          });
          ({ ownerAlert, supplierEmail } = await res.json());
        }
        setModal({ type: "supplier", card, ownerAlert, supplierEmail, activeTab: "alert" });
        setSent(false);
      }
    } finally {
      setLoading(false);
    }
  }

  async function sendInvoiceReminder() {
    if (!modal || modal.type !== "invoice") return;
    setLoading(true);
    try {
      if (!demo) {
        await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceRef: modal.card.invoiceRef, draft: modal.draft }),
        });
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  async function sendSupplierEmail() {
    if (!modal || modal.type !== "supplier") return;
    setLoading(true);
    try {
      if (!demo) {
        await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "supplier", supplierToken: modal.card.supplierToken, draft: modal.supplierEmail }),
        });
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  const actionLabel =
    current?.kind === "OVERDUE_INVOICE"
      ? "Draft reminder"
      : current?.kind === "PRICE_ALERT"
      ? "Draft negotiation"
      : null;

  const industryLabel = demoKey ? INDUSTRY_CONFIG[demoKey].label : null;

  return (
    <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-5 pb-24 pt-10">
      {demo && (
        <div className="mb-5 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <span>Demo · {industryLabel}</span>
          <a href="/" className="font-medium underline">← All demos</a>
        </div>
      )}

      <header className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-slate-500">Guardrail</span>
        <span className="text-xs text-slate-500">{tenantName}</span>
      </header>

      {/* Runway hero */}
      <section className="mt-10 text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-slate-500">
          Days of cash runway
        </p>
        <div className={`mt-2 text-8xl font-black tracking-tight ${RUNWAY_TONE(insights.runwayDays)}`}>
          {insights.runwayDays}
        </div>
        <p className="mt-1 text-xl font-semibold text-slate-700">{insights.runwayLabel}</p>
      </section>

      {/* Card stack */}
      <section className="mt-12">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Action feed
          </h2>
          {cards.length > 0 && (
            <span className="text-xs text-slate-400">
              {index + 1} / {cards.length}
            </span>
          )}
        </div>

        {cards.length === 0 ? (
          <div className="rounded-xl border bg-white p-6 text-center text-slate-500">
            Nothing urgent this morning.
          </div>
        ) : (
          <div>
            <div className={`rounded-2xl border-2 p-5 shadow-sm ${CARD_TONE[current.severity]}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${CARD_DOT[current.severity]}`} />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {current.kind === "OVERDUE_INVOICE" ? "Overdue invoice" : "Price alert"}
                </span>
              </div>
              <h3 className="mt-3 text-xl font-bold text-slate-900">{current.title}</h3>
              <p className="mt-2 leading-relaxed text-slate-700">{current.body}</p>

              {actionLabel && (
                <button
                  onClick={() => handleCardAction(current)}
                  disabled={loading}
                  className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
                >
                  {loading ? "Drafting…" : actionLabel}
                </button>
              )}
            </div>

            <div className="mt-4 flex justify-between">
              <button
                onClick={() => { setIndex((i) => Math.max(0, i - 1)); setSent(false); }}
                disabled={index === 0}
                className="rounded-full border bg-white px-4 py-2 text-sm disabled:opacity-30"
              >
                ← Prev
              </button>
              <div className="flex gap-1.5 items-center">
                {cards.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setIndex(i); setSent(false); }}
                    className={`h-2 w-2 rounded-full transition ${i === index ? "bg-slate-800" : "bg-slate-300"}`}
                  />
                ))}
              </div>
              <button
                onClick={() => { setIndex((i) => Math.min(cards.length - 1, i + 1)); setSent(false); }}
                disabled={index >= cards.length - 1}
                className="rounded-full border bg-white px-4 py-2 text-sm disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Invoice reminder modal */}
      {modal?.type === "invoice" && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/60">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
            <h3 className="text-lg font-bold">Reminder — {modal.card.invoiceRef}</h3>
            <p className="mt-0.5 text-xs text-slate-400">Tone tuned to customer risk profile</p>

            {editing ? (
              <textarea
                value={modal.draft}
                onChange={(e) => setModal({ ...modal, draft: e.target.value })}
                rows={11}
                className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-sm"
              />
            ) : (
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed">
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
                onClick={sendInvoiceReminder}
                disabled={loading || sent}
                className="flex-[1.4] rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
              >
                {sent ? "Sent ✓" : loading ? "Sending…" : "Send via Xero"}
              </button>
            </div>
            <button onClick={() => setModal(null)} className="mt-3 w-full py-2 text-sm text-slate-500">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Supplier negotiation modal */}
      {modal?.type === "supplier" && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/60">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
            <h3 className="text-lg font-bold">
              {modal.card.changePct?.toFixed(1)}% price hike — {modal.card.supplierToken}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400 truncate">"{modal.card.itemDescription}"</p>

            <div className="mt-3 flex rounded-lg border border-slate-200 p-1">
              <button
                onClick={() => setModal({ ...modal, activeTab: "alert" })}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition ${modal.activeTab === "alert" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                Owner alert
              </button>
              <button
                onClick={() => setModal({ ...modal, activeTab: "email" })}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition ${modal.activeTab === "email" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                Supplier email
              </button>
            </div>

            {modal.activeTab === "alert" ? (
              <div className="mt-3 rounded-lg bg-amber-50 p-4 text-sm leading-relaxed text-slate-800">
                {modal.ownerAlert}
              </div>
            ) : (
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed">
                {modal.supplierEmail}
              </pre>
            )}

            {modal.activeTab === "email" && (
              <button
                onClick={sendSupplierEmail}
                disabled={loading || sent}
                className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
              >
                {sent ? "Sent ✓" : loading ? "Sending…" : "Send negotiation email"}
              </button>
            )}
            <button onClick={() => setModal(null)} className="mt-3 w-full py-2 text-sm text-slate-500">
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
