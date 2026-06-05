-- gh-issue #32: §24(b) home-loan interest + municipal taxes for let-out rental house property.
-- Both are ANNUAL amounts on a Rental other-income line. They reduce TAXABLE house-property income
-- only (NAV = GAV − municipal taxes; income = NAV·70% − §24b interest; §71 caps a loss set-off at
-- ₹2L/yr), never the CASH the landlord receives. Nullable/additive with @default(0) — existing rows
-- read back as 0 ⇒ no behaviour change for non-leveraged rentals.
ALTER TABLE "other_income_lines" ADD COLUMN "homeLoanInterest" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "other_income_lines" ADD COLUMN "municipalTaxes" DOUBLE PRECISION DEFAULT 0;
