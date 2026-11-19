import { test, expect } from "@playwright/test";
for (const width of [390, 1440]) {
  test(
    "operator boundary and layout at " + width,
    async ({ page, request }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Incident workspace." }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Check latest build" }).click();
      await expect(
        page.getByText("Sign in as the demo operator first."),
      ).toBeVisible();
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
      ).toContainText("Investigation target");
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
