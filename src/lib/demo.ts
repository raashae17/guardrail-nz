import type { DashboardInsights } from "./insights";

export const DEMO_INSIGHTS: DashboardInsights = {
  runwayDays: 42,
  runwayLabel: "Safe",
  cards: [
    {
      severity: "RED",
      kind: "OVERDUE_INVOICE",
      title: "Invoice #2048 is 6 days late",
      body: "Chch Electrical (C_4F2A91B7) owes you $4,500. Tap to nudge.",
      invoiceRef: "2048",
      contactToken: "C_4F2A91B7",
      amount: 4500,
    },
    {
      severity: "ORANGE",
      kind: "PRICE_ALERT",
      title: "Carters raised timber framing 8%",
      body: "Unit cost up from $6.20 to $6.70 since last bill. Gross margin fell to 22%.",
    },
    {
      severity: "ORANGE",
      kind: "OVERDUE_INVOICE",
      title: "Invoice #2051 is 3 days late",
      body: "Northside Plumbing (C_88D311E2) owes you $1,820. Tap to nudge.",
      invoiceRef: "2051",
      contactToken: "C_88D311E2",
      amount: 1820,
    },
  ],
};

export const DEMO_DRAFT = `Subject: Friendly reminder — invoice 2048

Kia ora {{customer_name}},

Just a quick nudge that invoice #2048 for $4,500.00 was due 6 days ago. Could you confirm when we can expect payment? Happy to resend the invoice or chat through any questions.

Ngā mihi,
{{your_name}}`;
