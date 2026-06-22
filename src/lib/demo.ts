import type { DashboardInsights } from "./insights";

export type IndustryDemo = "trades" | "hospitality" | "ecommerce";

// ---------------------------------------------------------------------------
// Shared types for demo drafts
// ---------------------------------------------------------------------------
export interface DemoModal {
  type: "invoice" | "supplier";
  invoiceReminder?: string;
  ownerAlert?: string;
  supplierEmail?: string;
}

// ---------------------------------------------------------------------------
// 1. THE TRADES — Builders, Electricians, Plumbers
// ---------------------------------------------------------------------------
export const TRADES_INSIGHTS: DashboardInsights = {
  runwayDays: 28,
  runwayLabel: "Watch",
  cards: [
    {
      severity: "RED",
      kind: "OVERDUE_INVOICE",
      title: "Stage 2 progress payment 8 days overdue",
      body: "C_8F3A12D4 (residential build) owes $18,500 for framing completion. Missing this stops subcontractor pay next Friday.",
      invoiceRef: "PI-047",
      contactToken: "C_8F3A12D4",
      contactId: "demo-trades-1",
      amount: 18500,
    },
    {
      severity: "ORANGE",
      kind: "PRICE_ALERT",
      title: "Copper pricing up 12% — quote exposure",
      body: '"3-core 2.5mm TPS cable" up from $2.18/m to $2.44/m. Job PI-051 quoted 8 weeks ago may now be under-margin.',
      supplierName: "Ideal Electrical Wholesalers",
      supplierToken: "S_49444541",
      itemDescription: "3-core 2.5mm TPS cable per metre",
      oldUnit: 2.18,
      newUnit: 2.44,
      changePct: 11.9,
    },
    {
      severity: "ORANGE",
      kind: "OVERDUE_INVOICE",
      title: "Stage 3 payment 3 days late",
      body: "C_2B91EF77 owes $6,200 for roofing milestone. Good payer historically — a warm nudge should do it.",
      invoiceRef: "PI-044",
      contactToken: "C_2B91EF77",
      contactId: "demo-trades-2",
      amount: 6200,
    },
  ],
};

export const TRADES_DRAFTS: Record<string, DemoModal> = {
  "PI-047": {
    type: "invoice",
    invoiceReminder: `Subject: Stage 2 progress payment — PI-047

Kia ora,

Hope the build's going well from your end! Just a heads-up that progress invoice PI-047 for $18,500 (Stage 2 — framing completion) is now 8 days past its due date.

We've got subbies to pay at the end of the week, so if you could flick this across ASAP we'd really appreciate it. Happy to resend the invoice or have a quick yarn if anything's unclear.

Cheers,
{{your_name}}`,
  },
  "PI-044": {
    type: "invoice",
    invoiceReminder: `Subject: Quick one — Stage 3 invoice PI-044

Hey,

Hope the week's treating you well! Just a gentle nudge that invoice PI-044 for $6,200 (roofing milestone) slipped past due 3 days ago.

No dramas — just sliding it to the top of your inbox. Flick us through payment when you get a chance.

Cheers,
{{your_name}}`,
  },
  "S_49444541": {
    type: "supplier",
    ownerAlert: `Heads up: 3-core 2.5mm TPS cable is up 11.9% ($2.18 → $2.44/m) from S_49444541. Job PI-051 was quoted 8 weeks ago using the old rate. At 400m estimated, that's a $104 margin hit on that job alone. Options: (1) Re-quote PI-051 with a materials variation clause, (2) negotiate a volume rate with the wholesaler, (3) source from an alternate supplier and compare.`,
    supplierEmail: `Subject: Checking in on cable pricing

Kia ora,

Hope your team's flat out in a good way! We've been a consistent buyer of 3-core 2.5mm TPS cable and noticed the unit price has moved up around 12% recently.

We've got a couple of decent-sized residential jobs coming up and would love to lock in volume pricing if that's something your team can work with. Would a bulk order commitment help get us back closer to the previous rate?

Happy to have a kōrero — give us a call or flick back an email.

Ngā mihi,
{{your_name}}`,
  },
};

// ---------------------------------------------------------------------------
// 2. HOSPITALITY & FOOD PRODUCTION — Cafes, Restaurants, Catering
// ---------------------------------------------------------------------------
export const HOSPITALITY_INSIGHTS: DashboardInsights = {
  runwayDays: 19,
  runwayLabel: "Tight",
  cards: [
    {
      severity: "ORANGE",
      kind: "PRICE_ALERT",
      title: "Dairy costs up 6% — flat white margin squeezed",
      body: '"Homogenised whole milk 10L" up from $14.20 to $15.05. To hold 70% gross margin, your flat white needs to go up $0.35.',
      supplierName: "Meadowfresh Foodservice",
      supplierToken: "S_4D454144",
      itemDescription: "Homogenised whole milk 10L",
      oldUnit: 14.20,
      newUnit: 15.05,
      changePct: 5.99,
    },
    {
      severity: "RED",
      kind: "OVERDUE_INVOICE",
      title: "Weekly supplier invoice 5 days overdue",
      body: "C_F1A3309C (catering client) owes $2,840 from last Friday's event. Cash is tight — this needs to move today.",
      invoiceRef: "CAT-112",
      contactToken: "C_F1A3309C",
      contactId: "demo-hosp-1",
      amount: 2840,
    },
    {
      severity: "ORANGE",
      kind: "PRICE_ALERT",
      title: "Coffee beans up 8% from roaster",
      body: '"Single origin espresso blend 1kg" up from $28.50 to $30.78. At 40 bags/month, that\'s $91 extra COGS monthly.',
      supplierName: "Flight Coffee Roasters",
      supplierToken: "S_464C4947",
      itemDescription: "Single origin espresso blend 1kg",
      oldUnit: 28.50,
      newUnit: 30.78,
      changePct: 8.0,
    },
  ],
};

export const HOSPITALITY_DRAFTS: Record<string, DemoModal> = {
  "CAT-112": {
    type: "invoice",
    invoiceReminder: `Subject: Invoice CAT-112 — payment due

Kia ora,

Thanks again for having us cater your event last week — really glad it all went smoothly!

Just a quick one: invoice CAT-112 for $2,840 is sitting 5 days overdue. We'd love to get this one sorted today if possible — our supplier payments are due this week.

Feel free to call if you'd like to chat through anything.

Ngā mihi,
{{your_name}}`,
  },
  "S_4D454144": {
    type: "supplier",
    ownerAlert: `Dairy alert: Homogenised whole milk 10L is up 6% ($14.20 → $15.05) from S_4D454144. At your current volume, this adds ~$170/month to COGS. To maintain your 70% gross margin on beverages, your flat white price needs to increase by $0.35 (from $5.50 to $5.85). Options: (1) update menu pricing this week, (2) negotiate a fixed 3-month dairy rate with your supplier, (3) trial an alternate supplier and run a blind taste test.`,
    supplierEmail: `Subject: Dairy pricing — can we lock in a rate?

Kia ora,

We buy consistently every week and noticed our milk pricing has crept up about 6% recently. With food costs as tight as they are across the industry right now, it's starting to bite.

Is there a fixed monthly rate or volume commitment we could set up to get some pricing stability? Even locking in the previous rate for 3 months would really help us plan.

Happy to chat — we value the relationship and want to keep buying local.

Ngā mihi,
{{your_name}}`,
  },
  "S_464C4947": {
    type: "supplier",
    ownerAlert: `Coffee cost alert: "Single origin espresso blend 1kg" is up 8% ($28.50 → $30.78) from S_464C4947. At 40 bags/month that's an extra $91/month in COGS. Options: (1) absorb for now and review in 60 days, (2) trial a lower-cost house blend for batch brew while keeping the premium blend for espresso, (3) negotiate a roaster loyalty rate.`,
    supplierEmail: `Subject: Espresso blend pricing — long-term customer query

Kia ora team,

We've been buying your espresso blend for over two years now and our customers love it. We've noticed the per-kg price has moved up around 8% recently and wanted to reach out before we made any changes.

Is there a loyalty rate or larger-volume order option we could discuss? We'd rather keep our current supplier and work something out than start trialling alternatives.

Cheers,
{{your_name}}`,
  },
};

// ---------------------------------------------------------------------------
// 3. INDEPENDENT E-COMMERCE & RETAIL — NZ Brands, Importers
// ---------------------------------------------------------------------------
export const ECOMMERCE_INSIGHTS: DashboardInsights = {
  runwayDays: 34,
  runwayLabel: "Watch",
  cards: [
    {
      severity: "RED",
      kind: "PRICE_ALERT",
      title: "Freight spiked 34% on last container",
      body: '"FCL 20ft Auckland port" up from $3,200 to $4,290. Landed cost on your next PO is $1,090 higher than budgeted.',
      supplierName: "Pacific Freight Solutions",
      supplierToken: "S_50414346",
      itemDescription: "FCL 20ft container — Auckland port",
      oldUnit: 3200,
      newUnit: 4290,
      changePct: 34.1,
    },
    {
      severity: "ORANGE",
      kind: "PRICE_ALERT",
      title: "NZD/USD shift adding 11% to landed cost",
      body: '"USD customs & duties" line items up from avg $880 to $977 per shipment. Margin on imported SKUs compressed.',
      supplierName: "NZ Customs Clearance Ltd",
      supplierToken: "S_4E5A4355",
      itemDescription: "USD customs & duties per shipment",
      oldUnit: 880,
      newUnit: 977,
      changePct: 11.0,
    },
    {
      severity: "ORANGE",
      kind: "OVERDUE_INVOICE",
      title: "Stockist invoice 12 days overdue",
      body: "C_3D8812FA (retail stockist) owes $3,200 for last month's wholesale order. Net-30 terms have lapsed.",
      invoiceRef: "WHL-089",
      contactToken: "C_3D8812FA",
      contactId: "demo-ecom-1",
      amount: 3200,
    },
  ],
};

export const ECOMMERCE_DRAFTS: Record<string, DemoModal> = {
  "WHL-089": {
    type: "invoice",
    invoiceReminder: `Subject: Wholesale invoice WHL-089 — 12 days overdue

Hi,

Hope the store's been busy! Just following up on wholesale invoice WHL-089 for $3,200 — our net-30 terms lapsed 12 days ago and we haven't seen payment come through yet.

Could you let us know when we can expect this one? We're happy to set up automatic payment terms for future orders if that'd make things easier.

Thanks,
{{your_name}}`,
  },
  "S_50414346": {
    type: "supplier",
    ownerAlert: `Freight spike: FCL 20ft Auckland port is up 34.1% ($3,200 → $4,290) from S_50414346. Your next container PO lands $1,090 over budget. Options: (1) split the shipment across two LCL consignments if volume allows (may be cheaper), (2) get competing quotes from 2–3 NZ-licensed forwarders, (3) renegotiate your supplier FOB terms so they absorb more freight risk, (4) build a freight surcharge into your wholesale price sheet for orders under a minimum quantity.`,
    supplierEmail: `Subject: FCL freight rates — requesting a review

Kia ora,

We've been shipping regularly through your team and have noticed the FCL 20ft rate to Auckland has increased around 34% on our most recent invoice. With container rates fluctuating globally, we understand the pressure — but it's significantly impacting our landed costs.

Could we have a conversation about options? We're open to discussing volume commitments, alternative routing, or LCL consolidation if it helps bring costs down. We'd like to keep using your service and work through this together.

Ngā mihi,
{{your_name}}`,
  },
  "S_4E5A4355": {
    type: "supplier",
    ownerAlert: `Currency impact: USD customs & duties per shipment are up 11% ($880 → $977) driven by NZD/USD movement. At 3 shipments/month that's ~$291 extra COGS monthly. Options: (1) review your wholesale price list — a 5–8% adjustment on imported SKUs would recover this, (2) ask your bank or broker about a forward FX contract to lock in today's rate for 3–6 months, (3) explore local manufacturing or closer-origin suppliers to reduce USD exposure.`,
    supplierEmail: `Subject: Customs cost review — NZD/USD impact

Kia ora,

We've noticed our USD-denominated customs and duties costs per shipment have increased around 11% over the past 6 months — largely driven by the exchange rate shift.

Is there anything your team can do to help us optimise the customs classification or consolidate shipments to reduce per-unit duty costs? We're also keen to understand whether there are bonded warehouse options that could help us manage the timing of duty payments.

Happy to set up a call.

Ngā mihi,
{{your_name}}`,
  },
};

// ---------------------------------------------------------------------------
// Industry config map
// ---------------------------------------------------------------------------
export const INDUSTRY_CONFIG: Record<
  IndustryDemo,
  {
    label: string;
    emoji: string;
    tagline: string;
    tenantName: string;
    insights: DashboardInsights;
    drafts: Record<string, DemoModal>;
  }
> = {
  trades: {
    label: "The Trades",
    emoji: "🔨",
    tagline: "Builders, Electricians & Plumbers",
    tenantName: "Kiwi Build Co Ltd",
    insights: TRADES_INSIGHTS,
    drafts: TRADES_DRAFTS,
  },
  hospitality: {
    label: "Hospitality",
    emoji: "☕",
    tagline: "Cafes, Restaurants & Catering",
    tenantName: "Aroha Café & Catering",
    insights: HOSPITALITY_INSIGHTS,
    drafts: HOSPITALITY_DRAFTS,
  },
  ecommerce: {
    label: "E-commerce & Retail",
    emoji: "📦",
    tagline: "NZ Brands & Importers",
    tenantName: "Tūhoe Trading Co",
    insights: ECOMMERCE_INSIGHTS,
    drafts: ECOMMERCE_DRAFTS,
  },
};
