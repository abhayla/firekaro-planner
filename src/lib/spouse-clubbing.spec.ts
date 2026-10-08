/**
 * #87 round 3 (per round-2 FinTech + code review) — WHO files each row, and the per-row
 * conservation law, tested on the REAL seeds.
 *
 *  1. §64(1)(iv) / §27(i) clubbing (D-2026-10-08-02): a SPOUSE with no own income source (no salary,
 *     no operated business) in a household where an adult earns does not file on her share of a
 *     row — it is clubbed to the earning spouse. A non-spouse adult co-owner still files; when both
 *     spouses earn, nothing is clubbed.
 *  2. A row owned by a minor goes 100% to the anchor adult (§64(1A)) — never dropped.
 *  3. Conservation, PER ROW: for every income row and every Joint/adult-owned deduction row, the
 *     shares handed to the people who file sum to exactly that row, at split 50 and 70.
 */
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
  deductionOwnerWeight,
  incomeRowShares,
  jointAnchorMemberId,
  perAssesseeHouseholdTax,
  spouseClubbing,
} from "@/lib/tax-deductions";
import { toAnnual } from "@/lib/cashflow";
import { isAdultRole, type Household } from "@/types/household";

const FY = "2025-26";
const AS_OF = new Date("2025-10-01T00:00:00");

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
const who = (r: ReturnType<typeof tax>, id: string) => r.perAssessee.find((x) => x.memberId === id);
const interest = (ownerId: string, amount: number) =>
  ({
    id: `probe-${ownerId}`,
    type: "Interest",
    source: "Direct",
    label: "probe interest",
    ownerId,
    amount,
    frequency: "A",
    isTaxExempt: false,
  }) as Household["otherIncome"][number];

describe("#87 round 3 — §64(1)(iv) spouse clubbing (D-2026-10-08-02)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("Mauryas: the homemaker spouse's half of the Joint rental + FD is taxed on the earning spouse", () => {
    const d = mauryas();
    expect(spouseClubbing(d, d.members.filter((m) => isAdultRole(m.role))).get("madhu")).toBe("abhay");
    const r = tax(d);
    expect(r.perAssessee.map((x) => x.memberId)).toEqual(["abhay"]);
    // Clubbing never lowers the bill: un-clubbed (Madhu as a non-spouse co-owner) is cheaper.
    const unclubbed = tax(mauryas((x) => (x.members.find((m) => m.id === "madhu")!.relation = "Sister")));
    expect(who(unclubbed, "madhu")!.grossIncome).toBeGreaterThan(0);
    expect(r.totalTax).toBeGreaterThan(unclubbed.totalTax);
    // Every taxable rupee of the household lands on Abhay's return.
    expect(who(r, "abhay")!.grossIncome).toBe(
      who(unclubbed, "abhay")!.grossIncome + who(unclubbed, "madhu")!.grossIncome,
    );
  });

  it("a non-spouse adult co-owner still files on her own share", () => {
    const r = tax(mauryas((x) => (x.members.find((m) => m.id === "madhu")!.relation = "Mother")));
    expect(who(r, "madhu")).toBeDefined();
    expect(who(r, "madhu")!.grossIncome).toBeGreaterThan(0);
  });

  it("both spouses earn → no clubbing: the spouse files salary + her own Joint share", () => {
    const d = mauryas((x) => {
      x.members.find((m) => m.id === "madhu")!.salary = { annualCTC: 600_000, hikePercent: 5 } as never;
    });
    expect(spouseClubbing(d, d.members.filter((m) => isAdultRole(m.role))).size).toBe(0);
    expect(who(tax(d), "madhu")!.grossIncome).toBeGreaterThan(600_000);
  });

  it("nobody earns → no clubbing: the spouse files her own share", () => {
    const d = mauryas((x) => {
      x.members.find((m) => m.id === "abhay")!.salary!.annualCTC = 0;
      x.businesses = [];
    });
    expect(spouseClubbing(d, d.members.filter((m) => isAdultRole(m.role))).size).toBe(0);
    expect(who(tax(d), "madhu")!.grossIncome).toBeGreaterThan(0);
  });

  it("the clubbed spouse's Joint 80C share is claimed by the earning spouse, not lost", () => {
    const d = mauryas();
    for (const inv of d.investments.filter((i) => i.ownerId === "Joint")) {
      expect(deductionOwnerWeight(d, ["abhay", "madhu"], inv.ownerId, 70)).toBe(1);
    }
  });
});

describe("#87 round 3 — a minor-owned row goes to the anchor adult (§64(1A))", () => {
  it("₹3L interest owned by Myra (a minor) lands 100% on Abhay; nothing dropped", () => {
    const base = tax(mauryas());
    const r = tax(mauryas((x) => x.otherIncome.push(interest("myra", 300_000))));
    expect(who(r, "abhay")!.grossIncome - who(base, "abhay")!.grossIncome).toBe(300_000);
    expect(r.perAssessee.reduce((s, x) => s + x.grossIncome, 0)).toBe(
      base.perAssessee.reduce((s, x) => s + x.grossIncome, 0) + 300_000,
    );
    expect(r.totalTax).toBeGreaterThan(base.totalTax);
  });
});

describe("#87 round 3 — conservation law, PER ROW, on the real seeds at split 50 and 70", () => {
  for (const [name, load] of SEEDS) {
    for (const split of [50, 70]) {
      it(`${name} @ split ${split}: every income row and every deduction row is shared out exactly once`, () => {
        const d = seed(load);
        const adults = d.members.filter((m) => isAdultRole(m.role));
        const clubbing = spouseClubbing(d, adults);
        const anchor = jointAnchorMemberId(d)!;
        const filers = adults.filter((m) => !clubbing.has(m.id));
        const claimantsOf = (id: string) => [id, ...[...clubbing].filter(([, to]) => to === id).map(([f]) => f)];

        const rows = [
          ...d.otherIncome.filter((o) => !o.isTaxExempt).map((o) => o.ownerId),
          ...d.businesses.map((b) => b.ownerId),
        ];
        expect(rows.length + d.investments.length, "the law must test real rows").toBeGreaterThan(0);
        for (const ownerId of rows) {
          const shares = incomeRowShares(d, adults, anchor, ownerId, split, clubbing);
          const sum = [...shares.values()].reduce((s, w) => s + w, 0);
          expect(sum, `${name} income row owned by ${ownerId}`).toBeCloseTo(1, 12);
          for (const id of shares.keys()) expect(clubbing.has(id), `${id} is clubbed`).toBe(false);
        }
        // Rental relief (30% §24a, municipal tax, §24b interest) is computed per row × that row's
        // share, so the per-person rental nets also sum to the row's own net.
        for (const o of d.otherIncome.filter((x) => x.type === "Rental" && !x.isTaxExempt)) {
          const annual = toAnnual({ amount: o.amount, period: o.frequency });
          const net = Math.max(0, annual - (o.municipalTaxes ?? 0)) * 0.7 - (o.homeLoanInterest ?? 0);
          const shares = incomeRowShares(d, adults, anchor, o.ownerId, split, clubbing);
          const parts = [...shares.values()].map((w) => w * net);
          expect(parts.reduce((s, x) => s + x, 0)).toBeCloseTo(net, 6);
        }
        for (const inv of d.investments) {
          if (inv.ownerId !== "Joint" && !adults.some((m) => m.id === inv.ownerId)) continue;
          const sum = filers.reduce(
            (s, f) => s + deductionOwnerWeight(d, claimantsOf(f.id), inv.ownerId, split),
            0,
          );
          expect(sum, `${name} deduction row ${inv.type} owned by ${inv.ownerId}`).toBeCloseTo(1, 12);
        }
      });
    }
  }
});
