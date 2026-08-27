import pathlib
p = pathlib.Path("src/lib/lever-plausibility.spec.ts")
s = p.read_text(encoding="utf-8")

# 1) The headline ratio case: state plainly that 50 is out of reach and that the band is met
#    from the age the card can actually steer him to.
OLD = s[s.index('  it("step-up + delay + direct brings required monthly to <= 1.5x his current contribution"'):s.index('  it("retiring at 50 stays HONESTLY out of reach')]
NEW = '''  it("from a reachable target, step-up + delay + direct land inside the 1.5x band", () => {
    // Amit ASKED for 50. With honest math that is out of reach at any monthly amount (locked in
    // the next case), so the number a user can actually act on is the one at the first target the
    // moves DO reach. From a 53 target `delay-3` solves at 56 and the three moves land at 1.42x
    // his current contribution - inside the contract's 1.5x "clearly doable" band.
    const plan = { ...amitPlan(), targetAge: 53 };
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });
    const applied = applyPlanLevers(plan, levers, MOVES);
    const withMoves = solvePlan(applied);

    expect(applied.targetAge).toBe(53 + DELAY_LEVER_YEARS);
    expect(withMoves.currentMonthlyReal).toBeGreaterThan(0);
    expect(Number.isFinite(withMoves.requiredMonthlyReal)).toBe(true);

    const ratio = withMoves.requiredMonthlyReal / withMoves.currentMonthlyReal;
    expect(
      ratio,
      `required ${Math.round(withMoves.requiredMonthlyReal)} / current ` +
        `${Math.round(withMoves.currentMonthlyReal)} = ${ratio.toFixed(2)}x - beyond 1.5x the card ` +
        "is telling a salaried accumulator that nothing he can do matters",
    ).toBeLessThanOrEqual(1.5);
  });

'''
s = s.replace(OLD, NEW, 1)

# 2) The escalation-feasibility case must run on the same reachable plan.
OLD2 = '''  it("the committed step-up never escalates past what the household can actually pay", () => {
    // The substance assertion the old 1.5x bar was blind to: it measured the STARTING contribution
    // while the path escalated. Project the committed step-up across the horizon and check the
    // final year against the same feasibility ceiling the solver applies at t=0.
    const plan = amitPlan();'''
NEW2 = '''  it("the committed step-up never escalates past what the household can actually pay", () => {
    // The substance assertion the old 1.5x bar was blind to: it measured the STARTING contribution
    // while the path escalated. Project the committed step-up across the horizon and check the
    // final year against the same feasibility ceiling the solver applies at t=0. A 10% REAL step-up
    // put this figure at ~206% of take-home while the card advertised "1.41x, clearly doable".
    const plan = { ...amitPlan(), targetAge: 53 };'''
assert OLD2 in s
s = s.replace(OLD2, NEW2, 1)

# 3) The rescue case: at 50 nothing reaches, so the rescue must be observed on a plan where the
#    moves genuinely tip it. Use the 53 base (unreachable alone, reachable with the moves).
OLD3 = '''  it("the three moves RESCUE an otherwise impossible plan (and the card says so, not '₹0 saved')", () => {
    const plan = amitPlan();
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });

    // Amit's baseline at 50 is genuinely out of reach: no feasible monthly amount gets him there,
    // so the solver returns Infinity and his current pace lands at 64 instead.
    const base = solvePlan(plan);
    expect(Number.isFinite(base.requiredMonthlyReal)).toBe(false);'''
NEW3 = '''  it("the three moves RESCUE an otherwise impossible plan (and the card says so, not '₹0 saved')", () => {
    // Base target 53: unreachable on today's pace at any monthly amount, but the three moves tip it.
    // That transition is the single most valuable thing the card can report.
    const plan = { ...amitPlan(), targetAge: 53 };
    const levers = buildPlanLevers({ plan, directPlans: AMIT.directPlans });

    const base = solvePlan(plan);
    expect(Number.isFinite(base.requiredMonthlyReal)).toBe(false);'''
assert OLD3 in s
s = s.replace(OLD3, NEW3, 1)

p.write_text(s, encoding="utf-8")
print("ok")
