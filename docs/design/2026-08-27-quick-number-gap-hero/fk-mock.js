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
  function compute(i) {
    const n = Math.max(0, i.targetAge - i.age);
    const R = i.equityReturn, g = i.stepUp, infl = i.inflation, swr = i.swr;
    const growth = Math.pow(1 + R, n);
    // FV of corpus + monthly SIP with annual step-up, nominal
    let fvSip = 0;
    for (let t = 0; t < n; t++) fvSip += i.sip * 12 * Math.pow(1 + g, t) * Math.pow(1 + R, n - t);
    let annuity = 0;
    for (let t = 0; t < n; t++) annuity += 12 * Math.pow(1 + g, t) * Math.pow(1 + R, n - t);
    const deflate = Math.pow(1 + infl, n);
    const corpus = i.corpus + (i.includeSpouse ? i.spouseCorpus : 0);
    const haveReal = (corpus * growth + fvSip) / deflate;
    // Need, in today's rupees: perpetual spend / SWR + one-shot goals (today-rupee lumps)
    const goals = i.education + i.postgrad + i.wedding + (i.includeHouse ? i.house : 0);
    const needReal = (i.spend * 12) / swr + goals;
    const gapReal = needReal - haveReal;
    const annuityReal = annuity / deflate;
    const requiredSip = annuityReal > 0 ? Math.max(0, i.sip + gapReal / annuityReal) : Infinity;
    // FIRE age at current SIP: first age where haveReal(n) >= needReal
    let fireAge = null;
    for (let a = i.age; a <= 90; a++) {
      const r = compute1(i, a);
      if (r.have >= r.need) { fireAge = a; break; }
    }
    return { n, needReal, haveReal, gapReal, requiredSip, fireAge, deflate, goals,
             needNominal: needReal * deflate, haveNominal: haveReal * deflate };
  }
  function compute1(i, targetAge) { // helper for fire-age search (no recursion into fireAge)
    const n = Math.max(0, targetAge - i.age);
    const R = i.equityReturn, g = i.stepUp, infl = i.inflation;
    let fvSip = 0;
    for (let t = 0; t < n; t++) fvSip += i.sip * 12 * Math.pow(1 + g, t) * Math.pow(1 + R, n - t);
    const corpus = i.corpus + (i.includeSpouse ? i.spouseCorpus : 0);
    const have = (corpus * Math.pow(1 + R, n) + fvSip) / Math.pow(1 + infl, n);
    const goals = i.education + i.postgrad + i.wedding + (i.includeHouse ? i.house : 0);
    const need = (i.spend * 12) / i.swr + goals;
    return { have, need };
  }
  // Amit from the Dezerv video (FbYnFUwdODQ), in FireKaro's honest defaults
  const AMIT = { age: 38, targetAge: 50, spend: 2.8 * L, corpus: 80 * L, spouseCorpus: 70 * L, includeSpouse: true,
    sip: 1.75 * L, kids: 2, kidsAge: 6, education: 75 * L, postgrad: 1.5 * CR, wedding: 50 * L, house: 1 * CR,
    includeHouse: true, ownHouse: true, inflation: 0.06, equityReturn: 0.12, swr: 0.035, stepUp: 0, planToAge: 90 };
  return { inr, compute, AMIT, L, CR };
})();
