// Business case model. Transparent on purpose: every input is listed with its kind
// (sourced / measured / assumption) and, where sourced, a link. Pure functions, unit-tested.
import type { Mix, Metrics } from "./quality";

export type Kind = "sourced" | "measured" | "assumption";

export interface Source {
  id: string;
  title: string;
  url: string;
  note: string;
}

export const SOURCES: Source[] = [
  {
    id: "gdv-glass",
    title: "GDV via web.de: Glasbruch an kaskoversicherten Autos",
    url: "https://web.de/magazine/auto/windschutzscheiben-bremsleuchten-glasbruch-autos-teuer-41560612",
    note: "About 2.2 million glass claims on comprehensively insured cars cost insurers almost €2 bn: roughly €900 per claim. This high-volume, low-value segment is what rules-based triage targets.",
  },
  {
    id: "gdv-fraud",
    title: "GDV via cash-online: rund zehn Prozent aller Schadenmeldungen verdächtig",
    url: "https://www.cash-online.de/a/5-milliarden-euro-schaeden-durch-versicherungsbetrug-671526/",
    note: "About 10% of claim reports are suspicious and worth checking; about 2.7% of the checked cases turn out to be fraud.",
  },
  {
    id: "fnol-time",
    title: "SwiftCase: FNOL automation for UK insurers",
    url: "https://swiftcase.co.uk/2026/03/02/fnol-automation-guide/",
    note: "A single motor first notice of loss takes fifteen to twenty minutes of handler time when done by hand.",
  },
  {
    id: "gdv-wild",
    title: "GDV via cash-online: Wildunfälle kosten Kfz-Versicherer 2024 über eine Milliarde Euro",
    url: "https://www.cash-online.de/a/gdv-wildunfaelle-kosten-kfz-versicherer-2024-ueber-eine-milliarde-euro-704149/",
    note: "Average own-damage (Kasko) claim for wildlife collisions rose to €4,100 in 2024.",
  },
  {
    id: "gehalt",
    title: "gehalt.de: Gehaltsspanne Schadensachbearbeiter/-in",
    url: "https://www.gehalt.de/beruf/schadensachbearbeiter",
    note: "Median gross salary of a claims handler in Germany: €5,177 per month (40 h).",
  },
  {
    id: "stepstone",
    title: "StepStone: Sachbearbeiter/in Schadenmanagement Gehälter",
    url: "https://www.stepstone.de/gehalt/Sachbearbeiter-in-Schadenmanagement.html",
    note: "Claims-management clerks: roughly €40k–58k per year depending on city.",
  },
  {
    id: "mckinsey",
    title: "McKinsey: Claims management (Women in Insurance series)",
    url: "https://www.mckinsey.com/industries/financial-services/our-insights/insurance/women-in-insurance-leading-voices-on-trends-affecting-insurers/claims-management-with-samantha-prymaka",
    note: "Potential 25–30% lower loss adjustment expenses and 3–5 pp lower indemnity spend.",
  },
  {
    id: "gdv-loss",
    title: "GDV via AUTOHAUS: Kfz-Versicherung mit 2,9 Mrd. Euro Verlust",
    url: "https://www.autohaus.de/nachrichten/schadenbusiness/kfz-versicherung-gdv-spricht-jetzt-auch-offiziell-von-2-9-mrd-euro-verlust-3475693",
    note: "German motor insurers lost about €2.9 bn in 2023; each premium euro cost €1.10.",
  },
  {
    id: "gdv-policies",
    title: "GDV via tarifcheck: Top-10 Versicherungen in Deutschland 2024",
    url: "https://www.tarifcheck.de/haftpflichtversicherung/die-top-10-versicherungen-in-deutschland-934563",
    note: "29.2 million comprehensive (Vollkasko) motor policies in Germany.",
  },
  {
    id: "leaseplan",
    title: "Ayvens/LeasePlan Deutschland: Versicherungsbilanz 2024",
    url: "https://www.ayvens.com/de-de/ueber-uns/presse/presseinformationen/presseinfos-2025/versicherungsbilanz/",
    note: "One fleet provider alone handled over 57,000 motor claims in Germany in 2024 (scale anchor).",
  },
  {
    id: "leakage",
    title: "Lorikeet: Claims leakage (industry estimate)",
    url: "https://www.lorikeetcx.ai/glossary/claims-leakage",
    note: "Industry estimates put claims leakage at 5–10% of total claims spend for average performers.",
  },
];

export interface Assumption {
  key: AssumptionKey;
  label: string;
  value: number;
  unit: string;
  kind: Kind;
  source?: string; // SOURCES id
  note: string;
  min: number;
  max: number;
  step: number;
  group: "Volume & people" | "Handling time" | "Costs of errors" | "System" | "Policy change";
}

export type AssumptionKey =
  | "claimsPerYear"
  | "salary"
  | "loadFactor"
  | "productiveHours"
  | "triageMinToday"
  | "reviewMin"
  | "infoMin"
  | "checkMin"
  | "avgClaim"
  | "overpayShare"
  | "platformPerYear"
  | "implementation"
  | "changeWeeksToday"
  | "changePersonDays"
  | "dayRate"
  | "changeHoursWithSystem";

export const DEFAULT_ASSUMPTIONS: Assumption[] = [
  {
    key: "claimsPerYear",
    label: "Small own-damage claims per year",
    value: 100000,
    unit: "claims",
    kind: "assumption",
    source: "leaseplan",
    note: "In scope: glass, parking and minor bodywork claims of a mid-sized insurer (2–3% market share). Anchors: German insurers pay about 2.2 million glass claims a year; one fleet provider alone handles 57k claims.",
    min: 10000,
    max: 500000,
    step: 5000,
    group: "Volume & people",
  },
  {
    key: "salary",
    label: "Claims handler gross salary",
    value: 55000,
    unit: "€/year",
    kind: "sourced",
    source: "gehalt",
    note: "German median ~€62k (gehalt.de), €40–58k (StepStone); we use the middle.",
    min: 35000,
    max: 90000,
    step: 1000,
    group: "Volume & people",
  },
  {
    key: "loadFactor",
    label: "Employer load (social charges, workplace)",
    value: 1.3,
    unit: "×",
    kind: "assumption",
    note: "Typical German employer cost on top of gross salary.",
    min: 1,
    max: 1.8,
    step: 0.05,
    group: "Volume & people",
  },
  {
    key: "productiveHours",
    label: "Productive hours per handler",
    value: 1600,
    unit: "h/year",
    kind: "assumption",
    note: "After holidays, sickness, training and meetings.",
    min: 1200,
    max: 1900,
    step: 50,
    group: "Volume & people",
  },
  {
    key: "triageMinToday",
    label: "Manual triage time per claim today",
    value: 15,
    unit: "min",
    kind: "sourced",
    source: "fnol-time",
    note: "Read form, quote and evidence; check policy; decide next step. Industry: 15–20 min per motor FNOL by hand; we take the low end.",
    min: 3,
    max: 45,
    step: 1,
    group: "Handling time",
  },
  {
    key: "reviewMin",
    label: "Reviewer time per escalated claim",
    value: 15,
    unit: "min",
    kind: "assumption",
    note: "Escalated claims still get a full human look.",
    min: 3,
    max: 60,
    step: 1,
    group: "Handling time",
  },
  {
    key: "infoMin",
    label: "Time per information request",
    value: 2,
    unit: "min",
    kind: "assumption",
    note: "Templated email is sent automatically; the reply is re-checked automatically.",
    min: 0,
    max: 15,
    step: 1,
    group: "Handling time",
  },
  {
    key: "checkMin",
    label: "Time per second check",
    value: 8,
    unit: "min",
    kind: "assumption",
    note: "Confirm an auto-processed decision.",
    min: 1,
    max: 30,
    step: 1,
    group: "Handling time",
  },
  {
    key: "avgClaim",
    label: "Average claim that needed a person",
    value: 1100,
    unit: "€",
    kind: "measured",
    source: "gdv-glass",
    note: "Average quote of the claims sent to a person under v2 in the 500-claim set (€1,094). Fits the segment: GDV glass claims average about €900. (Large own-damage claims average €4,000+, but those always go to a person anyway.)",
    min: 300,
    max: 6000,
    step: 100,
    group: "Costs of errors",
  },
  {
    key: "overpayShare",
    label: "Avoidable loss when a claim that needed a person goes routine",
    value: 0.25,
    unit: "of claim",
    kind: "assumption",
    source: "gdv-fraud",
    note: "Blend: a duplicate, an expired policy or a non-covered claim is a full loss; an inflated quote is a partial one. GDV: about 10% of claim reports are suspicious. Industry leakage overall is 5–10% of spend.",
    min: 0.02,
    max: 0.6,
    step: 0.01,
    group: "Costs of errors",
  },
  {
    key: "platformPerYear",
    label: "Platform and running cost",
    value: 120000,
    unit: "€/year",
    kind: "assumption",
    note: "Licence, hosting, monitoring, part-time rule owner.",
    min: 0,
    max: 600000,
    step: 10000,
    group: "System",
  },
  {
    key: "implementation",
    label: "One-off implementation",
    value: 150000,
    unit: "€",
    kind: "assumption",
    note: "Integration, data mapping, testing, rollout.",
    min: 0,
    max: 1000000,
    step: 10000,
    group: "System",
  },
  {
    key: "changeWeeksToday",
    label: "Lead time of a rule change today",
    value: 6,
    unit: "weeks",
    kind: "assumption",
    note: "Specification, IT change request, testing, release window.",
    min: 1,
    max: 26,
    step: 1,
    group: "Policy change",
  },
  {
    key: "changePersonDays",
    label: "Effort of a rule change today",
    value: 20,
    unit: "person-days",
    kind: "assumption",
    note: "Business, IT and test effort plus manual re-review of open claims.",
    min: 1,
    max: 120,
    step: 1,
    group: "Policy change",
  },
  {
    key: "dayRate",
    label: "Blended internal day rate",
    value: 800,
    unit: "€/day",
    kind: "assumption",
    note: "Mix of business analyst, developer and tester.",
    min: 300,
    max: 2000,
    step: 50,
    group: "Policy change",
  },
  {
    key: "changeHoursWithSystem",
    label: "Effort of a rule change with the system",
    value: 2,
    unit: "hours",
    kind: "measured",
    note: "Draft → automatic replay on all claims → approve → activate. The v2 change took minutes in this prototype.",
    min: 0.5,
    max: 40,
    step: 0.5,
    group: "Policy change",
  },
];

export type Inputs = Record<AssumptionKey, number>;
export const defaultInputs = (): Inputs =>
  Object.fromEntries(DEFAULT_ASSUMPTIONS.map((a) => [a.key, a.value])) as Inputs;

export const hourlyCost = (i: Inputs) => (i.salary * i.loadFactor) / i.productiveHours;
export const wrongRoutineCost = (i: Inputs) => i.avgClaim * i.overpayShare;
export const unnecessaryReviewCost = (i: Inputs) => (i.reviewMin / 60) * hourlyCost(i);

export interface Outcome {
  hourly: number;
  todayHours: number;
  todayCost: number;
  withHours: number;
  withPeopleCost: number;
  withCost: number;
  netPerYear: number;
  paybackMonths: number | null;
  fteToday: number;
  fteWith: number;
  automation: number; // share handled without a reviewer
  breakdown: { review: number; info: number; checks: number }; // hours with system
}

/** mix: shares of routine / request info / review measured on the claim set; secondShare: second checks. */
export function triageEconomics(i: Inputs, mix: Mix, secondShare = 0): Outcome {
  const hourly = hourlyCost(i);
  const n = i.claimsPerYear;
  const todayHours = (n * i.triageMinToday) / 60;
  const review = (n * mix.share.human_review * i.reviewMin) / 60;
  const info = (n * mix.share.request_information * i.infoMin) / 60;
  const checks = (n * secondShare * i.checkMin) / 60;
  const withHours = review + info + checks;
  const todayCost = todayHours * hourly;
  const withPeopleCost = withHours * hourly;
  const withCost = withPeopleCost + i.platformPerYear;
  const netPerYear = todayCost - withCost;
  return {
    hourly,
    todayHours,
    todayCost,
    withHours,
    withPeopleCost,
    withCost,
    netPerYear,
    paybackMonths: netPerYear > 0 ? (i.implementation / netPerYear) * 12 : null,
    fteToday: todayHours / i.productiveHours,
    fteWith: withHours / i.productiveHours,
    automation: mix.share.routine_processing + mix.share.request_information,
    breakdown: { review, info, checks },
  };
}

/** Annual cost of errors from measured error rates on labelled claims. */
export function errorCost(i: Inputs, m: Metrics) {
  const wr = m.n ? m.wrongRoutine / m.n : 0;
  const ur = m.n ? m.unnecessaryReview / m.n : 0;
  const wrong = wr * i.claimsPerYear * wrongRoutineCost(i);
  const unnecessary = ur * i.claimsPerYear * unnecessaryReviewCost(i);
  return { wrongRate: wr, unnecessaryRate: ur, wrong, unnecessary, total: wrong + unnecessary };
}

/** Escalate when P(needs a person) exceeds this: the expected cost of both choices is equal there. */
export const breakEvenProbability = (i: Inputs) =>
  unnecessaryReviewCost(i) / (unnecessaryReviewCost(i) + wrongRoutineCost(i));

/** Cost of one policy change today vs with the system, using the share of claims the change affects. */
export function policyChangeCost(i: Inputs, mix: Mix) {
  const staleShare = mix.open ? mix.staleWrongRoutine / mix.open : 0; // routine under old rules, review under new
  const perWeekExposure = (i.claimsPerYear / 52) * staleShare * wrongRoutineCost(i);
  const todayProcess = i.changePersonDays * i.dayRate;
  const todayExposure = perWeekExposure * i.changeWeeksToday;
  const withProcess = i.changeHoursWithSystem * hourlyCost(i);
  const withExposure = perWeekExposure * (1 / 5); // same working day
  return {
    staleShare,
    perWeekExposure,
    today: { process: todayProcess, exposure: todayExposure, total: todayProcess + todayExposure },
    withSystem: { process: withProcess, exposure: withExposure, total: withProcess + withExposure },
  };
}

export const eur0 = (n: number) =>
  (n < 0 ? "−€" : "€") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const eurCompact = (n: number) => {
  const a = Math.abs(n);
  const s =
    a >= 1e6
      ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`
      : a >= 1e4
        ? `${Math.round(a / 1e3)}k`
        : Math.round(a).toLocaleString("en-US");
  return (n < 0 ? "−€" : "€") + s;
};
export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
