# Guardrail NZ

Cash-health MVP for NZ tradies running on Xero. Mobile-first: one rolling
"Days of cash runway" number and up to 3 swipeable Claude-generated action
cards (overdue invoices, supplier price alerts).

## Stack
- Next.js 14 App Router, Tailwind
- Prisma + PostgreSQL (cached Xero data)
- Xero OAuth 2.0 (Authorization Code + PKCE)
- Anthropic Claude SDK for insight + email drafting

## Setup

```bash
cp .env.example .env   # fill values
# Generate a 32-byte key:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

npm install
npm run prisma:migrate
npm run dev
```

Then visit http://localhost:3000 and click **Connect Xero**.

## Architecture

- `src/app/api/xero/connect` and `/callback` — PKCE OAuth flow; tokens stored AES-256-GCM encrypted in `XeroConnection`.
- `src/app/api/cron/sync` — protected by `CRON_SECRET`; scheduled daily via `vercel.json`. Calls `/Invoices`, `/BankTransactions`, `/Contacts`.
- `src/lib/anonymize.ts` — contact names replaced with deterministic `C_XXXXXXXX` tokens before any LLM call.
- `src/lib/insights.ts` — builds traffic-light health + up to 3 action items; falls back to deterministic logic if no `ANTHROPIC_API_KEY`.
- `src/app/api/draft` + `/send` — generate and (stub) dispatch reminder emails.

## Granular Xero scopes (2026 marketplace rules)
- `accounting.transactions.read` — invoices, bank txns, bills
- `accounting.contacts.read` — client/supplier histories
- `accounting.transactions` — only for native "Send Reminder via Xero"
- `openid profile email offline_access` — Sign In with Xero + refresh

## Daily pipeline
`vercel.json` schedules `POST /api/cron/sync` at 17:00 UTC (≈ 5 AM NZST).
The job pulls `/Contacts`, `/Invoices` (ACCREC + ACCPAY for bills), and
`/BankTransactions`, then upserts into Postgres. Insights are recomputed
on dashboard load against the cached tables — never raw Xero responses
hit the LLM.

## Privacy
Contact names → deterministic `C_XXXXXXXX` tokens. Suppliers → `S_XXXXXXXX`.
Address fragments in bill line descriptions are stripped via regex before
being sent to Claude. Tokens are AES-256-GCM encrypted at rest.
