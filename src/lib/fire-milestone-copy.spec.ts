import { describe, it, expect } from "vitest";
import { coastFireBlurb, baristaFireBlurb } from "./fire-milestone-copy";

// gh #39 (new-user path): the Coast/Barista descriptive copy must NOT assert the
// "you've effectively coasted / no contributions needed" framing when there is no FIRE
// target (a zero-data new user). It must show an honest "add your data" prompt instead.

describe("coastFireBlurb", () => {
  it("with a real FIRE target: shows the stop-saving framing with the corpus", () => {
    const s = coastFireBlurb(true, "₹2.50 Cr");
    expect(s).toContain("₹2.50 Cr");
    expect(s).toMatch(/no additional contributions needed/i);
  });

  it("gh #39: NO target → honest prompt, never the false 'compounds to your full FIRE / no contributions needed'", () => {
    const s = coastFireBlurb(false, "₹0");
    expect(s).not.toMatch(/no additional contributions needed/i);
    expect(s).not.toMatch(/compounds to your full FIRE/i);
    expect(s).not.toContain("₹0");
    expect(s).toMatch(/add your income/i);
  });
});

describe("baristaFireBlurb", () => {
  it("with a real FIRE target: shows the part-time framing with the corpus", () => {
    const s = baristaFireBlurb(true, "₹1.20 Cr");
    expect(s).toContain("₹1.20 Cr");
    expect(s).toMatch(/part-time/i);
  });

  it("gh #39: NO target → honest prompt, never the false 'corpus + half-time income covers expenses'", () => {
    const s = baristaFireBlurb(false, "₹0");
    expect(s).not.toMatch(/covers expenses/i);
    expect(s).not.toContain("₹0");
    expect(s).toMatch(/add your income/i);
  });
});
