import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { remember } from "../../lib/records";
import { sendWorkspaceCommand } from "../../lib/workspace-commands";
import { evidenceSpotlight } from "../../lib/spotlight";

test("a workspace command opens X-Ray and keeps the selected evidence visible across polls", async ({ context, page }) => {
  process.env.DATABASE_PATH = process.env.SHIFTRELAY_BROWSER_DB!;
  const url = "https://github.com/example/checkout/actions/runs/25";
  const evidence = {
    url, run: "Checkout validation", conclusion: "failure",
    steps: ["Validate checkout manifest"], candidates: [],
    jobLogEvidence: [{ url, errors: ["Checkout manifest is missing paymentSchemaRevision"] }],
  };
  remember({ evidence });
  const expires = String(Date.now() + 60000);
  const signature = createHmac("sha256", process.env.SHIFTRELAY_BROWSER_SECRET!).update(expires).digest("hex");
  await context.addCookies([{ name: "operator", value: expires + "." + signature, url: "http://127.0.0.1:3167" }]);
  await page.goto("/workspace");
  await expect(page.getByText("Workspace ready", { exact: true })).toBeVisible();
  sendWorkspaceCommand({ kind: "spotlight", steps: evidenceSpotlight(evidence) });
  await expect(page.getByRole("heading", { name: "Incident X-Ray" })).toBeVisible();
  const inspector = page.getByRole("complementary", { name: "Evidence inspector" });
  await expect(inspector).toContainText("paymentSchemaRevision");
  const node = page.getByTestId("evidence-canvas").getByText("Validator output", {exact: true});
  await expect(node).toBeInViewport();
  // Recheck after two workspace polling cycles to catch a delayed viewport reset.
  await page.waitForTimeout(2400);
  await expect(node).toBeInViewport();
  await expect(inspector).toContainText("paymentSchemaRevision");
});
