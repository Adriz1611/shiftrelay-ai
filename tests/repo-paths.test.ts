import { describe, expect, it } from "vitest";
import { buildSprintPlan, type RepoIssue } from "../lib/repo-paths";
import { rehearsalIssues } from "../app/repo-paths/rehearsal";

function issue(number: number, body: string): RepoIssue {
  return { number, title: `Issue ${number}`, body, labels: [], url: `https://github.com/example/project/issues/${number}` };
}

describe("evidence-based sprint plan", () => {
  it("inserts verified prerequisites first and obeys the budget", () => {
    const result = buildSprintPlan([
      issue(1, "Effort: 1.5h\nImpact: critical\nDepends on: #2, #9"),
      issue(2, "- **Effort**: 0.5 hours\n**Impact:** low\nDepends on: none"),
      issue(3, "Effort: 1h\nImpact: high\nDepends on: none"),
    ], 2, new Map([[9, issue(9, "").url]]));
    expect(result.steps.map((step) => step.number)).toEqual([2, 1]);
    expect(result.steps[1].dependencies).toEqual([
      { number: 2, url: issue(2, "").url, closed: false },
      { number: 9, url: issue(9, "").url, closed: true },
    ]);
    expect(result.scheduledHours).toBe(2);
    expect(result.deferred[0].reason).toMatch(/exceed the time budget/);
  });

  it("identifies incomplete, contradictory, unknown, and cyclic dependencies", () => {
    const result = buildSprintPlan([
      issue(1, "Effort: 1h\nImpact: high\nDepends on: #2"),
      issue(2, "Effort: 1h\nImpact: high\nDepends on: #1"),
      issue(3, "Effort: 1h\nEffort: 1–2h\nImpact: low\nDepends on: none"),
      issue(4, "Effort: 1h\nImpact: high\nDepends on: #12"),
      issue(5, "Effort: 1h\nImpact: high"),
    ], 8);
    expect(result.steps).toEqual([]);
    expect(result.deferred).toEqual(expect.arrayContaining([
      expect.objectContaining({ number: 1, reason: "Dependency cycle #1 → #2 → #1" }),
      expect.objectContaining({ number: 3, reason: expect.stringContaining("Effort ambiguous") }),
      expect.objectContaining({ number: 4, reason: "Dependency #12 could not be verified" }),
      expect.objectContaining({ number: 5, reason: expect.stringContaining("Dependencies missing") }),
    ]));
  });

  it("rejects out-of-range and non-finite budgets", () => {
    for (const budget of [0.125, 169, Number.NaN, Infinity])
      expect(() => buildSprintPlan([], budget)).toThrow(/0.25 and 168 hours/);
  });

  it("rehearses the same planner with local evidence at different budgets", () => {
    expect(buildSprintPlan(rehearsalIssues, 2).steps.map((step) => step.number)).toEqual([1]);
    const plan = buildSprintPlan(rehearsalIssues, 3);
    expect(plan.steps.map((step) => step.url)).toEqual(["#sprint-example-1", "#sprint-example-2"]);
    expect(plan.steps[1].dependencies[0].url).toBe("#sprint-example-1");
    expect(buildSprintPlan(rehearsalIssues, 6).steps).toHaveLength(3);
  });
});
