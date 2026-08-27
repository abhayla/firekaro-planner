import { z } from "zod";

// ---------- Member ----------
// gh #67: `role` carries ONE axis only — adult vs dependent (NOT derivable from data, so it
// stays an explicit choice). Earning-status is NO LONGER a role flag; it is DERIVED from whether
// the member has labour income (salary or an active business) via lib/member-earning.ts
// (isEarningMember). This removes the two-sources-of-truth contradiction where a manual `EARNER`
// flag could silently disagree with the actual salary data.
//   ADULT      — a household adult (earning OR non-earning). Has longevity (planToAge) + own health.
//                If they have labour income they are an EARNER (derived) and get a retire-from-job
//                age + employmentStatus; a non-earning adult (homemaker / career break) shows neither.
//                Their longevity MUST extend the household plan horizon (derive.ts) so the corpus
//                covers a surviving spouse — otherwise the plan is under-provisioned (gh #34).
//   DEPENDENT  — a child: educationStage, NO planToAge, NO salary, never an earner.
export const memberRoleSchema = z.enum(["ADULT", "DEPENDENT"]);
export type MemberRole = z.infer<typeof memberRoleSchema>;

/** Adult members — their longevity drives the plan horizon (gh #34). Earning is derived, not a role. */
export const ADULT_ROLES: readonly MemberRole[] = ["ADULT"];
export function isAdultRole(role: MemberRole): boolean {
  return role === "ADULT";
}

export const memberSalarySchema = z.object({
  annualCTC: z.number().min(0),
  hikePercent: z.number().min(0).max(25),
  vpfTopUpPercent: z.number().min(0).max(100).optional(),
  // Employer's annual NPS contribution (₹). Deductible under Sec 80CCD(2) in BOTH
  // tax regimes (the one Chapter VI-A deduction the new regime keeps). The salary form
  // collects this as a % of basic (sector-aware default: govt 14 / private 0 —
  // salary-percent.ts) and persists the computed ₹; 0 persists as ABSENT; the engine
  // consumes the amount, never a %. gh-issue #2 findings #1/#2.
  employerNpsAnnual: z.number().min(0).optional(),
  // Basic salary (Basic + DA) per year. Used ONLY to cap the 80CCD(2) deduction at the
  // statutory ceiling (10% of basic old regime / 14% new). The salary form collects this
  // as a % of CTC (fresh-entry default 50 — salary-percent.ts) and persists the computed ₹;
  // 0% persists as ABSENT. Optional — when absent the employer-NPS figure is trusted
  // uncapped and gratuity/EPS fall back to their conservative estimates. gh-issue #3.
  basicAnnual: z.number().min(0).optional(),
  // Employer sector — GOVERNMENT employees get the 14%-of-basic 80CCD(2) ceiling under the
  // OLD regime too (private = 10% old / 14% new). Optional; absent ⇒ "private" (conservative
  // default — never over-deducts). gh-issue #4.
  employerSector: z.enum(["private", "government"]).optional(),
});
export type MemberSalary = z.infer<typeof memberSalarySchema>;

// ---------- Q2.1 additional onboarding fields ----------
export const cityTierSchema = z.enum(["Metro", "Tier-1", "Tier-2"]);
export type CityTier = z.infer<typeof cityTierSchema>;

export const healthStatusSchema = z.enum(["Healthy", "Chronic", "Special"]);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const educationStageSchema = z.enum(["Preschool", "Primary", "Secondary", "College"]);
export type EducationStage = z.infer<typeof educationStageSchema>;

export const riskAppetiteSchema = z.enum(["Conservative", "Moderate", "Aggressive"]);
export type RiskAppetite = z.infer<typeof riskAppetiteSchema>;

export const maritalStatusSchema = z.enum(["Single", "Married", "Divorced", "Widowed"]);
export type MaritalStatus = z.infer<typeof maritalStatusSchema>;

export const employmentStatusSchema = z.enum([
  "Employed",
  "Self-employed",
  "Contract",
  "Business-owner",
]);
export type EmploymentStatus = z.infer<typeof employmentStatusSchema>;

export const memberSchema = z.object({
  id: z.string(),
  // Phase 1 Stage B — multi-tenant userId per ADR-0001. Optional in schema
  // (additive migration); hydrate backfills from getAuthProvider().
  userId: z.string().optional(),
  name: z.string().min(0).max(60),
  // Q2 (v3): DOB replaces age. ISO YYYY-MM-DD. Age is derived via lib/age.ts → ageFromDOB().
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  role: memberRoleSchema,
  targetRetirementAge: z.number().int().min(30).max(80).optional(),
  // Phase 1 Stage B (audit Entry #1 A1.2) — Plan-to age per member.
  // Optional with consumer-side fallback to 90 (research Ch 02 §2.9: Indian
  // sandwich-gen longevity median 88-92).
  planToAge: z.number().int().min(50).max(110).optional(),
  relation: z.string().optional(),
  salary: memberSalarySchema.optional(),
  // Q2.1 — 6 additional onboarding fields. Conservative defaults so wizard never blocks.
  city: cityTierSchema.default("Metro"),
  health: healthStatusSchema.default("Healthy"),
  educationStage: educationStageSchema.optional(), // dependents only
  riskAppetite: riskAppetiteSchema.default("Moderate"),
  marital: maritalStatusSchema.default("Married"),
  employmentStatus: employmentStatusSchema.optional(), // earners only
});
export type Member = z.infer<typeof memberSchema>;

// Editor-state shape used by ProfileStep + MembersForm before committing to the store.
// Allows nullable targetRetirementAge while the user is mid-edit. DOB is required as soon
// as the row exists (the form provides a sensible default = today - 30y).
export interface MemberDraft {
  id: string;
  name: string;
  dateOfBirth: string;
  role: MemberRole;
  // gh #67: DERIVED, read-only projection of "does this adult have labour income?" — computed at
  // load time via isEarningMember() from the committed member's salary/business, NOT a user flag.
  // Drives the conditional render of targetRetirementAge/employmentStatus on the member form.
  // A brand-new adult starts non-earning until income is added on the Salary/Income screen.
  isEarning: boolean;
  targetRetirementAge: number | null;
  // Phase 1 Stage B (audit Entry #1 A1.2) — end-of-horizon plan-to age,
  // editable on the member form (A5.x). Earners only; null while mid-edit.
  planToAge: number | null;
  relation: string;
  // Q2.1 — surfaced in MembersForm
  city: CityTier;
  health: HealthStatus;
  educationStage: EducationStage | null;
  riskAppetite: RiskAppetite;
  marital: MaritalStatus;
  employmentStatus: EmploymentStatus | null;
}

// ---------- Other income (D9) ----------
export const otherIncomeTypeSchema = z.enum([
  "Rental",
  "Dividend",
  "Interest",
  "CapitalGains",
  "Other",
]);
export type OtherIncomeType = z.infer<typeof otherIncomeTypeSchema>;

/**
 * Unified period schema — single source of truth (Phase 0 Stage A1).
 * Replaces the legacy frequencyMA (["monthly","annual"]) convention that
 * coexisted with recurringFreqSchema. The hydrate path in
 * stores/household.ts now translates "monthly"/"annual" -> "M"/"A" via
 * lib/cashflow.ts:legacyFreqToPeriod() during the v4->v5 migration window.
 */
export const periodSchema = z.enum(["M", "Q", "A"]);
export type Period = z.infer<typeof periodSchema>;

export const otherIncomeLineSchema = z.object({
  id: z.string(),
  type: otherIncomeTypeSchema,
  // source: 'Direct' or owner-entity id
  source: z.string(),
  sourceEntityId: z.string().optional(),
  label: z.string().max(60).optional(),
  amount: z.number().min(0),
  frequency: periodSchema,
  ownerId: z.string(),
  isTaxExempt: z.boolean(),
  // §24(b) home-loan interest + municipal taxes — let-out rental only (type === "Rental").
  // Both are ANNUAL amounts; undefined ⇒ 0. They reduce TAXABLE house-property income only,
  // never the cash the landlord receives. gh-issue #32.
  homeLoanInterest: z.number().min(0).optional(),
  municipalTaxes: z.number().min(0).optional(),
});
export type OtherIncomeLine = z.infer<typeof otherIncomeLineSchema>;

// ---------- Businesses (D10) ----------
export const businessLegalKindSchema = z.enum([
  "SoleProp",
  "FreelanceProf",
  "Partnership",
  "LLP",
  "PvtLtd",
  "HUF",
  "Other",
]);
export type BusinessLegalKind = z.infer<typeof businessLegalKindSchema>;

export const businessSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  legalKind: businessLegalKindSchema,
  annualProfit: z.number().min(0),
  frequency: periodSchema,
  sharePercent: z.number().min(1).max(100),
  ownerId: z.string(),
  // Q3 (v3): unifies former ownerEntities into businesses. true = active business (operated by user
  // — generates profit). false = passive legal entity (HUF, family LLP, etc. — exists but no
  // operational profit; kept as a source label for Other Income.)
  isOperated: z.boolean().default(true),
});
export type Business = z.infer<typeof businessSchema>;

// ---------- Investments (Phase 0 Stage A2 — discriminated union) ----------
// 10 inherited types + 2 new (International, REIT per audit Entries #18 + #20).
// See lib/investment-traits.ts for liquidity/return/tax/inflation routing.
export const investmentTypeSchema = z.enum([
  "Stocks",
  "MutualFunds",
  "PPF",
  "NPS",
  "RealEstate",
  "Gold",
  "FD",
  "Crypto",
  "EPF_VPF",
  "ESOP",
  "International", // NEW v5 (audit Entry #18) — FoF / LRS-Direct / GIFT City
  "REIT", // NEW v5 (audit Entry #20) — listed REITs
]);
export type InvestmentType = z.infer<typeof investmentTypeSchema>;

// Q9 (v3) — per-type natural-granularity fields. Each optional; for tradable types value
// derives from the per-type fields (qty × price, units × NAV, grams × pricePerGram).
export const goldSubtypeSchema = z.enum(["Physical", "SGB", "ETF"]);
export type GoldSubtype = z.infer<typeof goldSubtypeSchema>;

export const realEstateOwnershipSchema = z.enum(["Self", "Rented", "Co-owned"]);
export type RealEstateOwnership = z.infer<typeof realEstateOwnershipSchema>;

export const npsTierSchema = z.enum(["I", "II"]);
export type NpsTier = z.infer<typeof npsTierSchema>;

// Temporal Phase 1 (gh-issue #46) — an optional time-varying contribution plan for one holding.
// Mirrors lib/contribution-schedule.ts (kept FLAT, per this file's localStorage back-compat note).
// Age-relative segments; `amount` REAL ₹/month; `stepUpPercentPerYear` REAL %, clamped ≤15.
// DISPLAY/PLAN metadata only — NEVER summed into corpus inflow (the gh-issue #11 lock; corpus
// inflow is the single household savings residual in derive.ts).
// (The compute-side type lives in lib/contribution-schedule.ts and is structurally identical;
// this is only the persisted Zod shape — no second exported type name to keep one canonical.)
export const contributionSegmentSchema = z.object({
  amount: z.number().min(0),
  startAtAge: z.number().int().min(0).max(120),
  endAtAge: z.number().int().min(0).max(120).optional(),
  stepUpPercentPerYear: z.number().min(0).max(15).optional(),
});

export const investmentSchema = z.object({
  id: z.string(),
  type: investmentTypeSchema,
  label: z.string().max(80).optional(),
  value: z.number().min(0), // For tradables: derived. For PPF/NPS/FD: stored balance/principal.
  monthlyContribution: z.number().min(0).optional(),
  // Opt-in time-varying contribution plan (#46). Absent ⇒ the scalar monthlyContribution is the
  // simple/default path. When present it is authoritative for DISPLAY; the two are never summed.
  contributionSchedule: z.array(contributionSegmentSchema).optional(),
  ownerId: z.string(), // member id or "Joint"
  holdingsCount: z.number().int().min(0).optional(),
  // ESOP (Q20B mid-fidelity, v2)
  totalGrantValue: z.number().min(0).optional(),
  vestedPercent: z.number().min(0).max(100).optional(),
  // Stocks (Q9 v3)
  qty: z.number().min(0).optional(),
  pricePerShare: z.number().min(0).optional(),
  // MutualFunds (Q9 v3)
  units: z.number().min(0).optional(),
  navPerUnit: z.number().min(0).optional(),
  // PPF / NPS (Q9 v3)
  openingYear: z.number().int().min(1990).max(2100).optional(),
  npsTier: npsTierSchema.optional(),
  // RealEstate (Q9 v3)
  city: cityTierSchema.optional(),
  ownership: realEstateOwnershipSchema.optional(),
  purchaseYear: z.number().int().min(1950).max(2100).optional(),
  // Gold (Q9 v3)
  subtype: goldSubtypeSchema.optional(),
  grams: z.number().min(0).optional(),
  pricePerGram: z.number().min(0).optional(),
  // FD (Q9 v3)
  principal: z.number().min(0).optional(),
  interestRate: z.number().min(0).max(20).optional(),
  maturityYear: z.number().int().min(1990).max(2100).optional(),
  bank: z.string().max(60).optional(),
  // Crypto (Q9 v3)
  coin: z.string().max(20).optional(),
  pricePerCoin: z.number().min(0).optional(),
  // International (v5 audit Entry #18) — route discriminator.
  internationalRoute: z.enum(["FoF", "LRS-Direct", "GIFT-City"]).optional(),
  // REIT (v5 audit Entry #20) — same shape as Stocks for now.

  // Phase 1 Stage B — audit Entry #8 A8.1: time-horizon bucket.
  // 1 = 0-3yr / 2 = 3-10yr / 3 = 10-25yr / 4 = 25+yr. Used by
  // /investments/buckets (Phase 5 Stage N) for SORR-aware bucketing.
  bucket: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),

  // Phase 1 Stage B — audit Entry #20 A20.1: RealEstate role.
  realEstateRole: z.enum(["PrimaryResidence", "Investment", "Inherited"]).optional(),

  // Phase 1 Stage B — audit Entry #24 A24.1-2: ESOP grant details.
  grantorCountry: z.enum(["India", "US", "Other"]).optional(),
  exercisePrice: z.number().min(0).optional(),
  fmvAtVest: z.number().min(0).optional(),
  vestedValueINR: z.number().min(0).optional(),

  // Phase 1 Stage B — audit Entry #28 A28.3: whether contribution is
  // automated (SIP / EPF deduction / auto-debit). Drives the "auto-debit
  // gap" nudge in Phase 6 Stage Q.
  isAutomated: z.boolean().optional(),
  // T-378 (QN-1) — created by the `/quick` express path as the ONE "all my investments" line.
  // Rides the server's existing `subtypeData` JSONB (household-repo sweeps every non-typed key
  // there and spreads it back on read) — so NO Prisma change. Deliberately NOT `source`, which
  // already means something else (Direct/Regular, owner-entity id).
  quickSource: z.boolean().optional(),
});
export type Investment = z.infer<typeof investmentSchema>;

// ---------- Discriminated union (Phase 0 Stage A2) ----------
// TypeScript-level narrowing: branch on `type` and the compiler narrows the per-type
// fields. The runtime Zod schema above stays flat for backward-compat with persisted
// localStorage data — discriminated-union dispatch is only needed at READ time. All
// trait dispatch (liquidity / expectedReturn / taxBucket / inflationRoute) routes
// through lib/investment-traits.ts.
//
// Each branch is `Investment` narrowed to its `type` discriminator. The per-type
// fields stay optional per the Zod source-of-truth shape — null-tolerant reads in
// trait functions handle missing values.
export type StocksHolding = Investment & { type: "Stocks" };
export type MutualFundsHolding = Investment & { type: "MutualFunds" };
export type PpfHolding = Investment & { type: "PPF" };
export type NpsHolding = Investment & { type: "NPS" };
export type RealEstateHolding = Investment & { type: "RealEstate" };
export type GoldHolding = Investment & { type: "Gold" };
export type FdHolding = Investment & { type: "FD" };
export type CryptoHolding = Investment & { type: "Crypto" };
export type EpfVpfHolding = Investment & { type: "EPF_VPF" };
export type EsopHolding = Investment & { type: "ESOP" };
export type InternationalHolding = Investment & { type: "International" };
export type ReitHolding = Investment & { type: "REIT" };

export type InvestmentRecord =
  | StocksHolding
  | MutualFundsHolding
  | PpfHolding
  | NpsHolding
  | RealEstateHolding
  | GoldHolding
  | FdHolding
  | CryptoHolding
  | EpfVpfHolding
  | EsopHolding
  | InternationalHolding
  | ReitHolding;

// ---------- Liabilities (D15) ----------
export const loanTypeSchema = z.enum([
  "HomeLoan",
  // gh #38: a loan for a commercial / business property (e.g. a shop). Distinct from
  // HomeLoan because it is NOT a residential house property — its interest must NOT
  // receive the §24(b) ₹2L residential deduction (see tax-deductions.ts). The
  // legitimate §36(1)(iii) business-interest deduction needs business-income modelling
  // (out of scope for the salaried-accumulator wedge).
  "CommercialPropertyLoan",
  "PersonalLoan",
  "CarLoan",
  "EducationLoan",
  "CreditCard",
  "Other",
]);
export type LoanType = z.infer<typeof loanTypeSchema>;

export const liabilitySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  type: loanTypeSchema,
  outstandingBalance: z.number().min(0),
  monthlyEMI: z.number().min(0),
  interestRate: z.number().min(0).max(50),
  ownerId: z.string(),
  isSharedWithSpouse: z.boolean().default(false),
  derivedEndYear: z.number().int().optional(),
  // Phase 1 Stage B audit Entry #23 A23.1 — joint-loan co-borrowers (memberIds).
  // Optional with consumer-side fallback to []. Used by tax to apply 2x
  // deductions on joint home loans (Sec 24 + 80C/80EE).
  coBorrowers: z.array(z.string()).optional(),
});
export type Liability = z.infer<typeof liabilitySchema>;

// ---------- Insurance (D16) ----------
export const insuranceTypeSchema = z.enum(["Vehicle", "Health", "Life"]);
export type InsuranceType = z.infer<typeof insuranceTypeSchema>;

export const insurancePolicySchema = z.object({
  id: z.string(),
  type: insuranceTypeSchema,
  provider: z.string().min(1).max(80),
  sumAssured: z.number().min(0),
  annualPremium: z.number().min(0),
  insuredPersonId: z.string(),
  renewalMonth: z.number().int().min(1).max(12).optional(),
  renewalYear: z.number().int().optional(),
});
export type InsurancePolicy = z.infer<typeof insurancePolicySchema>;

// ---------- Expenses (D11) ----------
// recurringFreqSchema / RecurringFreq are retained as type aliases pointing
// at the unified periodSchema (above). Existing consumers keep their import
// shape; new code should prefer periodSchema / Period.
export const recurringFreqSchema = periodSchema;
export type RecurringFreq = Period;

export const recurringSourceSchema = z.enum(["manual", "auto-insurance", "auto-loan"]);
export type RecurringSource = z.infer<typeof recurringSourceSchema>;

// Phase 1 Stage B — 4-bucket inflation routing per audit Entry #3 A3.6.
// 'general' is the v4-faithful CPI route; specific kinds re-route to the
// matching bucket in lib/cashflow inflate calls (Stage C consumes this).
export const inflationBucketSchema = z.enum([
  "general",
  "healthcare",
  "education",
  "housing",
]);
export type InflationBucket = z.infer<typeof inflationBucketSchema>;

// Phase 1 Stage B — recurring-expense `kind` per audit Entry #6 A6.1 + #10 A10.2.
// 'general' is the v4-faithful default; 'parents' auto-routes to healthcare
// inflation per Entry #10; 'medical' similarly; 'extended-contingency' is the
// 7.5% buffer per Entry #6.
export const recurringExpenseKindSchema = z.enum([
  "general",
  "parents",
  "extended-contingency",
  "medical",
]);
export type RecurringExpenseKind = z.infer<typeof recurringExpenseKindSchema>;

export const recurringExpenseLineSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(80),
  amount: z.number().min(0),
  frequency: recurringFreqSchema,
  endYear: z.number().int().optional(),
  source: recurringSourceSchema,
  sourceRefId: z.string().optional(),
  // Phase 1 Stage B audit Entry #3 A3.6 — inflation routing.
  // Optional with consumer-side fallback to 'general'.
  inflationBucket: inflationBucketSchema.optional(),
  // Phase 1 Stage B audit Entry #6 A6.1 + #10 A10.2 — expense classification.
  kind: recurringExpenseKindSchema.optional(),
  // #81 Phase 1 — member attribution. A member id | "Household" (shared, default) |
  // "Dependents" (kids-shared). Optional with consumer-side fallback to "Household"
  // (lib/expense-attribution.ts) — keeps existing persisted rows byte-identical; the
  // hydrate backfill + add/auto-flow write paths populate it explicitly. DISPLAY-only:
  // never changes what feeds the household FIRE total (contract §2 decision 7).
  ownerId: z.string().optional(),
});
export type RecurringExpenseLine = z.infer<typeof recurringExpenseLineSchema>;

// Phase 1 Stage B — planned-future `kind` per audit Entry #6 A6.2 + #10 A10.3.
// 'general' is v4-faithful; 'education'/'marriage' are the new audit-mandated
// kinds for goal classification.
export const plannedFutureKindSchema = z.enum([
  "general",
  "education",
  "marriage",
  "medical",
]);
export type PlannedFutureKind = z.infer<typeof plannedFutureKindSchema>;

export const plannedFutureLineSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(80),
  todayAmount: z.number().min(0),
  targetYear: z.number().int(),
  isMultiYear: z.boolean().default(false),
  durationYears: z.number().int().optional(),
  // Phase 1 Stage B audit Entry #3 A3.6 — inflation routing.
  inflationBucket: inflationBucketSchema.optional(),
  // Phase 1 Stage B audit Entry #6 A6.2 + #10 A10.3 — goal classification.
  kind: plannedFutureKindSchema.optional(),
  // #81 Phase 1 — member attribution (same contract as recurring lines). A member id |
  // "Household" (shared, default) | "Dependents". Optional + "Household" fallback. DISPLAY-only.
  ownerId: z.string().optional(),
});
export type PlannedFutureLine = z.infer<typeof plannedFutureLineSchema>;

export const expensesSchema = z.object({
  avgMonthly: z.number().min(0),
  recurring: z.array(recurringExpenseLineSchema),
  plannedFuture: z.array(plannedFutureLineSchema),
});
export type Expenses = z.infer<typeof expensesSchema>;

// ---------- Glide path (Phase 1 Stage B audit Entry #7 A7.1) ----------
// Pfau-Kitces rising equity glide path. Anchors map years-before-retirement
// to equity %. The lib/glide-path module (Phase 2 Stage C) interpolates
// between anchors and computes the year-by-year path.
export const glidePathConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Equity % at horizon start (default 75% per Pfau-Kitces). */
  startEquityPercent: z.number().min(0).max(100).default(75),
  /** Equity % at retirement crossover (default 40%). */
  endEquityPercent: z.number().min(0).max(100).default(40),
  /** Years before retirement to begin tapering. Default 10. */
  taperWindowYears: z.number().int().min(0).max(40).default(10),
});
export type GlidePathConfig = z.infer<typeof glidePathConfigSchema>;

// ---------- Estate planning (Phase 1 Stage B audit Entry #35 A35.2) ----------
export const estateChecklistKeySchema = z.enum([
  "will",
  "nominees",
  "powerOfAttorney",
  "jointAccounts",
  "digitalEstate",
  "hufKarta",
  "termLifeBypass",
]);
export type EstateChecklistKey = z.infer<typeof estateChecklistKeySchema>;

export const estateChecklistItemSchema = z.object({
  key: estateChecklistKeySchema,
  completed: z.boolean().default(false),
  date: z.string().optional(),
  notes: z.string().max(280).optional(),
});
export type EstateChecklistItem = z.infer<typeof estateChecklistItemSchema>;

// ---------- Household root ----------
export const setupModeSchema = z.enum(["Solo", "Couple", "Couple+Children", "Custom"]);
export type SetupMode = z.infer<typeof setupModeSchema>;

export const householdSchema = z.object({
  name: z.string().default(""),
  setupMode: setupModeSchema,
  profileComplete: z.boolean(),
  wizardCompleted: z.boolean(),
  members: z.array(memberSchema),
  // Q3 (v3): unified entity store. Was previously split as ownerEntities + businesses.
  businesses: z.array(businessSchema),
  otherIncome: z.array(otherIncomeLineSchema),
  investments: z.array(investmentSchema),
  liabilities: z.array(liabilitySchema),
  insurance: z.array(insurancePolicySchema),
  expenses: expensesSchema,
  // Phase 1 Stage B audit Entry #6 A6.3 — extended-family contingency buffer.
  // Optional (defaults to 0.075 in emptyHousehold + hydrate).
  extendedFamilyContingencyPercent: z.number().min(0).max(0.5).optional(),
  // Phase 1 Stage B audit Entry #10 A10.1 — healthcare corpus reservation.
  // Optional (defaults to 0.20 in emptyHousehold + hydrate).
  healthcareCorpusReservationPercent: z.number().min(0).max(0.5).optional(),
  // Phase 1 Stage B audit Entry #7 A7.1 — glide path configuration.
  glidePath: glidePathConfigSchema.optional(),
  // Phase 1 Stage B audit Entry #35 A35.2 — estate-planning checklist.
  estateChecklist: z.array(estateChecklistItemSchema).optional(),
});
export type Household = z.infer<typeof householdSchema>;
