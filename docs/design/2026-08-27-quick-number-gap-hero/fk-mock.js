/* Shared mock math for the 2026-08-27 "Quick Number + gap hero" design options.
 * DESIGN MOCKUP ONLY — transparent, simplified real-frame math so the page feels alive.
 * The product kernel (src/lib/derive.ts) stays the only source of truth for real numbers.
 * Assumptions default to FireKaro's DEFAULT_ASSUMPTIONS (inflation 6%, equity 12%, SWR 3.5%, step-up 0). */
const FK = (() => {
  const L = 1e5, CR = 1e7;
  function inr(n) {
    const a = Math.abs(n), s = n < 0 ? "−" : "";
    if (a >= CR) return s + "₹" + (a / CR).toFixed(a >= 10 * CR ? 1 : 2) + " Cr";
    if (a >= L) return s + "₹" + (a / L).toFixed(a >= 10 * L ? 1 : 2) + " L";
    return s + "₹" + Math.round(a).toLocaleString("en-IN");
  }
  // Horizon-driven SWR (mirrors the product's resolveEffectiveSWRByHorizon in spirit): the base SWR is
  // calibrated for a 40-year drawdown; every year the drawdown is shorter than 40 adds 5 bps, capped at +1%.
  function effSwr(i, targetAge) {
    const horizon = (i.planToAge || 90) - targetAge;
    return i.swr + Math.min(0.01, Math.max(0, (40 - horizon) * 0.0005));
  }
  // Monthly contribution in year t (0-based): SIP with annual step-up, plus the EMI rolled into
  // investing once the loan ends (only when the "don't prepay, roll the EMI over" lever is on).
  function contribAt(i, t) {
    let m = i.sip * Math.pow(1 + i.stepUp, t);
    if (i.rollEmi && i.emi > 0 && t >= (i.loanYearsLeft || 0)) m += i.emi;
    return m;
  }
  function project(i, targetAge) {
    const n = Math.max(0, targetAge - i.age), R = i.equityReturn, infl = i.inflation;
    let fvSip = 0, annuity = 0;
    for (let t = 0; t < n; t++) { fvSip += contribAt(i, t) * 12 * Math.pow(1 + R, n - t); annuity += 12 * Math.pow(1 + i.stepUp, t) * Math.pow(1 + R, n - t); }
    const deflate = Math.pow(1 + infl, n);
    const corpus = i.corpus + (i.includeSpouse ? i.spouseCorpus : 0);
    const have = (corpus * Math.pow(1 + R, n) + fvSip) / deflate;
    const goals = i.education + i.postgrad + i.wedding + (i.includeHouse ? i.house : 0);
    const swr = effSwr(i, targetAge);
    const need = (i.spend * 12) / swr + goals;
    return { n, have, need, goals, swr, deflate, annuityReal: annuity / deflate };
  }
  function compute(i) {
    const p = project(i, i.targetAge);
    const gapReal = p.need - p.have;
    const requiredSip = p.annuityReal > 0 ? Math.max(0, i.sip + gapReal / p.annuityReal) : Infinity;
    let fireAge = null;
    for (let a = i.age; a <= 90; a++) { const q = project(i, a); if (q.have >= q.need) { fireAge = a; break; } }
    return { n: p.n, needReal: p.need, haveReal: p.have, gapReal, requiredSip, fireAge, deflate: p.deflate, goals: p.goals,
             swrUsed: p.swr, needNominal: p.need * p.deflate, haveNominal: p.have * p.deflate };
  }
  // Levers — the "how to get there" moves. Each returns the inputs with ONE change applied so the
  // hero can show its individual effect; applyPlan() stacks the ones the user switches on.
  const LEVERS = [
    { key: "stepup",  label: "Raise investing 10% every year", note: "salary hikes → SIP hikes; the single biggest lever", apply: i => ({ ...i, stepUp: Math.max(i.stepUp, 0.10) }) },
    { key: "delay",   label: "Retire 3 years later",           note: "3 more years of investing, 3 fewer to fund",        apply: i => ({ ...i, targetAge: i.targetAge + 3 }) },
    { key: "trim",    label: "Trim spending 10%",              note: "lower spend lowers the target AND frees cash to invest", apply: i => ({ ...i, spend: i.spend * 0.9, sip: i.sip + i.spend * 0.1 }) },
    { key: "direct",  label: "Move to direct mutual funds",    note: "~0.8% lower fees ≈ +0.8% return, for free",         apply: i => ({ ...i, equityReturn: i.equityReturn + 0.008 }) },
    { key: "noprepay",label: "Don't prepay the home loan — roll the EMI into investing when it ends", note: "your loan rate is below what investing earns; keep it, and the day the EMI stops, invest it", apply: i => ({ ...i, rollEmi: true }),
      available: i => i.hasLoan && i.emi > 0 && i.loanRate < i.equityReturn },
  ];
  function applyPlan(i, on) { return LEVERS.filter(l => on.has(l.key)).reduce((acc, l) => l.apply(acc), i); }
  // Amit from the Dezerv video (FbYnFUwdODQ), in FireKaro's honest defaults
  const AMIT = { guess: 10 * CR, age: 38, targetAge: 50, spend: 2.8 * L, income: 5 * L, corpus: 80 * L, spouseCorpus: 70 * L, includeSpouse: true,
    sip: 1.75 * L, kids: 2, kidsAge: 6, education: 75 * L, postgrad: 1.5 * CR, wedding: 50 * L, house: 1 * CR,
    includeHouse: true, hasLoan: true, emi: 1 * L, loanRate: 0.072, loanYearsLeft: 7, rollEmi: false,
    inflation: 0.06, equityReturn: 0.12, swr: 0.035, stepUp: 0, planToAge: 90 };
  return { inr, compute, effSwr, applyPlan, LEVERS, AMIT, L, CR };
})();
