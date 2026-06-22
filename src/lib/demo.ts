import type { DashboardInsights } from "./insights";

export const DEMO_INSIGHTS: DashboardInsights = {
  runwayDays: 42,
  runwayLabel: "Safe",
  cards: [
    {
      severity: "RED",
      kind: "OVERDUE_INVOICE",
      title: "Invoice #2048 is 6 days late",
      body: "Chch Electrical (C_4F2A91B7) owes you $4,500. They typically pay 22 days late — key client. Tap to draft a warm nudge.",
      invoiceRef: "2048",
      contactToken: "C_4F2A91B7",
      contactId: "demo-contact-1",
      amount: 4500,
    },
    {
      severity: "ORANGE",
      kind: "PRICE_ALERT",
      title: "S_43415254 raised timber framing 8%",
      body: '"90×45 H3 Framing" went from $6.20 to $6.70. Tap to draft a negotiation email.',
      supplierName: "Carters Building Supplies",
      supplierToken: "S_43415254",
      itemDescription: "90×45 H3 Framing per LM",
      oldUnit: 6.20,
      newUnit: 6.70,
      changePct: 8.1,
    },
    {
      severity: "ORANGE",
      kind: "OVERDUE_INVOICE",
      title: "Invoice #2051 is 3 days late",
      body: "Northside Plumbing (C_88D311E2) owes you $1,820. Tap to draft a reminder.",
      invoiceRef: "2051",
      contactToken: "C_88D311E2",
      contactId: "demo-contact-2",
      amount: 1820,
    },
  ],
};

export const DEMO_REMINDER = `Subject: Just a quick one — invoice 2048

Hope the week's treating you well!

Just sliding this to the top of your mind — invoice #2048 for $4,500.00 is 6 days overdue. No dramas, just keen to get it sorted when you get a chance.

Cheers,
{{your_name}}`;

export const DEMO_OWNER_ALERT = `Price alert: S_43415254 raised "90×45 H3 Framing per LM" by 8.1% ($6.20 → $6.70). At your current build volumes this adds ~$340/month to COGS. Options: negotiate a bulk rate, lock in a volume commitment, or consider a 4–5% price pass-through on new quotes.`;

export const DEMO_SUPPLIER_EMAIL = `Subject: Following up on recent pricing — 90×45 H3 Framing

Kia ora,

Hope your team's keeping busy! We've noticed the unit price on 90×45 H3 Framing has moved up recently and wanted to reach out before we finalise our next few projects.

We've been buying consistently and would love to keep the relationship strong. Is there a bulk purchase arrangement or volume commitment we could discuss to get closer to the previous rate?

Happy to have a kōrero if that's easier.

Ngā mihi,
{{your_name}}`;
