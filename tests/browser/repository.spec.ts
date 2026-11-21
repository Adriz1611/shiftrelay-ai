import { expect, test } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";

test("repository commands, signed live deliveries and historical navigation", async ({
  context,
  page,
  request,
}) => {
  const expires = String(Date.now() + 60000);
  const signature = createHmac("sha256", process.env.SHIFTRELAY_BROWSER_SECRET!)
    .update(expires)
    .digest("hex");
  await context.addCookies([
    {
      name: "operator",
      value: expires + "." + signature,
      url: "http://127.0.0.1:3167",
    },
  ]);
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Explore repository" }).click();
  const navigation = page.getByRole("navigation", { name: "Repository views" });
  const command = page.getByLabel("Ask about this repository");
  for (const [input, label] of [
    ["I have 6 hours this weekend", "Sprint plan"],
    ["I’m a new contributor", "Getting started"],
    ["What’s on fire?", "Briefing"],
  ]) {
    await command.fill(input);
    await command.press("Enter");
    await expect(
      navigation.getByRole("button", { name: label }),
    ).toHaveAttribute("aria-current", "page");
    if (label === "Sprint plan") {
      await page.getByLabel("Issue source").selectOption("example");
      await page.getByLabel("Time budget (hours)").fill("3");
      await page.getByRole("button",{name:"Build sprint plan"}).click();
      await expect(page.getByRole("heading",{name:"3 of 3 hours scheduled"})).toBeVisible();
    }
  }
  await navigation.getByRole("button", { name: "History & live" }).click();
  const live = page.getByRole("button", { name: "Live mode" });
  await live.click();
  await expect(page.getByText(/Listening for GitHub deliveries/)).toBeVisible();
  const opened = "2026-01-02T10:00:00Z",
    closed = "2026-01-04T10:00:00Z";
  for (const action of ["opened", "closed"]) {
    const data = JSON.stringify({
      action,
      repository: { full_name: "fixture/shiftrelay-browser" },
      issue: {
        number: 829,
        title: "Reconcile checkout totals",
        created_at: opened,
        updated_at: action === "opened" ? opened : closed,
        closed_at: action === "closed" ? closed : null,
      },
    });
    const response = await request.post("/api/repo-events/webhook", {
      data,
      headers: {
        "content-type": "application/json",
        "x-github-event": "issues",
        "x-github-delivery": randomUUID(),
        "x-hub-signature-256":
          "sha256=" +
          createHmac("sha256", process.env.SHIFTRELAY_TEST_HOOK!)
            .update(data)
            .digest("hex"),
      },
    });
    expect(response.status()).toBe(204);
  }
  await expect(
    page
      .getByRole("link", { name: "Reconcile checkout totals", exact: true })
      .first(),
  ).toBeVisible();
  const slider = page.getByRole("slider", { name: /As of/ });
  await expect(slider).toHaveAttribute("max", "1");
  const map = page.getByRole("list",{name:/Issues tracked by/});
  await expect(map).toContainText("Closed");
  await live.click();
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveValue("0");
  await expect(map.getByRole("link")).toHaveAttribute("data-state","opened");
  await page.getByRole("button", { name: "Back to incident" }).click();
  await expect(
    page.getByRole("heading", { name: "Incident workspace." }),
  ).toBeVisible();
});
