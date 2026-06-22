# Guardrail NZ

Cash-health MVP for NZ SMBs running on Xero.

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

## Notes
- The email send route currently logs only; wire to Postmark/SES before production.
- Token refresh is automatic on Xero API call expiry.
