import { describe, it, expect } from "vitest";
import { firekaroUserToZohoLead, FIREKARO_LEAD_SOURCE } from "./zoho-lead-mapping";

/**
 * FireKaro signup -> Zoho Lead mapping. Pins: Lead_Source is always "FireKaro",
 * Last_Name is always non-empty (Zoho-required), name splitting, contact handles
 * pass through, and NO financial PII ever appears in the payload.
 */

describe("firekaroUserToZohoLead", () => {
  it("always tags Lead_Source = FireKaro", () => {
    expect(firekaroUserToZohoLead({ name: "A B" }).Lead_Source).toBe(FIREKARO_LEAD_SOURCE);
  });

  it("splits a multi-word name into First/Last", () => {
    const p = firekaroUserToZohoLead({ name: "Abhay Kumar Maurya" });
    expect(p.First_Name).toBe("Abhay Kumar");
    expect(p.Last_Name).toBe("Maurya");
  });

  it("uses a single-word name as Last_Name with no First_Name", () => {
    const p = firekaroUserToZohoLead({ name: "Abhay" });
    expect(p.Last_Name).toBe("Abhay");
    expect(p.First_Name).toBeUndefined();
  });

  it("falls back to the email local-part when no name", () => {
    const p = firekaroUserToZohoLead({ name: "", email: "abhay@firekaro.com" });
    expect(p.Last_Name).toBe("abhay");
    expect(p.Email).toBe("abhay@firekaro.com");
  });

  it("falls back to phone, then a literal, when no name or email", () => {
    expect(firekaroUserToZohoLead({ phone: "917972672473" }).Last_Name).toBe("917972672473");
    expect(firekaroUserToZohoLead({}).Last_Name).toBe("FireKaro Lead");
  });

  it("passes through trimmed email + phone", () => {
    const p = firekaroUserToZohoLead({ name: "A B", email: "  x@y.com ", phone: " 9199 " });
    expect(p.Email).toBe("x@y.com");
    expect(p.Phone).toBe("9199");
  });

  it("omits Email/Phone when absent", () => {
    const p = firekaroUserToZohoLead({ name: "Solo" });
    expect(p.Email).toBeUndefined();
    expect(p.Phone).toBeUndefined();
  });

  it("NEVER includes financial PII — only the whitelisted keys are present", () => {
    const p = firekaroUserToZohoLead({ name: "Abhay Kumar", email: "a@b.com", phone: "9199" });
    expect(new Set(Object.keys(p))).toEqual(
      new Set(["Last_Name", "First_Name", "Email", "Phone", "Lead_Source", "Description"]),
    );
  });
});
