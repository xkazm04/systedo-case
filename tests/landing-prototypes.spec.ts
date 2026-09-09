import { expect, test } from "@playwright/test";

test.use({ locale: "en-US" });

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "locale", value: "en", domain: "localhost", path: "/" }]);
});

test("three landing explorations render at desktop and mobile widths without overflow", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const route of ["", "/orbit", "/studio", "/signal"]) {
      await page.goto(`/prototypes${route}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("main")).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }
  }
  expect(errors).toEqual([]);
});

test("orbit selection changes the visual map and explanatory detail", async ({ page }) => {
  await page.goto("/prototypes/orbit");
  await page.getByRole("button", { name: "02 Content" }).click();
  await expect(page.getByRole("heading", { name: "Give your story a voice." })).toBeVisible();
  await expect(page.locator(".orbit-satellite").filter({ hasText: "Instagram" })).toBeVisible();
  await page.getByRole("button", { name: "Pause motion" }).click();
  await expect(page.locator(".orbit")).toHaveClass(/motion-paused/);
  await expect(page.getByRole("link", { name: "Find my opportunities" }).first()).toHaveAttribute("href", "/kanaly-zdarma");
});

test("studio palette updates packaging and survives a locale switch", async ({ page }) => {
  await page.goto("/prototypes/studio");
  await page.getByRole("button", { name: "Berry", exact: true }).click();
  await expect(page.locator(".studio")).toHaveClass(/flavor-berry/);
  await expect(page.locator(".can-label strong").first()).toHaveText("Berry");
  await page.getByRole("button", { name: "Přepnout do češtiny" }).click();
  await expect(page.locator("h1")).toContainText("Máte co");
  await expect(page.locator(".can-label strong").first()).toHaveText("Lesní ovoce");
  await expect(page.locator("html")).toHaveAttribute("lang", "cs");
});

test("signal exposes selectable next steps, drafts and honestly labelled sample metrics", async ({ page }) => {
  await page.goto("/prototypes/signal");
  await page.locator(".opportunity-row").nth(1).click();
  await expect(page.locator(".signal-selected")).toContainText("Prepare a roaster description");
  await page.getByRole("button", { name: "02 Create" }).click();
  await expect(page.getByText("Draft for review", { exact: false })).toHaveCount(2);
  await page.getByRole("button", { name: "03 Measure" }).click();
  await expect(page.locator(".signal-metrics")).toContainText("12 480");
  await expect(page.locator(".sample-label")).toHaveText("SAMPLE DATA");
});

test("reduced motion disables the decorative animations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  for (const route of ["orbit", "studio"]) {
    await page.goto(`/prototypes/${route}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const selector = route === "orbit" ? ".orbit-planet" : ".studio-can";
    expect(await page.locator(selector).first().evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  }
});
