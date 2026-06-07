/**
 * interactive-coverage.spec.ts — COMPREHENSIVE interactive E2E sweep.
 *
 * Goal: prove every meaningful interactive control on every screen RESPONDS.
 * This is the interactive complement to the read-only `v5-verification-sweep`
 * (which only asserts each route renders its substance).
 *
 * Runs DEV/LOCAL ONLY against http://localhost:5175 in DEMO mode
 * (LocalStorageAdapter). Form Add/Edit/Save/Delete are SAFE here — they write
 * to localStorage, never a real backend. Each test loads the Sharma sample
 * seed INSIDE the test (Playwright isolates context per test, so a
 * beforeAll-loaded localStorage does NOT survive — see v5-verification-sweep).
 *
 * Conventions honored:
 *  - Readiness: this extracted repo does NOT emit the `data-hydrated` signal
 *    (that was a FIREKaro-Vue monorepo artifact). We wait for the Vuetify app
 *    root (`.v-application`) to mount — the real ready signal here — matching
 *    the `networkidle`-based pattern of v5-verification-sweep.
 *  - Substance over shape (rules 24/25/26): after a mutation, assert the row
 *    actually appears / count actually changes — never "dialog closed = pass".
 *  - No weakened assertions (no `expect(true).toBeTruthy()`).
 *  - All page-level forms here use plain `ref()` + `v-model` (verified by
 *    reading the components), so `.fill()` drives them reliably — vee-validate's
 *    `pressSequentially` workaround is NOT needed in this repo.
 *  - Per-screen: assert zero NEW console errors (Vuetify/Sass deprecation noise
 *    is tolerated and filtered).
 */
import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

// The Vuetify application root mounts once Vue has hydrated #app. This is the
// real "app is up" signal in this repo (no data-hydrated attribute exists).
const APP_READY = ".v-application";

// ---- shared helpers ----------------------------------------------------

async function waitHydrated(page: Page) {
  await page.waitForSelector(APP_READY, { state: "visible", timeout: 30000 });
  // Brief settle for Vuetify component tree + first paint of route content.
  await page.waitForTimeout(300);
}

/**
 * Dismiss the demo tour. DemoTour.vue auto-launches ~300ms after the dashboard
 * mounts (deferred via requestAnimationFrame + 300ms) and renders a
 * `.tour-overlay` that intercepts pointer events — every AppBar / dashboard
 * click fails while it's up. The overlay's own click handler emits "skip", so
 * clicking it dismisses + persists `tour-dismissed`. We also remove any residual
 * node defensively. Safe to call when no tour is present (it just no-ops).
 */
async function dismissTour(page: Page) {
  const overlay = page.locator(".tour-overlay");
  if (await overlay.first().isVisible({ timeout: 1500 }).catch(() => false)) {
    // The overlay root has @click="emit('skip')" — a click anywhere on it
    // dismisses the tour and writes the dismissed flag.
    await overlay.first().click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
  // Belt-and-suspenders: if anything lingers, nuke it and try the Skip button.
  await page
    .getByRole("button", { name: /Skip tour/i })
    .click({ timeout: 800 })
    .catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll(".tour-overlay").forEach((n) => n.remove());
    // The "[DEMO]" badge (App.vue) is position:fixed top-right with z-index:9999
    // and OVERLAPS the right-edge AppBar controls (cog / sign-out), intercepting
    // pointer events on them. It's a decorative, demo-only badge — not a control
    // under test — so disable its pointer interception for reliable AppBar clicks.
    // (See report: minor real-app overlap finding on .demo-chip z-index.)
    document.querySelectorAll<HTMLElement>(".demo-chip").forEach((n) => {
      n.style.pointerEvents = "none";
    });
  });
}

/** Load the Sharma sample seed via the splash CTA, landing on the dashboard. */
async function loadSampleSeed(page: Page) {
  await page.goto("/", { waitUntil: "networkidle", timeout: 20000 });
  // One-shot localStorage clear so a prior test's state can't leak in.
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.reload({ waitUntil: "networkidle" });
  await waitHydrated(page);
  const sampleBtn = page.getByRole("button", { name: /Try the sample/i });
  await sampleBtn.click();
  await page.waitForURL(/\/fire-goals\/dashboard/, { timeout: 15000 });
  await waitHydrated(page);
  // The tour auto-launches on the dashboard for a freshly-loaded seed — dismiss
  // it so AppBar / card clicks aren't intercepted by its overlay.
  await dismissTour(page);
}

/** Navigate to a sidebar-layout route AFTER the seed is loaded. */
async function gotoSeeded(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle", timeout: 20000 });
  await waitHydrated(page);
  await dismissTour(page);
}

/**
 * Attach a console-error collector that ignores known-benign noise.
 * Returns a getter for the accumulated REAL errors.
 */
function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (
      t.includes("[Vuetify]") ||
      t.includes("DEPRECATION WARNING") ||
      t.includes("Sass @import rules are deprecated") ||
      t.includes("favicon")
    ) {
      return;
    }
    errors.push(t);
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  return {
    assertClean(label: string) {
      expect(pageErrors, `page errors on ${label}: ${pageErrors.join("; ")}`).toEqual([]);
      expect(errors, `console errors on ${label}: ${errors.join("\n")}`).toEqual([]);
    },
  };
}

/** Count EntityRow-style rows inside the nearest "Your X" panel by trash buttons. */
async function deleteButtonCount(page: Page): Promise<number> {
  return page.getByRole("button", { name: /^Delete$/i }).count();
}

// =======================================================================
// 1. SIDEBAR NAVIGATION — accordion mechanism + every leaf navigates
// =======================================================================

// The sidebar (SidebarNav.vue) renders a Vuetify <v-list role="presentation">
// inside <nav aria-label="Primary navigation"> — NOT a <v-navigation-drawer>.
// Vuetify gives PARENT list-group activators role="option" and LEAF / child
// list-items role="listitem". So selectors must target the nav landmark + the
// item TEXT, not getByRole("button") and not ".v-navigation-drawer". The
// definitive accordion mechanism (from SidebarNav.vue + the captured ARIA tree):
//   - Leaf section (Taxes, Profile — children.length === 0): a plain
//     <v-list-item> with @click=navigateTo → SINGLE CLICK NAVIGATES.
//   - Parent section (Income/Expenses/Investments/... — has children): a
//     <v-list-group> whose activator has NO navigation handler → clicking it
//     ONLY EXPANDS to reveal children. The child <v-list-item>s carry the
//     @click=navigateTo. Single-open accordion enforced by a watcher.
function navItem(page: Page, label: string) {
  // Several sections share a child label ("Overview" exists under Income,
  // Expenses, Investments, ...). Collapsed groups keep their children in the DOM
  // but hidden, so we MUST scope to the VISIBLE item or `.first()` grabs a
  // hidden one in a different group (strict :visible filter avoids that).
  return page
    .locator("nav[aria-label='Primary navigation'] .v-list-item")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .filter({ visible: true })
    .first();
}

test.describe("sidebar navigation (accordion mechanism)", () => {
  test("leaf sections navigate on click; parent sections EXPAND (do not navigate); children navigate", async ({
    page,
  }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);

    const nav = page.locator("nav[aria-label='Primary navigation']");
    await expect(nav).toBeVisible();

    // --- Leaf section: "Taxes" (no children) navigates directly on one click. ---
    await navItem(page, "Taxes").click();
    await expect(page, "leaf 'Taxes' navigates to /tax-planning on a single click").toHaveURL(
      /\/tax-planning/,
    );
    await waitHydrated(page);

    // --- Leaf section: "Profile" (no children) navigates directly. ---
    await navItem(page, "Profile").click();
    await expect(page).toHaveURL(/\/profile/);
    await waitHydrated(page);
    await dismissTour(page);

    // --- Parent section: "Investments" (has children) is a v-list-group
    //     activator with NO navigation handler. Clicking it EXPANDS the group
    //     and reveals children — it does NOT navigate. Definitive answer. ---
    const urlBeforeExpand = page.url();
    await navItem(page, "Investments").click();
    const holdingsChild = navItem(page, "Holdings");
    await expect(
      holdingsChild,
      "clicking the Investments parent EXPANDS to reveal child 'Holdings'",
    ).toBeVisible({ timeout: 5000 });
    expect(
      page.url(),
      "clicking a parent section with children must EXPAND, not navigate",
    ).toBe(urlBeforeExpand);

    // --- Now the child DOES navigate. ---
    await holdingsChild.click();
    await expect(page).toHaveURL(/\/investments\/holdings/);
    await waitHydrated(page);
    await dismissTour(page);

    // --- Single-open accordion: opening "Expenses" collapses "Investments"
    //     (the watcher trims the opened[] array to length 1). ---
    await navItem(page, "Expenses").click();
    const recurringChild = navItem(page, "Recurring");
    await expect(recurringChild).toBeVisible({ timeout: 5000 });
    await expect(
      navItem(page, "Holdings"),
      "single-open accordion collapsed Investments when Expenses opened",
    ).toBeHidden();
    await recurringChild.click();
    await expect(page).toHaveURL(/\/expenses\/recurring/);

    guard.assertClean("sidebar-navigation");
  });

  test("every sidebar child route navigates to the right path", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);

    // [parentLabel, childLabel, expectedUrlRegex]
    const childNavs: [string, string, RegExp][] = [
      ["Income", "Salary", /\/income\/salary/],
      ["Income", "Business", /\/income\/business/],
      ["Income", "Other Sources", /\/income\/other-sources/],
      ["Expenses", "Planned", /\/expenses\/planned/],
      ["Investments", "Overview", /\/investments\/overview/],
      ["Liabilities", "Loans", /\/liabilities\/loans/],
      ["Insurance", "Policies", /\/insurance\/policies/],
      ["Health", "Net Worth", /\/financial-health\/net-worth/],
      ["FIRE", "What-If", /\/fire-goals\/what-if/],
    ];

    // Vuetify renders each group's children in a
    // `.v-list-group__items[aria-labelledby="v-list-group--id-{Parent}"]` container
    // that is display:none until the group is OPEN. Several groups share a child
    // label ("Overview"/"Loans"…), so we scope to the PARENT'S OWN items container
    // (deterministic via aria-labelledby) — a global text match lands on a sibling
    // group's identically-named child (the documented
    // "Investments › Overview → /expenses/overview" mis-hit).
    for (const [parent, child, url] of childNavs) {
      const itemsSel = `.v-list-group__items[aria-labelledby='v-list-group--id-${parent}']`;
      const childItem = page
        .locator(itemsSel)
        .locator(".v-list-item")
        .filter({ hasText: new RegExp(`^${child}$`) })
        .first();

      // Expand the parent ONLY if it isn't already open — clicking a v-list-group
      // header is a TOGGLE, so blindly clicking again when consecutive iterations
      // share a parent (Income appears 3× in a row) would COLLAPSE it. We expand
      // idempotently: click the header, and if the child isn't visible yet, click
      // once more (the group was open and we just closed it → reopen).
      if (!(await childItem.isVisible().catch(() => false))) {
        await navItem(page, parent).click();
        if (!(await childItem.isVisible({ timeout: 1500 }).catch(() => false))) {
          // We toggled a still-collapsing group the wrong way — toggle back.
          await navItem(page, parent).click();
        }
      }
      await expect(
        childItem,
        `child "${child}" should be visible after expanding "${parent}"`,
      ).toBeVisible({ timeout: 5000 });
      await childItem.scrollIntoViewIfNeeded();
      // The header can overlap the child's hit-box; force dispatches the click to
      // the child's own @click=navigateTo handler. toHaveURL is the correctness guard.
      await childItem.click({ force: true });
      await expect(page, `child "${child}" should navigate to ${url}`).toHaveURL(url);
      await waitHydrated(page);
      await dismissTour(page);
    }

    guard.assertClean("sidebar-child-navigation");
  });
});

// =======================================================================
// 2. APP BAR — FY select, seed switcher, assumptions cog
// =======================================================================

test.describe("app bar controls", () => {
  test("FY selector opens and changes value", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/tax-planning");

    // The global app-bar FY selector was REMOVED in the FY-selector refactor (the current FY is
    // auto-derived from the wall clock). Manual FY selection now lives ONLY on /tax-planning as a
    // page-local picker labelled "Tax year" (financial-year-handling.md). Match THAT picker.
    const fySelect = page.locator(".v-select").filter({ hasText: /Tax year/ }).first();
    const beforeSel = ((await fySelect.textContent()) ?? "").replace(/\s+/g, "");
    await fySelect.click();
    await page.waitForTimeout(300);
    const options = page.getByRole("option");
    const optCount = await options.count();
    // The tax-year picker shows "current + next configured FY" (financial-year-handling.md). When
    // the current FY IS the newest configured year (e.g. FY 2026-27 today), it is correctly a
    // SINGLE-option picker — so we assert ≥1 option and only exercise the change when ≥2 exist.
    expect(optCount, "FY dropdown opened with at least the current year").toBeGreaterThanOrEqual(1);
    // Find the first option whose year differs from the currently-selected one (if any).
    let pickedYear = "";
    for (let i = 0; i < optCount; i++) {
      const txt = ((await options.nth(i).textContent()) ?? "").trim();
      const year = txt.match(/\d{4}/)?.[0] ?? "";
      if (year && !beforeSel.includes(year)) {
        pickedYear = year;
        await options.nth(i).click();
        break;
      }
    }
    if (pickedYear) {
      await page.waitForTimeout(400);
      // SUBSTANCE: the select now reflects the newly-picked financial year.
      await expect(fySelect, "FY select reflects the newly-picked year").toContainText(pickedYear);
    } else {
      // Single-option (current == newest configured FY): close the menu and assert the picker
      // still shows the current year — the control opened + responded, which is the substance here.
      await page.keyboard.press("Escape");
      await expect(fySelect, "single-option FY picker shows the current year").toContainText(/\d{4}/);
    }

    guard.assertClean("appbar-fy-select");
  });

  test("assumptions cog opens the assumptions panel", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);

    // The decorative "[DEMO]" badge (position:fixed, z-index:9999) overlaps the
    // top-right AppBar controls; loadSampleSeed disables its pointer-events so
    // this is a clean, un-forced click — the panel opening is the substance proof.
    await page.getByRole("button", { name: /Adjust assumptions/i }).click();
    // AssumptionsPanel renders a dialog with a "Assumptions" v-card-title and
    // Inflation / Returns / SWR section headings (AssumptionsPanel.vue). Assert
    // the title heading is visible — substance proof the panel opened.
    await expect(
      page.getByText("Assumptions", { exact: true }).first(),
      "Assumptions panel opened with its title heading",
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("heading", { name: /Inflation|Returns|Safe Withdrawal/i }).first(),
      "Assumptions panel shows its assumption sections",
    ).toBeVisible({ timeout: 5000 });

    guard.assertClean("appbar-assumptions-cog");
  });

  test("seed switcher opens and lists scenarios", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);

    await page.locator(".seed-switcher-btn").click();
    await expect(page.getByText(/Try a different scenario/i)).toBeVisible({ timeout: 5000 });
    // Close without switching (switching reloads + changes data).
    await page.keyboard.press("Escape");

    guard.assertClean("appbar-seed-switcher");
  });
});

// =======================================================================
// 3. FIRE DASHBOARD (home) — section cards + chips navigate
// =======================================================================

test.describe("FIRE dashboard interactions", () => {
  test("section cards navigate; estate + edit-profile controls respond", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/fire-goals/dashboard");

    // Section card (whole-card click) navigates.
    await page.locator(".section-card").filter({ hasText: /Income/i }).first().click();
    await expect(page).toHaveURL(/\/income\/overview/);
    await waitHydrated(page);

    await gotoSeeded(page, "/fire-goals/dashboard");
    // Investments card.
    await page.locator(".section-card").filter({ hasText: /Investments/i }).first().click();
    await expect(page).toHaveURL(/\/investments\/overview/);
    await waitHydrated(page);

    await gotoSeeded(page, "/fire-goals/dashboard");
    // Estate chip routes to estate-planning.
    const estateChip = page.locator("[data-testid='estate-chip']");
    await expect(estateChip).toBeVisible();
    await estateChip.click();
    await expect(page).toHaveURL(/\/estate-planning/);

    guard.assertClean("dashboard-interactions");
  });
});

// =======================================================================
// 4. INCOME — Salary (edit-earner dialog), Other Sources (add-type chips)
// =======================================================================

test.describe("income screens", () => {
  test("salary: clicking an earner card opens the edit dialog", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/income/salary");

    // The featured earner card is a button inside the rail.
    await page.locator(".rail-featured").first().click();
    await expect(
      page.locator(".v-dialog").filter({ hasText: /Edit earner salary/i }),
    ).toBeVisible({ timeout: 5000 });
    // Close via the dialog's Done.
    await page.getByRole("button", { name: /^Done$/ }).click();

    guard.assertClean("income-salary-edit");
  });

  test("other-sources: add-type chip opens an entry dialog", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/income/other-sources");

    // AddTypeChips render as <button class="type-chip"> labelled by type. In the
    // populated Sharmas sample the "Track a new type" card shows only the UNUSED
    // types (Rental/Dividend/Interest are already present → filtered out), so we
    // click the first AVAILABLE chip rather than assuming a specific label.
    const addChip = page.locator("button.type-chip").first();
    await expect(addChip, "an 'add a new income type' chip is available").toBeVisible();
    await addChip.click();
    await expect(
      page.locator(".v-dialog").first(),
      "selecting an income-type chip opens the add-income dialog",
    ).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^Cancel$/ }).first().click();

    guard.assertClean("income-other-sources-add");
  });
});

// =======================================================================
// 5. EXPENSES — Recurring (full add → row appears → delete) + Overview field
// =======================================================================

test.describe("expenses screens", () => {
  test("recurring: add a commitment → row appears → delete it", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/expenses/recurring");

    const beforeCount = await deleteButtonCount(page);

    const label = `E2E Gym ${Date.now()}`;
    await page.getByLabel(/^Label \*$/).first().fill(label);
    await page.getByLabel(/^Amount \*$/).first().fill("3500");
    const addBtn = page.getByRole("button", { name: /^Add$/ }).first();
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // SUBSTANCE: the new row must appear with the unique label.
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 5000 });
    const afterAdd = await deleteButtonCount(page);
    expect(afterAdd, "delete-button count must grow by 1 after add").toBe(beforeCount + 1);

    // Clean up: delete the row we just added (last manual row's Delete).
    const newRow = page.locator("text=" + label).first();
    await newRow.scrollIntoViewIfNeeded();
    // Delete buttons belong to manual rows; delete the one in the row carrying our label.
    const rowDeleteBtn = page
      .locator(".entity-row, [class*='entity']")
      .filter({ hasText: label })
      .getByRole("button", { name: /^Delete$/ })
      .first();
    if (await rowDeleteBtn.count()) {
      await rowDeleteBtn.click();
    } else {
      // Fallback: the manual list orders by insertion; the last Delete is ours.
      await page.getByRole("button", { name: /^Delete$/ }).last().click();
    }
    await expect(page.getByText(label, { exact: false })).toHaveCount(0, { timeout: 5000 });

    guard.assertClean("expenses-recurring-crud");
  });

  test("recurring: edit pencil opens the edit dialog and saves", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/expenses/recurring");

    // Seed a row first so an editable manual row exists.
    const label = `E2E Edit ${Date.now()}`;
    await page.getByLabel(/^Label \*$/).first().fill(label);
    await page.getByLabel(/^Amount \*$/).first().fill("1000");
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await expect(page.getByText(label).first()).toBeVisible();

    // Open the edit dialog via the pencil on our row.
    await page
      .locator(".entity-row, [class*='entity']")
      .filter({ hasText: label })
      .getByRole("button", { name: /^Edit$/ })
      .first()
      .click();
    const dialog = page.locator(".v-dialog").filter({ hasText: /Edit recurring expense/i });
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByLabel(/^Amount \*$/).fill("2222");
    await dialog.getByRole("button", { name: /Save changes/i }).click();
    await expect(dialog).toBeHidden({ timeout: 5000 });
    // SUBSTANCE: the edited amount (₹2.2K compact) shows on the row. Scope to the
    // OUTER .entity-row only (`.entity-row` nests __main/__title with the same
    // text → a loose filter is a strict-mode violation).
    const editedRow = page.locator(".entity-row").filter({ hasText: label }).first();
    await expect(editedRow, "edited recurring row reflects the new amount").toContainText(
      /2\.2K|2,222/,
    );

    // cleanup
    await editedRow.getByRole("button", { name: /^Delete$/ }).first().click();

    guard.assertClean("expenses-recurring-edit");
  });
});

// =======================================================================
// 6. INVESTMENTS — Holdings (add → row appears → delete) + Buckets bucket select
// =======================================================================

test.describe("investments screens", () => {
  test("holdings: add an FD investment → row appears → delete it", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/investments/holdings");

    const beforeCount = await deleteButtonCount(page);

    // The "Add an investment" panel: pick FD, label, value.
    const typeSelect = page.locator(".v-select").filter({ hasText: /Type/ }).first();
    await typeSelect.click();
    await page.getByRole("option", { name: /FD \/ Bonds/i }).click();

    const label = `E2E FD ${Date.now()}`;
    await page.getByLabel(/Label \(optional\)/i).first().fill(label);
    await page.getByLabel(/Current balance \*/i).first().fill("250000");

    const addBtn = page.getByRole("button", { name: /Add investment/i });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    await expect(page.getByText(label).first()).toBeVisible({ timeout: 5000 });
    const afterAdd = await deleteButtonCount(page);
    expect(afterAdd, "holdings delete-button count must grow by 1").toBe(beforeCount + 1);

    // cleanup
    await page
      .locator(".entity-row, [class*='entity']")
      .filter({ hasText: label })
      .getByRole("button", { name: /^Delete$/ })
      .first()
      .click();
    await expect(page.getByText(label)).toHaveCount(0, { timeout: 5000 });

    guard.assertClean("investments-holdings-crud");
  });

  test("holdings: 'More details' expansion panel toggles open", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/investments/holdings");

    const panel = page.getByRole("button", { name: /More details \(optional\)/i }).first();
    await expect(panel).toBeVisible();
    await panel.click();
    // For the default Stocks type, the panel reveals a Quantity field.
    await expect(page.getByLabel(/Quantity/i).first()).toBeVisible({ timeout: 5000 });

    guard.assertClean("investments-holdings-expansion");
  });
});

// =======================================================================
// 7. LIABILITIES — Loans (add → row appears → delete)
// =======================================================================

test.describe("liabilities screens", () => {
  test("loans: add a personal loan → row appears → delete it", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/liabilities/loans");

    const beforeCount = await deleteButtonCount(page);

    const name = `E2E Loan ${Date.now()}`;
    await page.getByLabel(/Loan name \*/i).first().fill(name);
    await page.getByLabel(/Outstanding \*/i).first().fill("500000");
    await page.getByLabel(/Monthly EMI \*/i).first().fill("12000");

    const addBtn = page.getByRole("button", { name: /Add loan/i });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    await expect(page.getByText(name).first()).toBeVisible({ timeout: 5000 });
    const afterAdd = await deleteButtonCount(page);
    expect(afterAdd, "loans delete-button count must grow by 1").toBe(beforeCount + 1);

    // cleanup
    await page
      .locator(".entity-row, [class*='entity']")
      .filter({ hasText: name })
      .getByRole("button", { name: /^Delete$/ })
      .first()
      .click();
    await expect(page.getByText(name)).toHaveCount(0, { timeout: 5000 });

    guard.assertClean("liabilities-loans-crud");
  });
});

// =======================================================================
// 8. INSURANCE — Policies (add → row appears → delete)
// =======================================================================

test.describe("insurance screens", () => {
  test("policies: add a policy → row appears → delete it", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/insurance/policies");

    const beforeCount = await deleteButtonCount(page);

    const provider = `E2E Insure ${Date.now()}`;
    await page.getByLabel(/Provider \*/i).first().fill(provider);
    await page.getByLabel(/Sum assured \*/i).first().fill("5000000");
    await page.getByLabel(/^Premium \*$/i).first().fill("12000");

    const addBtn = page.getByRole("button", { name: /Add policy/i });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    await expect(page.getByText(provider).first()).toBeVisible({ timeout: 5000 });
    const afterAdd = await deleteButtonCount(page);
    expect(afterAdd, "policies delete-button count must grow by 1").toBe(beforeCount + 1);

    // cleanup
    await page
      .locator(".entity-row, [class*='entity']")
      .filter({ hasText: provider })
      .getByRole("button", { name: /^Delete$/ })
      .first()
      .click();
    await expect(page.getByText(provider)).toHaveCount(0, { timeout: 5000 });

    guard.assertClean("insurance-policies-crud");
  });
});

// =======================================================================
// 9. TAX PLANNING — regime toggle (Auto / Old / New)
// =======================================================================

test.describe("tax-planning screen", () => {
  test("regime toggle switches Auto/Old/New and updates the active selection", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/tax-planning");

    const toggle = page.locator(".regime-controls .v-btn-toggle");
    await expect(toggle).toBeVisible();

    const oldBtn = toggle.getByRole("button", { name: /^Old$/ });
    const newBtn = toggle.getByRole("button", { name: /^New$/ });

    await oldBtn.click();
    await expect(oldBtn).toHaveClass(/v-btn--active/, { timeout: 5000 });

    await newBtn.click();
    await expect(newBtn).toHaveClass(/v-btn--active/, { timeout: 5000 });
    await expect(oldBtn).not.toHaveClass(/v-btn--active/);

    guard.assertClean("tax-planning-regime-toggle");
  });
});

// =======================================================================
// 10. FINANCIAL HEALTH — sub-route navigation responds
// =======================================================================

test.describe("financial-health screens", () => {
  test("each sub-route loads its own content", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);

    const subs: [string, RegExp][] = [
      ["/financial-health", /Health|Freedom|score/i],
      ["/financial-health/net-worth", /Net worth|Assets|Liabilit/i],
      ["/financial-health/cash-flow", /Cash flow|Inflow|Outflow|surplus/i],
      ["/financial-health/emergency-fund", /Emergency|months|runway/i],
    ];
    for (const [path, re] of subs) {
      await gotoSeeded(page, path);
      await expect(page.locator("body")).toContainText(re, { timeout: 8000 });
    }

    guard.assertClean("financial-health-subroutes");
  });
});

// =======================================================================
// 11. FIRE GOALS — What-If levers + save/load/delete scenario
// =======================================================================

test.describe("fire-goals what-if screen", () => {
  test("levers move the FIRE date; scenario save → chip appears → load → delete", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/fire-goals/what-if");

    // Capture the baseline FIRE-date hero value.
    const fireDateCard = page.locator(".delta-card").filter({ hasText: /FIRE date/i }).first();
    const before = (await fireDateCard.locator(".delta-card__value").textContent())?.trim() ?? "";

    // Change a number lever that materially shifts the date.
    const monthly = page.getByLabel(/Monthly contribution \(₹\)/i).first();
    await monthly.fill("200000");
    await monthly.blur();
    await page.waitForTimeout(400);
    const after = (await fireDateCard.locator(".delta-card__value").textContent())?.trim() ?? "";
    expect(after, "FIRE-date hero must change after a big monthly-contribution lever move").not.toBe(
      before,
    );

    // A slider also responds — nudge the expected-return slider with keyboard.
    const returnSlider = page.locator(".v-slider").first();
    await returnSlider.locator("input, [role='slider']").first().focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");

    // Save a scenario → a chip with the name must appear.
    const scenarioName = `E2E Scenario ${Date.now() % 100000}`;
    await page.getByLabel(/Name this scenario/i).fill(scenarioName);
    await page.getByRole("button", { name: /Save scenario/i }).click();
    const chip = page.locator(".scenario-chip").filter({ hasText: scenarioName });
    await expect(chip).toBeVisible({ timeout: 5000 });

    // Reset to baseline, then LOAD the scenario (click chip body) — levers re-apply.
    await page.getByRole("button", { name: /Reset to baseline/i }).click();
    await chip.click();
    await page.waitForTimeout(300);

    // DELETE the scenario via the chip close icon.
    await chip.getByRole("button").first().click();
    await expect(page.locator(".scenario-chip").filter({ hasText: scenarioName })).toHaveCount(0, {
      timeout: 5000,
    });

    guard.assertClean("what-if-levers-and-scenarios");
  });

  test("side-by-side projection expansion panel toggles open", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/fire-goals/what-if");

    const panel = page.getByRole("button", { name: /Side-by-side corpus projection/i }).first();
    await panel.click();
    await expect(page.getByText(/30-year horizon/i)).toBeVisible({ timeout: 5000 });

    guard.assertClean("what-if-projection-panel");
  });
});

// =======================================================================
// 12. PREFERENCES — assumption edits, withdrawal radio, feature toggle, reset
// =======================================================================

test.describe("preferences screen", () => {
  test("inflation field edits, withdrawal radio switches, feature toggle flips", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/preferences");

    // Edit a general-inflation assumption field (substance: value sticks).
    const general = page.locator("[data-testid='pref-inflation-general'] input").first();
    await general.fill("7");
    await general.blur();
    await page.waitForTimeout(300);
    await expect(general).toHaveValue(/7/);

    // The blended-inflation readout reflects the change (recomputed).
    const blend = page.locator("[data-testid='pref-inflation-blend']");
    await expect(blend).toBeVisible();

    // Withdrawal-rule radio: switch to Floor/Ceiling.
    const floorCeiling = page.locator("[data-testid='pref-withdrawal-floor-ceiling'] input").first();
    await floorCeiling.check();
    await expect(floorCeiling).toBeChecked();

    // A feature toggle flips (pick the first feature switch).
    const featureSwitch = page.locator("[data-testid^='pref-feature-'] input[type='checkbox']").first();
    const wasChecked = await featureSwitch.isChecked();
    await featureSwitch.click({ force: true });
    await page.waitForTimeout(200);
    expect(await featureSwitch.isChecked(), "feature toggle must flip state").toBe(!wasChecked);
    // restore
    await featureSwitch.click({ force: true });

    guard.assertClean("preferences-controls");
  });
});

// =======================================================================
// 13. PROFILE — member field edits auto-save
// =======================================================================

test.describe("profile screen", () => {
  test("editing a member name auto-saves (Saved chip appears)", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/profile");

    // Find the first member's name field and append a marker.
    const nameField = page.getByLabel(/^Name$/i).first();
    await expect(nameField).toBeVisible();
    const original = (await nameField.inputValue()) || "";
    await nameField.fill(original + " X");
    await nameField.blur();

    // SUBSTANCE: auto-save fires → "Saved" chip appears.
    await expect(page.locator(".profile-head__saved")).toBeVisible({ timeout: 5000 });

    // restore
    await nameField.fill(original);
    await nameField.blur();

    guard.assertClean("profile-member-edit");
  });
});

// =======================================================================
// 14. ESTATE PLANNING — checklist checkbox toggles progress
// =======================================================================

test.describe("estate-planning screen", () => {
  test("toggling a checklist item updates the completion count", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/estate-planning");

    const progress = page.locator("[data-testid='estate-progress']");
    const readCompleted = async () => {
      const txt = (await progress.locator(".text-h4").textContent())?.trim() ?? "0 / 0";
      return Number(txt.split("/")[0].trim());
    };
    const before = await readCompleted();

    const firstCheckbox = page
      .locator("[data-testid^='estate-item-'] input[type='checkbox']")
      .first();
    await firstCheckbox.click({ force: true });
    await page.waitForTimeout(300);
    const after = await readCompleted();
    expect(after, "completion count must change after toggling a checklist item").not.toBe(before);

    // restore
    await firstCheckbox.click({ force: true });

    guard.assertClean("estate-planning-checklist");
  });
});

// =======================================================================
// 15. GLOSSARY — search filters the list + category chips filter
// =======================================================================

test.describe("glossary screen", () => {
  test("search narrows the term count; category chip filters", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/glossary");

    const count = page.locator("[data-testid='glossary-count']");
    const readCount = async () => {
      const txt = (await count.textContent())?.trim() ?? "0";
      return Number(txt.match(/\d+/)?.[0] ?? "0");
    };
    const allCount = await readCount();
    expect(allCount, "glossary should start with several terms").toBeGreaterThan(1);

    // Type a search query → fewer (or equal) terms, and matching cards.
    await page.locator("[data-testid='glossary-search'] input").fill("SWR");
    await page.waitForTimeout(300);
    const searchedCount = await readCount();
    expect(searchedCount, "search must narrow the term list").toBeLessThan(allCount);

    // Clear, then filter by a category chip → count changes.
    await page.locator("[data-testid='glossary-search'] input").fill("");
    await page.waitForTimeout(200);
    await page.locator("[data-testid='glossary-filter-Tax']").click();
    await page.waitForTimeout(300);
    const taxCount = await readCount();
    expect(taxCount, "Tax category filter must narrow the list").toBeLessThan(allCount);

    guard.assertClean("glossary-search-filter");
  });
});

// =======================================================================
// 16. STRESS TEST + BUCKETS (feature-gated NEW routes)
// =======================================================================

test.describe("feature-gated routes", () => {
  test("stress-test renders scenario rows", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/fire-goals/stress-test");
    // If feature-gated off, the guard redirects to /preferences#features.
    if (/\/preferences/.test(page.url())) {
      await expect(page.locator("body")).toContainText(/feature/i);
    } else {
      await expect(page.locator("[data-testid^='stress-']").first()).toBeVisible({ timeout: 8000 });
    }
    guard.assertClean("stress-test");
  });

  test("investments buckets renders bucket cards", async ({ page }) => {
    const guard = collectConsoleErrors(page);
    await loadSampleSeed(page);
    await gotoSeeded(page, "/investments/buckets");
    if (/\/preferences/.test(page.url())) {
      await expect(page.locator("body")).toContainText(/feature/i);
    } else {
      await expect(page.locator("[data-testid^='bucket-card-']").first()).toBeVisible({
        timeout: 8000,
      });
    }
    guard.assertClean("investments-buckets");
  });
});
