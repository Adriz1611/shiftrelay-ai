import type { RepoIssue } from "../../lib/repo-paths";

export const rehearsalIssues: RepoIssue[] = [
  {
    number: 1,
    title: "Prepare checkout test data",
    body: "Effort: 2h\nImpact: medium\nDepends on: none",
    url: "#sprint-example-1",
    labels: [],
  },
  {
    number: 2,
    title: "Verify checkout against the test data",
    body: "Effort: 1h\nImpact: high\nDepends on: #1",
    url: "#sprint-example-2",
    labels: [],
  },
  {
    number: 3,
    title: "Refresh the checkout runbook",
    body: "Effort: 3h\nImpact: low\nDepends on: none",
    url: "#sprint-example-3",
    labels: [],
  },
];
