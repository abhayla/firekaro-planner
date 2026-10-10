/**
 * #87 round 4 — the owner's conservative non-earner rule (2026-10-10; replaces round 3's
 * label-dependent spouse clubbing). When at least one adult earns (salary or operated business):
 *  - every NON-earning adult's income share and every minor's income is taxed on the earner with
 *    the highest own gross (ties: the anchor adult). Relation labels are never read.
 *  - the non-earners' own deduction rows (and their share of Joint rows) are claimed by NOBODY.
 * With no earner, every adult with income files on their own share (round-1 behaviour).
 *
 * Locked here:
 *  1. Property (fast-check): household tax under the rule ≥ every adult filing separately on their
 *     own share with their own deductions (an independent oracle below), AUTO and forced OLD/NEW.
 *  2. Property: relabelling members' relation never changes household tax.
 *  3. The round-3 reviewer's fixture (earner with no own 80C, homemaker with ₹1.5L PPF + ₹20k FD).
 *  4. Conservation PER ROW against the RETURNS themselves (`incomeRows` / `deductionRows`).
 */
import fc from "fast-check";
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { loadRaviSeed } from "@/seeds/ravi";
import {
  deductionsForMember,
  jointShareFor,
  JOINT_DEDUCTION_OWNER,
  perAssesseeHouseholdTax,
} from "@/lib/tax-deductions";
import { householdTaxUnderRegime, type RegimePick } from "@/lib/household-tax-regime";
import { computeTax } from "@/lib/tax";
import { toAnnual } from "@/lib/cashflow";
import { isEarningMember } from "@/lib/member-earning";
import { ageAsOf, todayIsoLocal } from "@/lib/as-of-date";
import { isAdultRole, type Household } from "@/types/household";

const FY = "2025-26";
const AS_OF = new Date("2025-10-01T00:00:00");
const AS_OF_ISO = todayIsoLocal(AS_OF);

type H = ReturnType<typeof useHouseholdStore>;
type A = ReturnType<typeof useAssumptionsStore>;
const SEEDS: Array<[string, (h: H, a: A) => void]> = [
  ["sharmas", (h, a) => loadSeedPersona(h, a, FY)],
  ["iyers", (h, a) => loadIyersSeed(h, a)],
  ["mehtas", (h, a) => loadMehtasSeed(h, a)],
  ["mauryas", (h, a) => loadMauryasSeed(h, a, FY)],
  ["ravi", (h, a) => loadRaviSeed(h, a, AS_OF)],
];

function seed(load: (h: H, a: A) => void, mutate?: (d: Household) => void): Household {
  setActivePinia(createPinia());
  const h = useHouseholdStore();
  const a = useAssumptionsStore();
  load(h, a);
  const d = JSON.parse(JSON.stringify(h.data)) as Household;
  mutate?.(d);
  return d;
}
const mauryas = (mutate?: (d: Household) => void) =>
  seed((h, a) => loadMauryasSeed(h, a, FY), mutate);

const tax = (d: Household, split = 50) =>
  perAssesseeHouseholdTax(
    d,
    { members: d.members, businesses: d.businesses, otherIncome: d.otherIncome },
    FY,
    split,
    AS_OF,
  );
const ruleTax = (d: Household, pick: RegimePick, split = 50) =>
  householdTaxUnderRegime(tax(d, split).perAssessee, pick, FY).totalTax;
const who = (r: ReturnType<typeof tax>, id: string) => r.perAssessee.find((x) => x.memberId === id);

const interest = (id: string, ownerId: string, amount: number) =>
  ({
    id,
    type: "Interest",
    source: "Direct",
    label: "probe interest",
    ownerId,
    amount,
    frequency: "A",
    isTaxExempt: false,
  }) as Household["otherIncome"][number];
const ppf = (id: string, ownerId: string, monthly: number) =>
  ({ id, type: "PPF", label: "probe PPF", value: 0, monthlyContribution: monthly, ownerId }) as never;

/**
 * INDEPENDENT oracle — "every adult with income files separately on their own share with their own
 * deductions" (no attribution). Own rows 100%, Joint rows by `jointShareFor`, a minor's/unknown row on
 * the adult the rule also uses (highest own-gross earner, else the anchor), so the only difference
 * from the rule is the non-earners' attribution. Handles Interest-style and business rows (what the
 * generator and the reviewer fixture produce); rentals are not generated.
 */
function separateFilingTax(d: Household, pick: RegimePick, split = 50): number {
  const adults = d.members.filter((m) => isAdultRole(m.role));
  const gross = new Map(adults.map((a) => [a.id, a.salary?.annualCTC ?? 0]));
  let orphan = 0;
  const give = (ownerId: string, amount: number) => {
    if (ownerId === JOINT_DEDUCTION_OWNER) {
      for (const a of adults) gross.set(a.id, gross.get(a.id)! + amount * jointShareFor(d, a.id, split));
    } else if (gross.has(ownerId)) gross.set(ownerId, gross.get(ownerId)! + amount);
    else orphan += amount;
  };
  for (const o of d.otherIncome) {
    if (o.isTaxExempt) continue;
    give(o.ownerId, toAnnual({ amount: o.amount, period: o.frequency }));
  }
  for (const b of d.businesses) {
    give(b.ownerId, toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100));
  }
  const earners = adults.filter((m) => isEarningMember(m, d.businesses));
  const anchor = earners[0]?.id ?? adults[0]?.id;
  const top = earners.length
    ? earners.reduce((best, e) => (gross.get(e.id)! > gross.get(best.id)! ? e : best)).id
    : anchor;
  if (top) gross.set(top, gross.get(top)! + orphan);
  let total = 0;
  for (const a of adults) {
    const g = gross.get(a.id)!;
    if (g === 0 && !isEarningMember(a, d.businesses)) continue;
    const ded = deductionsForMember(d, a.id, split, { asOfDate: AS_OF_ISO });
    const args = {
      grossIncome: g,
      fy: FY,
      deductions: ded.totalDeductions,
      employerNpsByMember: ded.employerNpsByMember,
      taxpayerAge: ageAsOf(a.dateOfBirth, AS_OF_ISO),
      isSalaried: (a.salary?.annualCTC ?? 0) > 0,
    };
    const o = computeTax({ ...args, regime: "OLD" }).totalTax;
    const n = computeTax({ ...args, regime: "NEW" }).totalTax;
    total += pick === "OLD" ? o : pick === "NEW" ? n : Math.min(o, n);
  }
  return total;
}

// ---------------------------------------------------------------------------------------------
// Generated households: 1–3 adults, 0–2 minors, random earner status, own/Joint/minor rows.
// ---------------------------------------------------------------------------------------------
const RELATIONS = ["", "Self", "Spouse", "Wife", "Husband", "Mother", "Sister", "Son", "Partner"];
const adultArb = fc.record({
  ctc: fc.oneof(fc.constant(0), fc.integer({ min: 300_000, max: 6_000_000 })),
  bizProfit: fc.oneof(fc.constant(0), fc.integer({ min: 100_000, max: 3_000_000 })),
  bizOperated: fc.boolean(),
  age: fc.integer({ min: 22, max: 82 }),
  relation: fc.constantFrom(...RELATIONS),
});
const rowArb = fc.record({ owner: fc.nat(), amount: fc.integer({ min: 0, max: 1_500_000 }) });
const dedArb = fc.record({ owner: fc.nat(), monthly: fc.integer({ min: 0, max: 15_000 }) });
const householdArb = fc.record({
  adults: fc.array(adultArb, { minLength: 1, maxLength: 3 }),
  minors: fc.integer({ min: 0, max: 2 }),
  rows: fc.array(rowArb, { maxLength: 5 }),
  deds: fc.array(dedArb, { maxLength: 4 }),
  split: fc.constantFrom(50, 60, 70),
});
type Gen = typeof householdArb extends fc.Arbitrary<infer T> ? T : never;

function build(base: Household, g: Gen): Household {
  const d = JSON.parse(JSON.stringify(base)) as Household;
  const adultIds = g.adults.map((_, i) => `a${i}`);
  const minorIds = Array.from({ length: g.minors }, (_, i) => `m${i}`);
  d.members = [
    ...g.adults.map(
      (a, i) =>
        ({
          id: adultIds[i],
          name: `Adult ${i}`,
          role: "ADULT",
          relation: a.relation,
          dateOfBirth: `${2025 - a.age}-04-01`,
          planToAge: 90,
          ...(a.ctc > 0 ? { salary: { annualCTC: a.ctc, hikePercent: 5 } } : {}),
        }) as never,
    ),
    ...minorIds.map(
      (id) => ({ id, name: id, role: "DEPENDENT", dateOfBirth: "2015-01-01", planToAge: 90 }) as never,
    ),
  ];
  d.businesses = g.adults.flatMap((a, i) =>
    a.bizProfit > 0
      ? [
          {
            id: `b${i}`,
            name: `Biz ${i}`,
            legalKind: "Proprietorship",
            annualProfit: a.bizProfit,
            frequency: "A",
            sharePercent: 100,
            ownerId: adultIds[i],
            isOperated: a.bizOperated,
          } as never,
        ]
      : [],
  );
  const owners = [...adultIds, JOINT_DEDUCTION_OWNER, ...minorIds];
  d.otherIncome = g.rows.map((r, i) => interest(`r${i}`, owners[r.owner % owners.length], r.amount));
  const dedOwners = [...adultIds, JOINT_DEDUCTION_OWNER];
  d.investments = g.deds.map((x, i) => ppf(`p${i}`, dedOwners[x.owner % dedOwners.length], x.monthly));
  d.insurance = [];
  d.liabilities = [];
  return d;
}

describe("#87 round 4 — properties over generated households", () => {
  let base: Household;
  beforeEach(() => {
    base = mauryas();
  });

  it("household tax under the rule ≥ every adult filing separately (AUTO, OLD, NEW)", () => {
    fc.assert(
      fc.property(householdArb, (g) => {
        const d = build(base, g);
        for (const pick of ["AUTO", "OLD", "NEW"] as const) {
          const rule = ruleTax(d, pick, g.split);
          const sep = separateFilingTax(d, pick, g.split);
          if (rule < sep - 1) throw new Error(`${pick}: rule ${rule} < separate ${sep}`);
        }
      }),
      { numRuns: 400 },
    );
  });

  it("relabelling members' relation never changes household tax", () => {
    fc.assert(
      fc.property(householdArb, fc.array(fc.constantFrom(...RELATIONS), { minLength: 3, maxLength: 3 }), (g, rels) => {
        const d = build(base, g);
        const relabelled = build(base, { ...g, adults: g.adults.map((a, i) => ({ ...a, relation: rels[i] })) });
        expect(tax(relabelled, g.split).totalTax).toBe(tax(d, g.split).totalTax);
      }),
      { numRuns: 200 },
    );
  });
});

describe("#87 round 4 — the round-3 reviewer's Mauryas fixture", () => {
  beforeEach(() => setActivePinia(createPinia()));
  // Earner with no own 80C; homemaker with her own ₹1.5L PPF + ₹20k FD interest.
  const fixture = (ctc: number) =>
    mauryas((x) => {
      x.members.find((m) => m.id === "abhay")!.salary!.annualCTC = ctc;
      x.investments = [ppf("madhu-ppf", "madhu", 12_500)];
      x.otherIncome = [interest("madhu-fd", "madhu", 20_000)];
      x.insurance = [];
      x.liabilities = [];
    });

  for (const ctc of [4_700_000, 1_500_000]) {
    it(`₹${ctc / 100_000}L CTC: AUTO and forced OLD never below the no-clubbing figure`, () => {
      const d = fixture(ctc);
      const r = tax(d);
      expect(r.perAssessee.map((x) => x.memberId)).toEqual(["abhay"]);
      expect(who(r, "abhay")!.deductionRows["inv:madhu-ppf"]).toBeUndefined();
      expect(r.attributedNonEarners).toEqual([
        { memberId: "madhu", name: "Madhu Kushwaha", toMemberId: "abhay", toName: "Abhay Maurya" },
      ]);
      for (const pick of ["AUTO", "OLD"] as const) {
        expect(ruleTax(d, pick)).toBeGreaterThanOrEqual(separateFilingTax(d, pick));
      }
    });
  }

  it("Mauryas with the two labels swapped: same tax", () => {
    const d = mauryas();
    const swapped = mauryas((x) => {
      const a = x.members.find((m) => m.id === "abhay")!;
      const m = x.members.find((mm) => mm.id === "madhu")!;
      [a.relation, m.relation] = [m.relation, a.relation];
    });
    expect(tax(swapped).totalTax).toBe(tax(d).totalTax);
  });

  it("a minor's ₹3L interest lands 100% on the target earner; nothing dropped", () => {
    const b = tax(mauryas());
    const r = tax(mauryas((x) => x.otherIncome.push(interest("myra-int", "myra", 300_000))));
    expect(who(r, "abhay")!.grossIncome - who(b, "abhay")!.grossIncome).toBe(300_000);
    expect(r.totalTax).toBeGreaterThan(b.totalTax);
  });

  it("nobody earns → every adult with income files on their own share", () => {
    const r = tax(
      mauryas((x) => {
        x.members.find((m) => m.id === "abhay")!.salary!.annualCTC = 0;
        x.businesses = [];
      }),
    );
    expect(r.attributedNonEarners).toEqual([]);
    expect(who(r, "madhu")!.grossIncome).toBeGreaterThan(0);
  });

  it("the highest-gross earner carries the non-earner, whatever the member order", () => {
    const d = mauryas((x) => {
      x.members.find((m) => m.id === "madhu")!.salary = { annualCTC: 600_000, hikePercent: 5 } as never;
      x.members.push({ ...x.members.find((m) => m.id === "madhu")!, id: "nana", name: "Nana", salary: undefined } as never);
      x.otherIncome.push(interest("nana-int", "nana", 400_000));
    });
    const r = tax(d);
    expect(r.perAssessee.map((p) => p.memberId).sort()).toEqual(["abhay", "madhu"]);
    expect(who(r, "abhay")!.incomeRows["inc:nana-int"]).toBe(400_000);
  });
});

describe("#87 round 4 — conservation PER ROW against the returns, real seeds at split 50 and 70", () => {
  for (const [name, load] of SEEDS) {
    for (const split of [50, 70]) {
      it(`${name} @ split ${split}: each income row lands exactly once; each deduction row is claimed at most once`, () => {
        const d = seed(load);
        const r = tax(d, split);
        const sumOver = (key: string, pick: "incomeRows" | "deductionRows") =>
          r.perAssessee.reduce((s, p) => s + (p[pick][key] ?? 0), 0);
        let rows = 0;
        for (const o of d.otherIncome) {
          if (o.isTaxExempt) continue;
          const annual = toAnnual({ amount: o.amount, period: o.frequency });
          const value =
            o.type === "Rental"
              ? Math.max(0, annual - (o.municipalTaxes ?? 0)) * 0.7 - (o.homeLoanInterest ?? 0)
              : annual;
          expect(sumOver(`inc:${o.id}`, "incomeRows"), `${name} income row ${o.id}`).toBeCloseTo(value, 6);
          rows++;
        }
        for (const b of d.businesses) {
          const v = toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100);
          expect(sumOver(`biz:${b.id}`, "incomeRows"), `${name} business ${b.id}`).toBeCloseTo(v, 6);
          rows++;
        }
        const ded = [
          ...d.investments.map((i) => `inv:${i.id}`),
          ...d.insurance.map((p) => `ins:${p.id}`),
          ...d.liabilities.filter((l) => l.type === "HomeLoan").map((l) => `loan:${l.id}`),
        ];
        for (const key of ded) {
          expect(sumOver(key, "deductionRows"), `${name} deduction row ${key}`).toBeLessThanOrEqual(1 + 1e-12);
        }
        expect(rows + ded.length, "the law must test real rows").toBeGreaterThan(0);
        // Joint deduction rows shared by two EARNERS keep the complementary split (sum exactly 1).
        const earners = d.members.filter((m) => isEarningMember(m, d.businesses));
        if (earners.length >= 2) {
          for (const i of d.investments.filter((x) => x.ownerId === JOINT_DEDUCTION_OWNER)) {
            expect(sumOver(`inv:${i.id}`, "deductionRows"), `${name} Joint ${i.id}`).toBeCloseTo(1, 12);
          }
        }
      });
    }
  }

  it("a dual-earner household with a Joint 80C row: claimed exactly once across the two returns", () => {
    const d = mauryas((x) => {
      x.members.find((m) => m.id === "madhu")!.salary = { annualCTC: 900_000, hikePercent: 5 } as never;
      x.investments.push(ppf("joint-ppf", JOINT_DEDUCTION_OWNER, 10_000));
    });
    const r = tax(d, 70);
    expect(r.perAssessee.length).toBe(2);
    const s = r.perAssessee.reduce((t, p) => t + (p.deductionRows["inv:joint-ppf"] ?? 0), 0);
    expect(s).toBeCloseTo(1, 12);
  });
});
