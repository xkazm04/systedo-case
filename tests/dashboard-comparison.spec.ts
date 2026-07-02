import { test, expect } from "@playwright/test";

/**
 * The trend chart overlays the previous (comparison) period as a faint dotted
 * line, index-aligned with the current series, and surfaces the prior value +
 * period-over-period delta in the hover tooltip. The dashboard is server-rendered
 * from a seeded dataset, so this is deterministic and needs no API key.
 *
 * Run:  npm run test:e2e -- dashboard-comparison
 */

const chartOf = (page: import("@playwright/test").Page) =>
  page.getByRole("img", { name: /Vývoj metriky/ });

test.describe("/dashboard — previous-period overlay", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
  });

  test("labels the current and previous periods in the chart legend", async ({ page }) => {
    await expect(page.getByText("Aktuální období", { exact: true })).toBeVisible();
    await expect(page.getByText("Předchozí období", { exact: true })).toBeVisible();
  });

  test("draws a single dotted overlay line under the current series", async ({ page }) => {
    const chart = chartOf(page);
    await expect(chart).toBeVisible();
    await expect(chart.locator('path[stroke-dasharray="1 5"]')).toHaveCount(1);
  });

  test("draws the PNO goal reference line only when the PNO metric is selected", async ({ page }) => {
    // Default metric (revenue) has no target — no reference line.
    await expect(page.getByTestId("trend-goal-line")).toHaveCount(0);

    // Switch the trend chart to PNO via the metric selector tablist.
    await page
      .getByRole("tablist", { name: "Metrika grafu" })
      .getByRole("tab", { name: "PNO", exact: true })
      .click();

    const goalLine = page.getByTestId("trend-goal-line");
    await expect(goalLine).toBeVisible();
    await expect(goalLine.locator("line")).toHaveCount(1);
    await expect(goalLine.locator("text")).toContainText("Cíl");
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

    const tooltip = page.getByTestId("trend-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip.getByText("Předchozí")).toBeVisible();
  });
});
