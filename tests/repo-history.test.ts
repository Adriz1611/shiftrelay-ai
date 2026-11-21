import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { matchesWebhookSignature, persistRepoEvent, readRepoEvents, webhookIssueEvent } from "../lib/repo-history";

const repo = "demo/repo";
const updatedAt = "2026-01-02T12:00:00Z";
const payload = {
  action: "reopened",
  repository: { full_name: "Demo/Repo" },
  issue: { number: 5, title: "Checkout failures", updated_at: updatedAt },
};

describe("repository issue events", () => {
  it("verifies the exact UTF-8 request bytes", () => {
    const secret = "test webhook secret";
    const body = Buffer.from('{"title":"Réouvert"}');
    const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(matchesWebhookSignature(body, signature, secret)).toBe(true);
    expect(matchesWebhookSignature(Buffer.concat([body, Buffer.from("\n")]), signature, secret)).toBe(false);
    expect(matchesWebhookSignature(body, signature.slice(0, -2), secret)).toBe(false);
  });

  it("scopes signed events to one repository and records real reopen timestamps", () => {
    expect(webhookIssueEvent(payload, repo)).toMatchObject({ type: "reopened", at: "2026-01-02T12:00:00.000Z" });
    expect(webhookIssueEvent(payload, "other/repo")).toBeNull();
    expect(webhookIssueEvent({ ...payload, action: "edited" }, repo)).toBeNull();
    expect(webhookIssueEvent({ ...payload, action: "closed" }, repo)).toBeNull();
    expect(webhookIssueEvent({ ...payload, issue: { ...payload.issue, pull_request: {} } }, repo)).toBeNull();
  });

  it("deduplicates deliveries and authoritatively scopes cursor reads", () => {
    const directory = mkdtempSync(join(tmpdir(), "shiftrelay-history-"));
    const path = join(directory, "events.sqlite");
    try {
      const first = webhookIssueEvent(payload, repo)!;
      const other = webhookIssueEvent({ ...payload, repository: { full_name: "other/repo" } }, "other/repo")!;
      const next = webhookIssueEvent({ ...payload, action: "closed", issue: { ...payload.issue, closed_at: "2026-01-03T02:00:00Z" } }, repo)!;
      expect(persistRepoEvent("delivery-1", first, path)).toBe(true);
      expect(persistRepoEvent("delivery-1", first, path)).toBe(false);
      expect(persistRepoEvent("delivery-2", first, path)).toBe(false);
      expect(persistRepoEvent("delivery-3", other, path)).toBe(true);
      expect(persistRepoEvent("delivery-4", next, path)).toBe(true);
      const initial = readRepoEvents(repo, null, path);
      expect(initial.map(({ event }) => event.type)).toEqual(["reopened", "closed"]);
      expect(readRepoEvents(repo, initial[0].id, path)).toEqual([initial[1]]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
