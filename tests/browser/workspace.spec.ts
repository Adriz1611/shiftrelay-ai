import { test, expect } from "@playwright/test";
for (const width of [390, 1440]) {
  test(
    "operator boundary and layout at " + width,
    async ({ page, request }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const scenario = page.getByRole("region", {
        name: "Bengaluru night market checkout demo",
      });
      await expect(scenario).toContainText("required payment schema revision");
      await expect(scenario.getByRole("blockquote")).toContainText(
        "What changed since the last passing checkout run?",
      );
      for (const name of ["Agora", "Murf"]) {
        const logo = page.getByRole("img", { name, exact: true });
        await logo.scrollIntoViewIfNeeded();
        await expect.poll(() => logo.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await scenario.getByRole("link", { name: "Explore the workspace" }).click();
      await expect(page).toHaveURL(/\/workspace$/);
      await expect(
        page.getByRole("heading", { name: "Incident workspace." }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Start voice session" })).toBeVisible();
      await expect(page.getByLabel("Operator password")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await request.get("/api/tools/status")).status()).toBe(401);
      await page.getByRole("button", { name: "Open Incident X-Ray" }).click();
      await expect(
        page.getByRole("heading", { name: "Incident X-Ray" }),
      ).toBeVisible();
      await expect(
        page.getByRole("complementary", { name: "Evidence inspector" }),
      ).toContainText("Checkout deployment");
      if (width > 840)
        await page.getByRole("button", { name: "Show evidence list" }).click();
      await expect(page.locator(".xr-finding-list")).toBeVisible();
      await page.getByRole("button", { name: "Show canvas" }).click();
      const canvas = page.locator(".xr-canvas");
      await expect(
        canvas.getByText("Checkout deployment", { exact: true }),
      ).toBeVisible();
      await expect(canvas.getByTestId("evidence-canvas")).toHaveAttribute(
        "data-viewport",
        /"zoom":[0-9]/,
      );
      await page.getByRole("button", { name: "Back to workspace" }).click();
      await expect(
        page.getByRole("heading", { name: "Voice session" }),
      ).toBeVisible();
    },
  );
}
