import { describe, it, expect } from "vitest";
import {
  TERM_GLOSSARY,
  GLOSSARY_CATEGORY,
  GLOSSARY_CATEGORIES,
  glossaryItems,
  glossaryCategory,
  searchGlossary,
  type TermKey,
  type GlossaryEntry,
} from "./glossary";

describe("TERM_GLOSSARY", () => {
  it("contains at least 25 entries (Q7 minimum)", () => {
    expect(Object.keys(TERM_GLOSSARY).length).toBeGreaterThanOrEqual(25);
  });

  it("every entry has a label and explanation", () => {
    for (const [key, entry] of Object.entries(TERM_GLOSSARY)) {
      expect(entry.label, `${key}.label`).toBeTruthy();
      expect(entry.label.length, `${key}.label length`).toBeGreaterThan(0);
      expect(entry.explanation, `${key}.explanation`).toBeTruthy();
      expect(entry.explanation.length, `${key}.explanation length`).toBeGreaterThan(10);
    }
  });

  it("formulas are non-empty when present", () => {
    for (const [key, rawEntry] of Object.entries(TERM_GLOSSARY)) {
      const entry = rawEntry as GlossaryEntry;
      if (entry.formula !== undefined) {
        expect(entry.formula.length, `${key}.formula length`).toBeGreaterThan(0);
      }
    }
  });

  it("required core terms are present", () => {
    const required: TermKey[] = [
      "fire-number",
      "swr",
      "dti",
      "freedom-score",
      "emergency-fund-coverage",
      "savings-rate",
      "net-worth",
      "ctc",
      "hlv",
      "80c",
      "80d",
      "section-24",
      "epf-vpf",
      "ppf",
      "nps",
      "esop",
      "lean-fire",
      "fat-fire",
      "coast-fire",
    ];
    for (const k of required) {
      expect(TERM_GLOSSARY[k], `term ${k} present`).toBeTruthy();
    }
  });
});

describe("glossary categorization + search (A33.3)", () => {
  it("every term has a category (exhaustive map)", () => {
    for (const key of Object.keys(TERM_GLOSSARY) as TermKey[]) {
      expect(GLOSSARY_CATEGORY[key], `category for ${key}`).toBeTruthy();
      expect(GLOSSARY_CATEGORIES).toContain(glossaryCategory(key));
    }
  });

  it("glossaryItems() returns every term, label-sorted, with a category", () => {
    const items = glossaryItems();
    expect(items.length).toBe(Object.keys(TERM_GLOSSARY).length);
    const labels = items.map((i) => i.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(items.every((i) => GLOSSARY_CATEGORIES.includes(i.category))).toBe(true);
  });

  it("searchGlossary filters by free-text on label + explanation + key", () => {
    const items = glossaryItems();
    const byLabel = searchGlossary(items, "Coast");
    expect(byLabel.some((i) => i.key === "coast-fire")).toBe(true);
    const byExplanation = searchGlossary(items, "annuity");
    expect(byExplanation.some((i) => i.key === "nps")).toBe(true);
    expect(searchGlossary(items, "zzzznotaterm")).toHaveLength(0);
  });

  it("searchGlossary filters by category", () => {
    const items = glossaryItems();
    const tax = searchGlossary(items, "", "Tax");
    expect(tax.length).toBeGreaterThan(0);
    expect(tax.every((i) => i.category === "Tax")).toBe(true);
    expect(searchGlossary(items, "", "All").length).toBe(items.length);
  });
});
