import { describe, it, expect } from "vitest";
import { ratio } from "./funnel-ratio";

describe("#44 funnel report ratios", () => {
  it("prints a real percentage when there is a denominator", () => {
    expect(ratio(25, 100)).toBe("25.0%");
    expect(ratio(1, 3)).toBe("33.3%");
    expect(ratio(0, 40)).toBe("0.0%");
  });

  it("prints n/a — never a fake 0% — when nobody has entered the funnel", () => {
    expect(ratio(0, 0)).toContain("n/a");
    expect(ratio(5, 0)).toContain("n/a");
  });
});
