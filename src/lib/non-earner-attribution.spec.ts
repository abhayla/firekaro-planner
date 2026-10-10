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
import { JOINT_DEDUCTION_OWNER, perAssesseeHouseholdTax } from "@/lib/tax-deductions";
import { householdTaxUnderRegime, type RegimePick } from "@/lib/household-tax-regime";
import { toAnnual } from "@/lib/cashflow";
import { isEarningMember } from "@/lib/member-earning";
import { todayIsoLocal } from "@/lib/as-of-date";
import type { Household } from "@/types/household";

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
const rental = (id: string, ownerId: string, rent: number, homeLoanInterest: number) =>
  ({
    id,
    type: "Rental",
    source: "Direct",
    label: "probe flat",
    ownerId,
    amount: rent,
    frequency: "A",
    isTaxExempt: false,
    municipalTaxes: 0,
    homeLoanInterest,
  }) as Household["otherIncome"][number];
const ppf = (id: string, ownerId: string, monthly: number) =>
  ({ id, type: "PPF", label: "probe PPF", value: 0, monthlyContribution: monthly, ownerId }) as never;

/**
 * #87 round 6 — INDEPENDENT separate-filing reference. It imports NOTHING from the rule's code path
 * (no `deductionsForMember`, `jointShareFor`, `computeTax`, target picking): the FY 2025-26 slab
 * tables, rebate, surcharge, cess and every deduction are written out here from the Income-tax Act.
 *
 * Each ADULT files their own return on their own share of every row: own rows 100%, a Joint row by
 * the complementary split (2 adults: the first earning adult — else the first adult — takes `split`,
 * the other the rest; 1 adult: all; 3+: equal). House property per return: rent less municipal tax,
 * less 30% (§24(a)), less §24(b) interest; OLD sets a net loss off up to ₹2L (§71), NEW floors it at 0
 * (§115BAC(2)). A MINOR's income is clubbed on the parent with the higher total income (§64(1A)); the
 * minor's house property is the minor's own computation, so only a positive result is clubbed (a loss
 * is not set off against the parent). The ₹1,500 §10(32) exemption is NOT applied — that keeps the
 * reference higher, so the property is the stricter one.
 */
const SLABS_OLD = [[250_000, 0.05], [500_000, 0.2], [1_000_000, 0.3]] as const;
const SLABS_NEW = [
  [400_000, 0.05], [800_000, 0.1], [1_200_000, 0.15], [1_600_000, 0.2], [2_000_000, 0.25], [2_400_000, 0.3],
] as const;
function refSlabTax(income: number, regime: "OLD" | "NEW", age: number): number {
  const exemption = regime === "OLD" ? (age >= 80 ? 500_000 : age >= 60 ? 300_000 : 250_000) : 0;
  const steps = regime === "OLD" ? SLABS_OLD : SLABS_NEW;
  let tax = 0;
  for (let i = 0; i < steps.length; i++) {
    const lo = Math.max(steps[i][0], exemption);
    const hi = i + 1 < steps.length ? steps[i + 1][0] : Infinity;
    if (income > lo && hi > lo) tax += (Math.min(income, hi) - lo) * steps[i][1];
  }
  return Math.round(tax);
}
function refTax(taxable: number, regime: "OLD" | "NEW", age: number): number {
  let tax = refSlabTax(taxable, regime, age);
  if (regime === "OLD" && taxable <= 500_000) tax -= Math.min(tax, 12_500); // §87A
  if (regime === "NEW") tax = taxable <= 1_200_000 ? 0 : Math.min(tax, taxable - 1_200_000); // §87A + relief
  const bands = [[5_000_000, 0], [10_000_000, 0.1], [20_000_000, 0.15], [50_000_000, 0.25], [Infinity, 0.37]] as const;
  let surcharge = 0;
  for (let i = 1; i < bands.length; i++) {
    if (taxable > bands[i - 1][0] && taxable <= bands[i][0]) {
      const cap = (r: number) => (regime === "NEW" ? Math.min(r, 0.25) : r);
      const rate = cap(bands[i][1]);
      surcharge = Math.round(tax * rate);
      const at = bands[i - 1][0];
      const ceiling = refSlabTax(at, regime, age) * (1 + cap(bands[i - 1][1])) + (taxable - at); // marginal relief
      if (tax + surcharge > ceiling) surcharge = Math.max(0, Math.round(ceiling - tax));
    }
  }
  return tax + surcharge + Math.round((tax + surcharge) * 0.04);
}
const yearly = (amount: number, f: string) => (f === "M" ? amount * 12 : f === "Q" ? amount * 4 : amount);

function separateFilingTaxReference(d: Household, pick: RegimePick, split = 50): number {
  if (d.insurance.length || d.liabilities.length) throw new Error("reference: 80D/§24 self-occupied not modelled");
  const adults = d.members.filter((m) => m.role === "ADULT");
  const earns = (m: Household["members"][number]) =>
    (m.salary?.annualCTC ?? 0) > 0 ||
    d.businesses.some((b) => b.ownerId === m.id && b.isOperated && b.annualProfit > 0);
  const anchor = (adults.find(earns) ?? adults[0])?.id;
  const s = Math.min(100, Math.max(0, split)) / 100;
  const jointShare = (id: string) =>
    adults.length === 1 ? 1 : adults.length === 2 ? (id === anchor ? s : 1 - s) : 1 / adults.length;
  // origin person → { other heads, house property }; minors are their own origin.
  const heads = new Map<string, number>();
  const hp = new Map<string, number>();
  const add = (into: Map<string, number>, id: string, v: number) => into.set(id, (into.get(id) ?? 0) + v);
  const give = (into: Map<string, number>, ownerId: string, v: number) => {
    if (ownerId === "Joint") for (const a of adults) add(into, a.id, v * jointShare(a.id));
    else add(into, ownerId, v);
  };
  for (const o of d.otherIncome) {
    if (o.isTaxExempt) continue;
    const annual = yearly(o.amount, o.frequency);
    if (o.type === "Rental") {
      give(hp, o.ownerId, Math.max(0, annual - (o.municipalTaxes ?? 0)) * 0.7 - (o.homeLoanInterest ?? 0));
    } else give(heads, o.ownerId, annual);
  }
  for (const b of d.businesses) give(heads, b.ownerId, yearly(b.annualProfit, b.frequency) * (b.sharePercent / 100));
  for (const a of adults) add(heads, a.id, a.salary?.annualCTC ?? 0);
  const capOld = (h: number) => (h >= 0 ? h : -Math.min(-h, 200_000));
  const totalIncome = (id: string) => (heads.get(id) ?? 0) + capOld(hp.get(id) ?? 0);
  // §64(1A): every non-adult origin is clubbed on the adult with the higher total income.
  const clubOn = adults.reduce<string | undefined>(
    (best, a) => (best === undefined || totalIncome(a.id) > totalIncome(best) ? a.id : best),
    undefined,
  );
  const clubbedHeads = new Map<string, number>();
  const clubbedHp = new Map<string, number>();
  const isAdultId = (id: string) => adults.some((a) => a.id === id);
  for (const id of new Set([...heads.keys(), ...hp.keys()])) {
    if (isAdultId(id) || !clubOn) continue;
    add(clubbedHeads, clubOn, heads.get(id) ?? 0);
    add(clubbedHp, clubOn, Math.max(0, hp.get(id) ?? 0));
  }
  const [ay, am, ad] = AS_OF_ISO.split("-").map(Number);
  let total = 0;
  for (const a of adults) {
    const other = (heads.get(a.id) ?? 0) + (clubbedHeads.get(a.id) ?? 0);
    const ownHp = hp.get(a.id) ?? 0;
    const moved = clubbedHp.get(a.id) ?? 0;
    if (other === 0 && ownHp === 0 && moved === 0 && !earns(a)) continue;
    const [by, bm, bd] = (a.dateOfBirth ?? "").split("-").map(Number);
    const age = ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0);
    const own = (type: string) =>
      d.investments
        .filter((i) => i.type === type)
        .reduce((t, i) => t + (i.monthlyContribution ?? 0) * 12 * (i.ownerId === a.id ? 1 : i.ownerId === "Joint" ? jointShare(a.id) : 0), 0);
    if (d.investments.some((i) => !["PPF", "EPF_VPF", "NPS"].includes(i.type))) throw new Error("reference: investment type not modelled");
    const sec80C = Math.min(150_000, own("PPF") + own("EPF_VPF"));
    const sec80CCD1B = Math.min(50_000, own("NPS"));
    const salaried = (a.salary?.annualCTC ?? 0) > 0;
    const employerNps = (regime: "OLD" | "NEW") => {
      const nps = Math.max(0, a.salary?.employerNpsAnnual ?? 0);
      const basic = Math.max(0, a.salary?.basicAnnual ?? 0);
      const ceiling = regime === "NEW" || a.salary?.employerSector === "government" ? 0.14 : 0.1;
      return basic > 0 ? Math.min(nps, ceiling * basic) : nps;
    };
    const oldGross = other + Math.round(capOld(ownHp) + moved);
    const newGross = other + Math.round(Math.max(0, ownHp) + moved);
    const o = refTax(
      Math.max(0, oldGross - (salaried ? 50_000 : 0) - sec80C - sec80CCD1B - employerNps("OLD")),
      "OLD",
      age,
    );
    const n = refTax(Math.max(0, newGross - (salaried ? 75_000 : 0) - employerNps("NEW")), "NEW", age);
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
// Round 6: let-out rentals owned by adults, Joint or MINORS, profitable or loss-making (rent and §24(b) 0–₹25L).
const rentalArb = fc.record({
  owner: fc.nat(),
  rent: fc.integer({ min: 0, max: 2_500_000 }),
  interest: fc.integer({ min: 0, max: 2_500_000 }),
});
const dedArb = fc.record({ owner: fc.nat(), monthly: fc.integer({ min: 0, max: 15_000 }) });
const householdArb = fc.record({
  adults: fc.array(adultArb, { minLength: 1, maxLength: 3 }),
  minors: fc.integer({ min: 0, max: 2 }),
  rows: fc.array(rowArb, { maxLength: 5 }),
  rentals: fc.array(rentalArb, { maxLength: 3 }),
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
  const rentalOwners = [...adultIds, JOINT_DEDUCTION_OWNER, ...minorIds];
  d.otherIncome = [
    ...g.rows.map((r, i) => interest(`r${i}`, owners[r.owner % owners.length], r.amount)),
    ...g.rentals.map((r, i) =>
      rental(`h${i}`, rentalOwners[r.owner % rentalOwners.length], r.rent, r.interest),
    ),
  ];
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
          const sep = separateFilingTaxReference(d, pick, g.split);
          if (rule < sep - 1) throw new Error(`${pick}: rule ${rule} < separate ${sep}`);
        }
      }),
      { numRuns: 1000 },
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
        { memberId: "madhu", name: "Madhu Kushwaha", toMemberId: "abhay", toName: "Abhay Maurya", droppedHouseLoss: 0 },
      ]);
      for (const pick of ["AUTO", "OLD"] as const) {
        expect(ruleTax(d, pick)).toBeGreaterThanOrEqual(separateFilingTaxReference(d, pick));
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

describe("#87 round 5 — house-property losses get no set-off a separate return would not get", () => {
  // ₹15L earner (Abhay) + non-earner (Madhu); flat let at ₹1.2L with ₹4L §24(b) interest:
  // net HP = 1.2L × 0.7 − 4L = −₹3.16L.
  const withFlat = (ownerId: string) =>
    mauryas((x) => {
      x.members.find((m) => m.id === "abhay")!.salary!.annualCTC = 1_500_000;
      x.otherIncome = ownerId ? [rental("flat", ownerId, 120_000, 400_000)] : [];
      x.investments = []; // round 6: the independent reference models 80C/80CCD only
      x.insurance = [];
      x.liabilities = [];
    });

  it("a non-earner's sole let-out loss is claimed by nobody: tax equals the no-flat household", () => {
    for (const pick of ["AUTO", "OLD", "NEW"] as const) {
      expect(ruleTax(withFlat("madhu"), pick)).toBe(ruleTax(withFlat(""), pick));
    }
    const r = tax(withFlat("madhu"));
    expect(r.attributedNonEarners.find((a) => a.memberId === "madhu")!.droppedHouseLoss).toBe(316_000);
  });

  it("a Joint flat: the earner keeps their half of the loss (OLD set-off); the non-earner's half is dropped", () => {
    const d = withFlat(JOINT_DEDUCTION_OWNER);
    const r = tax(d);
    expect(who(r, "abhay")!.incomeRows["inc:flat"]).toBeCloseTo(-158_000, 6);
    expect(r.attributedNonEarners.find((a) => a.memberId === "madhu")!.droppedHouseLoss).toBe(158_000);
    for (const pick of ["AUTO", "OLD", "NEW"] as const) {
      expect(ruleTax(d, pick)).toBe(separateFilingTaxReference(d, pick));
    }
  });

  it("a non-earner's PROFITABLE flat still moves to the earner", () => {
    const d = mauryas((x) => {
      x.otherIncome = [rental("flat", "madhu", 600_000, 100_000)];
    });
    const r = tax(d);
    expect(who(r, "abhay")!.incomeRows["inc:flat"]).toBeCloseTo(320_000, 6);
    expect(r.attributedNonEarners.find((a) => a.memberId === "madhu")!.droppedHouseLoss).toBe(0);
  });

  it("NEW regime: an assessee's own let-out loss is not set off; tax on salary as if HP were 0 (#236)", () => {
    const withLoss = who(tax(withFlat("abhay")), "abhay")!;
    const noFlat = who(tax(withFlat("")), "abhay")!;
    expect(withLoss.newGrossIncome).toBe(noFlat.newGrossIncome);
    expect(withLoss.newTax).toBe(noFlat.newTax);
    expect(ruleTax(withFlat("abhay"), "NEW")).toBe(ruleTax(withFlat(""), "NEW"));
    // OLD keeps §71: −₹3.16L capped at −₹2L.
    expect(withLoss.oldGrossIncome).toBe(noFlat.oldGrossIncome - 200_000);
    expect(withLoss.oldTax).toBeLessThan(noFlat.oldTax);
  });
});

describe("#87 round 6 — house property is composed per person, never netted across people", () => {
  // ₹15L earner (Abhay) + non-earner (Madhu) + minor (Myra); no deductions.
  const hh = (rentals: Household["otherIncome"]) =>
    mauryas((x) => {
      x.members.find((m) => m.id === "abhay")!.salary!.annualCTC = 1_500_000;
      x.otherIncome = rentals;
      x.investments = [];
      x.insurance = [];
      x.liabilities = [];
    });

  it("case A: a non-earner's ₹14L rental profit does not absorb the earner's own ₹20L loss", () => {
    const d = hh([rental("own", "abhay", 0, 2_000_000), rental("moved", "madhu", 2_000_000, 0)]);
    const abhay = who(tax(d), "abhay")!;
    const base = who(tax(hh([])), "abhay")!;
    // OLD: own −₹20L capped at −₹2L, then +₹14L moved in. NEW: own floored at 0, then +₹14L.
    expect(abhay.oldGrossIncome).toBe(base.oldGrossIncome - 200_000 + 1_400_000);
    expect(abhay.newGrossIncome).toBe(base.newGrossIncome + 1_400_000);
    for (const pick of ["AUTO", "OLD", "NEW"] as const) {
      expect(ruleTax(d, pick)).toBeGreaterThanOrEqual(separateFilingTaxReference(d, pick));
    }
  });

  it("case B: a minor's let-out loss is claimed by nobody (OLD and NEW) and is reported", () => {
    const noFlat = hh([]);
    const d = hh([rental("myra-flat", "myra", 120_000, 400_000)]);
    for (const pick of ["AUTO", "OLD", "NEW"] as const) {
      expect(ruleTax(d, pick)).toBe(ruleTax(noFlat, pick));
      expect(ruleTax(d, pick)).toBeGreaterThanOrEqual(separateFilingTaxReference(d, pick));
    }
    const myra = tax(d).attributedNonEarners.find((a) => a.memberId === "myra")!;
    expect(myra.droppedHouseLoss).toBe(316_000);
  });

  it("case B (NEW): a minor's loss is not netted against the earner's own rental profit", () => {
    const own = rental("own", "abhay", 1_428_572, 0);
    const d = hh([own, rental("myra-flat", "myra", 120_000, 584_000)]);
    for (const pick of ["AUTO", "OLD", "NEW"] as const) {
      expect(ruleTax(d, pick)).toBe(ruleTax(hh([own]), pick));
    }
  });

  it("a minor's PROFITABLE flat is clubbed on the target earner on top of the earner's own loss", () => {
    const d = hh([rental("own", "abhay", 0, 500_000), rental("myra-flat", "myra", 1_000_000, 0)]);
    const abhay = who(tax(d), "abhay")!;
    const base = who(tax(hh([])), "abhay")!;
    expect(abhay.oldGrossIncome).toBe(base.oldGrossIncome - 200_000 + 700_000);
    expect(abhay.newGrossIncome).toBe(base.newGrossIncome + 700_000);
  });
});
