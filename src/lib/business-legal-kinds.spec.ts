import { describe, expect, it } from "vitest";
import {
  BUSINESS_LEGAL_KINDS,
  buildBusinessKindColumns,
  businessPersonalShare,
  labelForLegalKind,
} from "./business-legal-kinds";
import type { Business } from "@/types/household";

function biz(over: Partial<Business>): Business {
  return {
    id: over.id ?? "biz-x",
    name: over.name ?? "Biz",
    legalKind: over.legalKind ?? "SoleProp",
    annualProfit: over.annualProfit ?? 0,
    frequency: over.frequency ?? "A",
    sharePercent: over.sharePercent ?? 100,
    ownerId: over.ownerId ?? "you",
    isOperated: over.isOperated ?? true,
  };
}

describe("labelForLegalKind", () => {
  it("maps kinds to labels and tolerates absent input", () => {
    expect(labelForLegalKind("PvtLtd")).toBe("Private Limited");
    expect(labelForLegalKind(undefined)).toBe("—");
  });
});

describe("businessPersonalShare", () => {
  it("annualizes profit × share%", () => {
    expect(businessPersonalShare(biz({ annualProfit: 1200000, sharePercent: 75 }))).toBe(900000);
    expect(businessPersonalShare(biz({ annualProfit: 100000, frequency: "M", sharePercent: 50 }))).toBe(600000);
  });
});

describe("buildBusinessKindColumns — the #158 reachability invariant", () => {
  it("a ZERO-profit business still gets its kind's column (must stay visible/editable/deletable)", () => {
    const cols = buildBusinessKindColumns([
      biz({ id: "pifs", name: "PIFS", legalKind: "PvtLtd", annualProfit: 0, sharePercent: 75 }),
    ]);
    expect(cols).toHaveLength(1);
    expect(cols[0].kind).toBe("PvtLtd");
    expect(cols[0].total).toBe(0);
    expect(cols[0].entries.map((e) => e.id)).toEqual(["pifs"]);
  });

  it("EVERY active business appears in exactly one column, regardless of share", () => {
    const list = [
      biz({ id: "a", legalKind: "SoleProp", annualProfit: 500000 }),
      biz({ id: "b", legalKind: "PvtLtd", annualProfit: 0 }),
      biz({ id: "c", legalKind: "LLP", annualProfit: 300000 }),
      biz({ id: "d", legalKind: "PvtLtd", annualProfit: 200000 }),
    ];
    const cols = buildBusinessKindColumns(list);
    const placed = cols.flatMap((c) => c.entries.map((e) => e.id)).sort();
    expect(placed).toEqual(["a", "b", "c", "d"]);
    for (const c of cols) for (const e of c.entries) expect(e.legalKind).toBe(c.kind);
  });

  it("columns sort by money total desc; zero-total columns come last; entries sort by share desc within a column", () => {
    const cols = buildBusinessKindColumns([
      biz({ id: "zero", legalKind: "HUF", annualProfit: 0 }),
      biz({ id: "small", legalKind: "SoleProp", annualProfit: 100000 }),
      biz({ id: "big", legalKind: "PvtLtd", annualProfit: 900000 }),
      biz({ id: "smaller-sib", legalKind: "PvtLtd", annualProfit: 100000 }),
    ]);
    expect(cols.map((c) => c.kind)).toEqual(["PvtLtd", "SoleProp", "HUF"]);
    expect(cols[0].entries.map((e) => e.id)).toEqual(["big", "smaller-sib"]);
    expect(cols[0].total).toBe(1000000);
  });

  it("empty input yields no columns", () => {
    expect(buildBusinessKindColumns([])).toEqual([]);
  });

  it("covers every legal kind, and all-zero ties keep canonical kind order (stable sort lock)", () => {
    const all = BUSINESS_LEGAL_KINDS.map((k, i) => biz({ id: `k${i}`, legalKind: k.value, annualProfit: 0 }));
    const cols = buildBusinessKindColumns(all);
    expect(cols.map((c) => c.kind)).toEqual(BUSINESS_LEGAL_KINDS.map((k) => k.value));
  });
});
