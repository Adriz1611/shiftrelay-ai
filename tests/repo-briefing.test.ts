import { afterEach, describe, expect, it, vi } from "vitest";
import { getRepositoryBriefing } from "../lib/repo-briefing";

function data(body: unknown, headers?: HeadersInit) {
  return Response.json(body, { headers });
}

function issue(number: number, date: string) {
  return {
    number,
    title: "Issue " + number,
    created_at: date,
    state: "open",
    user: { login: "author", type: "User" },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GitHub repository briefing", () => {
  it("uses the default branch and grades observed signals from read-only samples", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-21T12:00:00Z"));
    vi.stubEnv("GITHUB_REPOSITORY", "demo/briefing");
    vi.stubEnv("GITHUB_BRIEFING_LOGIN", "Operator");
    const recentIssue = issue(1, "2026-11-21T09:00:00Z");
    const fetch = vi.fn(async (input: string, options: RequestInit) => {
      expect(options.method ?? "GET").toBe("GET");
      const url = new URL(input);
      expect(url.origin).toBe("https://api.github.com");
      const path = url.pathname.replace("/repos/demo/briefing", "");
      switch (path) {
        case "":
          return data({ default_branch: "trunk" });
        case "/issues":
          return url.searchParams.get("state") === "open"
            ? data([recentIssue, issue(2, "2026-10-01T09:00:00Z")])
            : data([recentIssue, { ...recentIssue, number: 3, pull_request: {} }], {
              link: '<https://api.github.com/repos/demo/briefing/issues?page=2>; rel="next"',
            });
        case "/pulls":
          return data([{
            number: 3, title: "Review this change", created_at: recentIssue.created_at,
            requested_reviewers: [{ login: "operator" }],
            requested_teams: [{ slug: "checkout" }],
          }]);
        case "/actions/runs":
          expect(url.searchParams.get("branch")).toBe("trunk");
          return data({ workflow_runs: [
            { id: 10, workflow_id: 7, name: "Checkout CI", status: "completed", conclusion: "failure", created_at: recentIssue.created_at },
            { id: 9, workflow_id: 7, name: "Checkout CI", status: "completed", conclusion: "success", created_at: "2026-11-20T09:00:00Z" },
          ] });
        case "/commits":
          expect(url.searchParams.get("sha")).toBe("trunk");
          return data(["author", "author", "reviewer", "reviewer", "other"].map((login) => ({ author: { login, type: "User" } })));
        case "/issues/1/comments":
          return data([
            { user: { login: "bot", type: "Bot" }, created_at: "2026-11-21T09:05:00Z" },
            { user: { login: "author", type: "User" }, created_at: "2026-11-21T09:10:00Z" },
            { user: { login: "operator", type: "User" }, created_at: "2026-11-21T11:00:00Z" },
          ]);
        default:
          throw new Error("Unexpected GitHub read");
      }
    });
    vi.stubGlobal("fetch", fetch);

    const snapshots = await Promise.all([getRepositoryBriefing(), getRepositoryBriefing()]);
    const briefing = snapshots[0];
    expect(snapshots[1]).toBe(briefing);
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(briefing.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "new-issues", value: 1, limited: true }),
      expect.objectContaining({ id: "your-reviews", value: 1 }),
      expect.objectContaining({ id: "ci", label: "CI on trunk", value: 1 }),
      expect.objectContaining({ id: "issue-age", value: 2 }),
      expect.objectContaining({ id: "response-time", value: 2 }),
      expect.objectContaining({ id: "bus-factor", value: 2 }),
      expect.objectContaining({ id: "review-load", value: 2 }),
    ]));
    expect(briefing.evidence.map((item) => item.id)).toEqual(["ci-10", "review-3", "issue-1"]);
    expect(briefing.healthScore.map((signal) => signal.met)).toEqual([false, true, false, null, true]);
  });

  it("leaves unavailable reads and operator identity unknown", async () => {
    vi.stubEnv("GITHUB_REPOSITORY", "demo/restricted");
    vi.stubEnv("GITHUB_BRIEFING_LOGIN", "");
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/pulls")) return data([]);
      return new Response(null, { status: 403, headers: { "x-ratelimit-remaining": "0" } });
    }));

    const briefing = await getRepositoryBriefing();
    expect(briefing.metrics.find(({ id }) => id === "new-issues")?.value).toBeNull();
    expect(briefing.metrics.find(({ id }) => id === "your-reviews")?.value).toBeNull();
    expect(briefing.metrics.find(({ id }) => id === "review-load")?.value).toBe(0);
    expect(briefing.limitations.some((text) => text.includes("rate limiting"))).toBe(true);
    expect(briefing.evidence).toHaveLength(0);
  });
});
