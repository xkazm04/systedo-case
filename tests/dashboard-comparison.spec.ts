import { test, expect } from "@playwright/test";

/**
 * The trend chart overlays the previous (comparison) period as a faint dotted
 * line, index-aligned with the current series, and surfaces the prior value +
 * period-over-period delta in the hover tooltip. The dashboard is server-rendered
 * from a seeded dataset, so this is deterministic and needs no API key.
 *
 * Run:  npm run test:e2e -- dashboard-comparison
 *
 * Locator note — why nearly everything here ends in .first():
 * under `next dev` this route intermittently holds TWO copies of the whole
 * trend card in the DOM for a few frames (the outgoing render lingering while
 * the next streams in). Steady state is always exactly one — a fresh navigation
 * measured n=1 at every sample from 0ms to 3s — but any strict locator that
 * happens to poll inside the overlap fails with "resolved to 2 elements" on an
 * otherwise perfectly healthy run. Scoping to .first() rides the overlap out
 * instead of racing it. Drop the .first() calls if the double-render is ever
 * fixed at the framework/route level.
 */

const chartOf = (page: import("@playwright/test").Page) =>
  page.getByRole("img", { name: /Vývoj metriky/ }).first();

test.describe("/dashboard — previous-period overlay", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard?m=vykon");
  });

  test("labels the current and previous periods in the chart legend", async ({ page }) => {
    await expect(page.getByText("Aktuální období", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Předchozí období", { exact: true }).first()).toBeVisible();
  });

  test("draws a single dotted overlay line under the current series", async ({ page }) => {
    const chart = chartOf(page);
    await expect(chart).toBeVisible();
    await expect(chart.locator('path[stroke-dasharray="1 5"]')).toHaveCount(1);
  });

  test("draws the PNO goal reference line only when the PNO metric is selected", async ({ page }) => {
    // Default metric (revenue) has no target — no reference line. Counted across
    // every copy on purpose: zero must mean zero even mid-overlap.
    await expect(page.getByTestId("trend-goal-line")).toHaveCount(0);

    // Switch the trend chart to PNO via the metric selector. It is a group of
    // aria-pressed toggle buttons, NOT a tablist — see Segmented.tsx, which
    // deliberately dropped role="tab" because that role promises arrow-key
    // navigation the control does not implement.
    await page
      .getByRole("group", { name: "Metrika grafu" })
      .first()
      .getByRole("button", { name: "PNO", exact: true })
      .click();

    const goalLine = page.getByTestId("trend-goal-line").first();
    await expect(goalLine).toBeVisible();
    await expect(goalLine.locator("line")).toHaveCount(1);
    await expect(goalLine.locator("text")).toContainText("Cíl");
  });

  test("chart is keyboard-navigable and the tooltip pins on Enter", async ({ page }) => {
    const chart = page.getByTestId("trend-chart").first();
    await expect(chart).toBeVisible();

    // locator.press() focuses and dispatches in one step. A separate focus()
    // followed by page.keyboard.press() is flaky here: the chart sits ~1150px
    // down, and scrolling to it triggers the section's staggered reveal, which
    // re-renders and drops the focus the earlier call established.
    await chart.press("ArrowLeft");
    const tooltip = page.getByTestId("trend-tooltip").first();
    await expect(tooltip).toBeVisible();

    // Enter pins it — pointer traffic (over the chart, then away) can't clear it
    await chart.press("Enter");
    const box = await chart.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await page.mouse.move(box.x - 20, box.y - 20, { steps: 4 });
    await expect(tooltip).toBeVisible();

    // Esc releases the pin and closes the readout
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
  });

  test("tooltip shows the prior value alongside the current one on hover", async ({ page }) => {
    const chart = chartOf(page);
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // hover over the middle of the plot to open the tooltip; the stepped move
    // dispatches pointermove events over the SVG capture overlay
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });

    const tooltip = page.getByTestId("trend-tooltip").first();
    await expect(tooltip).toBeVisible();
    await expect(tooltip.getByText("Předchozí").first()).toBeVisible();
  });
});
