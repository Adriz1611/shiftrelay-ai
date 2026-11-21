import { z } from "zod";

const PAGE_SIZE = 50;
const RESPONSE_SAMPLE_SIZE = 5;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const CACHE_TIME = 60_000;
const account = z.object({ login: z.string(), type: z.string().optional() });
const timestamp = z.iso.datetime({ offset: true });
const issue = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  created_at: timestamp,
  state: z.string(),
  user: account.nullable(),
  pull_request: z.unknown().optional(),
});
const pull = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  created_at: timestamp,
  requested_reviewers: z.array(account),
  requested_teams: z.array(z.object({ slug: z.string() })),
});
const run = z.object({
  id: z.number().int().positive(),
  workflow_id: z.number().int().positive(),
  name: z.string().nullable(),
  status: z.string(),
  conclusion: z.string().nullable(),
  created_at: timestamp,
});
const comment = z.object({ user: account.nullable(), created_at: timestamp });
const commit = z.object({ author: account.nullable() });

type Read<T> =
  | { data: T; limited: boolean }
  | { error: string };

type Evidence = {
  id: string;
  kind: "ci" | "review" | "issue";
  title: string;
  detail: string;
  url: string;
  timestamp: string;
};

type Metric = {
  id: string;
  label: string;
  value: number | null;
  detail: string;
  sourceUrl: string;
  limited: boolean;
};

export type RepositoryBriefing = {
  repository: string | null;
  asOf: string;
  since: string;
  summary: string;
  metrics: Metric[];
  evidence: Evidence[];
  limitations: string[];
  healthScore: { label: string; met: boolean | null; threshold: string }[];
};

type Config = { repository: string; token?: string; login?: string };
let cached: { config: Config; expiry: number; promise: Promise<RepositoryBriefing> } | undefined;

export async function getRepositoryBriefing(): Promise<RepositoryBriefing> {
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const now = Date.now();
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    repository.split("/").some((part) => part === "." || part === "..")) {
    return {
      repository: null,
      asOf: new Date(now).toISOString(),
      since: new Date(now - DAY).toISOString(),
      summary: "Repository briefing is unavailable. Set GITHUB_REPOSITORY to owner/repository.",
      metrics: [],
      evidence: [],
      limitations: [],
      healthScore: [],
    };
  }
  const config = {
    repository,
    token: process.env.GITHUB_TOKEN,
    login: process.env.GITHUB_BRIEFING_LOGIN?.trim().toLowerCase(),
  };
  if (
    cached?.config.repository === config.repository &&
    cached.config.token === config.token &&
    cached.config.login === config.login &&
    cached.expiry > now
  ) {
    return cached.promise;
  }
  const promise = buildBriefing(config, now);
  cached = { config, expiry: now + CACHE_TIME, promise };
  return promise;
}

async function buildBriefing({ repository, token, login }: Config, now: number): Promise<RepositoryBriefing> {
  const asOf = new Date(now).toISOString();
  const since = new Date(now - DAY).toISOString();
  const healthSince = new Date(now - 30 * DAY).toISOString();
  const repoUrl = "https://github.com/" + repository;
  const limitations: string[] = [];

  async function read<T>(
    path: string,
    schema: z.ZodType<T>,
    permission: string,
  ): Promise<Read<T>> {
    try {
      const response = await fetch("https://api.github.com/repos/" + repository + path, {
        cache: "no-store",
        signal: AbortSignal.timeout(5500),
        redirect: "error",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
      });
      if (response.status === 429 || (
        response.status === 403 &&
        (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after"))
      )) {
        return { error: "GitHub is rate limiting these reads." };
      }
      if ([401, 403, 404].includes(response.status)) {
        return { error: "GitHub could not provide access. Verify repository visibility and " + permission + " read permission." };
      }
      if (!response.ok) return { error: "GitHub returned HTTP " + response.status + "." };
      const result = schema.safeParse(await response.json());
      if (!result.success) return { error: "GitHub returned an unexpected response." };
      return { data: result.data, limited: /rel="next"/.test(response.headers.get("link") ?? "") };
    } catch {
      return { error: "The GitHub read failed or timed out." };
    }
  }

  const issueSort = "&sort=created&direction=desc&per_page=" + PAGE_SIZE;
  const [metadata, recentItems, openItems, pulls] = await Promise.all([
    read("", z.object({ default_branch: z.string() }), "Metadata"),
    read("/issues?state=all" + issueSort, z.array(issue), "Issues"),
    read("/issues?state=open" + issueSort, z.array(issue), "Issues"),
    read("/pulls?state=open" + issueSort, z.array(pull), "Pull requests"),
  ]);
  const branch = "data" in metadata ? metadata.data.default_branch : null;
  const branchParameter = encodeURIComponent(branch ?? "");
  const newIssues = "data" in recentItems
    ? recentItems.data.filter((item) => !item.pull_request && Date.parse(item.created_at) >= now - DAY)
    : [];
  const openIssues = "data" in openItems ? openItems.data.filter((item) => !item.pull_request) : [];
  const responseIssues = "data" in recentItems
    ? recentItems.data.filter((item) => !item.pull_request && item.user &&
        Date.parse(item.created_at) >= now - 30 * DAY).slice(0, RESPONSE_SAMPLE_SIZE)
    : [];
  const [runs, commits, responseReads] = await Promise.all([
    branch
      ? read("/actions/runs?branch=" + branchParameter + "&exclude_pull_requests=true&per_page=" + PAGE_SIZE,
          z.object({ workflow_runs: z.array(run) }), "Actions")
      : Promise.resolve<Read<{ workflow_runs: z.infer<typeof run>[] }>>({ error: "Default branch unavailable." }),
    branch
      ? read("/commits?sha=" + branchParameter + "&since=" + encodeURIComponent(healthSince)
          + "&per_page=" + PAGE_SIZE, z.array(commit), "Contents")
      : Promise.resolve<Read<z.infer<typeof commit>[]>>({ error: "Default branch unavailable." }),
    Promise.all(responseIssues.map((item) =>
      read("/issues/" + item.number + "/comments?per_page=" + PAGE_SIZE, z.array(comment), "Issues"),
    )),
  ]);
  const sampledPulls = "data" in pulls ? pulls.data : [];
  const myPulls = login ? sampledPulls.filter((item) => item.requested_reviewers.some(
    (reviewer) => reviewer.login.toLowerCase() === login,
  )) : [];
  const reviewLoad = new Map<string, number>();
  for (const item of sampledPulls) {
    for (const reviewer of [
      ...item.requested_reviewers.map((user) => "@" + user.login),
      ...item.requested_teams.map((team) => "team " + team.slug),
    ]) {
      reviewLoad.set(reviewer, (reviewLoad.get(reviewer) ?? 0) + 1);
    }
  }
  const leadingReviewers = [...reviewLoad.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => name + " (" + count + ")");

  const latestByWorkflow = new Map<number, z.infer<typeof run>>();
  if ("data" in runs) {
    for (const item of runs.data.workflow_runs) {
      const previous = latestByWorkflow.get(item.workflow_id);
      if (!previous || Date.parse(item.created_at) > Date.parse(previous.created_at) ||
        (Date.parse(item.created_at) === Date.parse(previous.created_at) && item.id > previous.id)) {
        latestByWorkflow.set(item.workflow_id, item);
      }
    }
  }
  const latestRuns = [...latestByWorkflow.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const failures = latestRuns.filter((item) =>
    item.status === "completed" &&
    ["failure", "timed_out", "startup_failure", "action_required"].includes(item.conclusion ?? ""),
  );
  const passed = latestRuns.filter((item) => item.status === "completed" && item.conclusion === "success").length;
  const pending = latestRuns.filter((item) => item.status !== "completed").length;
  const other = latestRuns.length - passed - pending - failures.length;

  const contributionCounts = new Map<string, number>();
  const sampledCommits = "data" in commits ? commits.data : [];
  for (const item of sampledCommits) {
    const author = item.author;
    if (author?.type === "User") {
      const key = author.login.toLowerCase();
      contributionCounts.set(key, (contributionCounts.get(key) ?? 0) + 1);
    }
  }
  const contributions = [...contributionCounts.values()].sort((a, b) => b - a);
  const attributed = contributions.reduce((sum, count) => sum + count, 0);
  let covered = 0;
  let concentration = 0;
  for (const count of contributions) {
    if (covered >= attributed / 2) break;
    covered += count;
    concentration++;
  }

  const ages = [0, 0, 0];
  for (const item of openIssues) {
    const age = (now - Date.parse(item.created_at)) / DAY;
    ages[age < 7 ? 0 : age < 30 ? 1 : 2]++;
  }
  const responseHours = responseReads.flatMap((result, index) => {
    if ("error" in result) return [];
    const item = responseIssues[index];
    const opened = Date.parse(item.created_at);
    const firstResponse = result.data.find(({ user, created_at }) =>
      user?.type === "User" && user.login.toLowerCase() !== item.user?.login.toLowerCase() && Date.parse(created_at) >= opened,
    );
    return firstResponse ? [(Date.parse(firstResponse.created_at) - opened) / HOUR] : [];
  }).sort((a, b) => a - b);
  const center = Math.floor(responseHours.length / 2);
  const median = responseHours.length
    ? (responseHours[center] + responseHours[Math.floor((responseHours.length - 1) / 2)]) / 2
    : null;

  if ("error" in metadata) limitations.push("Default branch. " + metadata.error);
  if (!login) limitations.push("Set GITHUB_BRIEFING_LOGIN to the operator’s GitHub username for personal review requests. Team membership is unavailable.");
  if (responseReads.some((result) => "error" in result)) limitations.push("First-response timing could not read some issue comment lists.");
  if (responseReads.some((result) => "limited" in result && result.limited)) limitations.push("Some issue threads extend beyond the first 50 comments.");
  const issueCountLimited = "data" in recentItems && recentItems.limited &&
    Date.parse(recentItems.data.at(-1)?.created_at ?? since) >= now - DAY;

  function metric(id: string, label: string, value: number | null, detail: string, path: string,
    source: Read<unknown>, hasMore?: boolean): Metric {
    if ("error" in source) {
      limitations.push(label + ". " + source.error);
      return { id, label, value: null, detail: source.error, sourceUrl: repoUrl + path, limited: true };
    }
    return { id, label, value, detail, sourceUrl: repoUrl + path, limited: hasMore ?? source.limited };
  }

  const metrics = [
    metric("new-issues", "New issues", newIssues.length, "Opened in the last 24 hours, including issues already closed. Pull requests excluded.", "/issues?q=is%3Aissue+sort%3Acreated-desc", recentItems, issueCountLimited),
    metric("your-reviews", "PRs awaiting your review", login ? myPulls.length : null,
      login ? "Direct requests for @" + login + " on " + sampledPulls.length + " sampled open PRs. Team requests excluded." : "GitHub operator identity is unavailable.",
      "/pulls", pulls),
    metric("ci", "CI on " + (branch ?? "the default branch"), latestRuns.length ? failures.length : null,
      latestRuns.length
        ? failures.length + " failing · " + passed + " passed · " + pending + " pending · " + other + " other. Latest visible run per workflow from the last " + ("data" in runs ? runs.data.workflow_runs.length : 0) + " runs on this branch."
        : "No workflow runs returned for this branch.",
      "/actions" + (branch ? "?query=branch%3A" + branchParameter : ""), runs),
    metric("bus-factor", "Bus factor proxy", concentration || null,
      (branch ?? "Default branch") + " commit concentration over 30 days. Number of authors accounting for at least half of " + attributed + " attributable human-authored commits (" + sampledCommits.length + " commits sampled).",
      branch ? "/commits/" + branchParameter + "/" : "/commits", commits),
    metric("issue-age", "Open issue age", openIssues.length,
      ages[0] + " under 7 days · " + ages[1] + " aged 7–29 days · " + ages[2] + " aged 30+ days. GitHub’s newest open issue and PR records, filtered to issues.",
      "/issues?q=is%3Aissue+is%3Aopen+sort%3Acreated-desc", openItems),
    metric("response-time", "Median first response (hours)", median === null ? null : Math.round(median * 10) / 10,
      responseHours.length + " of " + responseIssues.length + " sampled issues opened in the last 30 days had an observed first non-author human comment. Unanswered issues excluded.",
      "/issues?q=is%3Aissue+sort%3Acreated-desc", recentItems, true),
    metric("review-load", "Requested reviews", [...reviewLoad.values()].reduce((sum, count) => sum + count, 0),
      "Outstanding individual and team requests across " + sampledPulls.length + " sampled open PRs."
      + (leadingReviewers.length ? " Highest observed load: " + leadingReviewers.join(", ") + "." : ""),
      "/pulls", pulls),
  ];
  const ciSummary = "error" in runs || !latestRuns.length ? "CI status is unavailable"
    : failures.length + " failing " + (failures.length === 1 ? "workflow" : "workflows") + " in the latest observed runs on " + branch;
  const issuesSummary = "error" in recentItems ? "new issue count unavailable"
    : newIssues.length + (issueCountLimited ? " or more" : "") + " new " + (newIssues.length === 1 ? "issue" : "issues") + " in the last 24 hours";
  const reviewSummary = !login || "error" in pulls ? "your review queue is unavailable"
    : myPulls.length + " sampled " + (myPulls.length === 1 ? "PR requests" : "PRs request") + " your review";
  const evidence: Evidence[] = [
    ...[...failures, ...latestRuns.filter((item) => !failures.includes(item))].slice(0, 4).map((item) => ({
      id: "ci-" + item.id,
      kind: "ci" as const,
      title: (item.name ?? "Workflow run").slice(0, 160),
      detail: (item.conclusion ?? item.status).replaceAll("_", " "),
      url: repoUrl + "/actions/runs/" + item.id,
      timestamp: item.created_at,
    })),
    ...myPulls.slice(0, 4).map((item) => ({
      id: "review-" + item.number,
      kind: "review" as const,
      title: item.title.slice(0, 160),
      detail: "Review requested · #" + item.number,
      url: repoUrl + "/pull/" + item.number,
      timestamp: item.created_at,
    })),
    ...newIssues.slice(0, 4).map((item) => ({
      id: "issue-" + item.number,
      kind: "issue" as const,
      title: item.title.slice(0, 160),
      detail: "New issue · #" + item.number + " · " + item.state,
      url: repoUrl + "/issues/" + item.number,
      timestamp: item.created_at,
    })),
  ];
  const healthScore = [
    {
      label: "Default branch CI",
      met: failures.length > 0 ? false : latestRuns.length > 0 && passed === latestRuns.length ? true : null,
      threshold: "Every latest observed workflow run passed. Pending and other statuses leave this signal unknown.",
    },
    {
      label: "Commit concentration",
      met: attributed >= 5 ? concentration >= 2 : null,
      threshold: "At least two authors accounted for half the observed human commits. Requires five attributed commits.",
    },
    {
      label: "Open issue age",
      met: openIssues.length ? ages[2] / openIssues.length <= 0.25 : null,
      threshold: "At most a quarter of observed open issues are 30 days or older. Requires at least one observed open issue.",
    },
    {
      label: "First response",
      met: median !== null && responseHours.length >= 3 ? median <= 24 : null,
      threshold: "Median first response at most 24 hours. Requires three observed responses.",
    },
    {
      label: "Review load",
      met: "data" in pulls ? [...reviewLoad.values()].every((count) => count <= 3) : null,
      threshold: "At most three observed outstanding review requests per person or team.",
    },
  ];
  return {
    repository, asOf, since,
    summary: [ciSummary, issuesSummary, reviewSummary]
      .map((signal) => signal.charAt(0).toUpperCase() + signal.slice(1) + ".").join(" "),
    metrics, evidence, limitations, healthScore,
  };
}
