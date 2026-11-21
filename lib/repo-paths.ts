import { createHash } from "node:crypto";

export type RepoIssue = {
  number: number;
  title: string;
  url: string;
  body: string;
  labels: string[];
};

type PlanningIssue = RepoIssue & {
  hours: number | null;
  impact: number | null;
  dependencies: number[] | null;
  gaps: string[];
};

const impactScale = { low: 1, medium: 2, high: 3, critical: 4 };

function field(body: string, name: string) {
  return Array.from(
    body.matchAll(new RegExp(`^(?:[-*] +)?(?:\\*\\*)?${name}(?:\\*\\*)?[ \\t]*:(?:\\*\\*)?[ \\t]*(.*)$`, "gim")),
    (match) => match[1].trim().toLowerCase(),
  );
}

function explicitValue<T>(values: string[], parse: (value: string) => T | null) {
  if (!values.length) return { value: null, reason: "missing" };
  const parsed = values.map(parse);
  const first = parsed[0];
  if (first === null || parsed.some((value) => JSON.stringify(value) !== JSON.stringify(first)))
    return { value: null, reason: "ambiguous" };
  return { value: first, reason: null };
}

function parseHours(value: string) {
  const match = /^(\d+(?:\.\d+)?)\s*(?:h|hours?)$/.exec(value);
  const hours = match ? Number(match[1]) : 0;
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function parseDependencies(value: string) {
  if (value === "none") return [];
  if (!/^#\d+(?:\s*,\s*#\d+)*$/.test(value)) return null;
  const numbers = value.split(",").map((number) => Number(number.trim().slice(1)));
  if (numbers.some((number) => !Number.isSafeInteger(number) || number < 1)) return null;
  return [...new Set(numbers)].sort((a, b) => a - b);
}

function planningIssue(issue: RepoIssue): PlanningIssue {
  const effort = explicitValue(field(issue.body, "effort"), parseHours);
  const impact = explicitValue(field(issue.body, "impact"), (value) =>
    Object.hasOwn(impactScale, value) ? impactScale[value as keyof typeof impactScale] : null,
  );
  const dependencies = explicitValue(field(issue.body, "depends on"), parseDependencies);
  const gaps = [
    effort.reason && `Effort ${effort.reason}`,
    impact.reason && `Impact ${impact.reason}`,
    dependencies.reason && `Dependencies ${dependencies.reason}`,
  ].filter((gap): gap is string => Boolean(gap));
  return { ...issue, hours: effort.value, impact: impact.value, dependencies: dependencies.value, gaps };
}

function validateBudget(budgetHours: number) {
  if (!Number.isFinite(budgetHours) || budgetHours < 0.25 || budgetHours > 168)
    throw new Error("Enter a time budget between 0.25 and 168 hours.");
}

export function buildSprintPlan(
  issues: RepoIssue[],
  budgetHours: number,
  closedDependencies: Map<number, string> = new Map(),
) {
  validateBudget(budgetHours);

  const byNumber = new Map(issues.map((issue) => [issue.number, planningIssue(issue)]));
  const selected = new Set<number>();
  const steps: Array<{
    number: number; title: string; url: string; hours: number; impact: string;
    dependencies: Array<{ number: number; url: string; closed: boolean }>;
  }> = [];
  const deferred: Array<{ number: number; title: string; url: string; reason: string }> = [];
  let scheduledHours = 0;

  function collect(number: number, stack: number[], pending: Map<number, PlanningIssue>): string | null {
    if (selected.has(number) || pending.has(number) || closedDependencies.has(number)) return null;
    const cycleAt = stack.indexOf(number);
    if (cycleAt >= 0) return `Dependency cycle ${[...stack.slice(cycleAt), number].map((item) => `#${item}`).join(" → ")}`;
    const issue = byNumber.get(number);
    if (!issue) return `Dependency #${number} could not be verified`;
    for (const dependency of issue.dependencies ?? []) {
      const reason = collect(dependency, [...stack, number], pending);
      if (reason) return reason;
    }
    if (issue.gaps.length) return `#${number} · ${issue.gaps.join(", ")}`;
    pending.set(number, issue);
    return null;
  }

  const ranked = [...byNumber.values()].sort((a, b) =>
    (b.impact ?? 0) - (a.impact ?? 0) || (a.hours ?? Infinity) - (b.hours ?? Infinity) || a.number - b.number
  );
  for (const issue of ranked) {
    if (selected.has(issue.number)) continue;
    const pending = new Map<number, PlanningIssue>();
    const reason = collect(issue.number, [], pending);
    const totalHours = [...pending.values()].reduce((sum, item) => sum + (item.hours ?? 0), 0);
    if (reason || scheduledHours + totalHours > budgetHours + Number.EPSILON * budgetHours * 4) {
      deferred.push({
        number: issue.number, title: issue.title, url: issue.url,
        reason: reason ?? "Issue and its remaining prerequisites exceed the time budget",
      });
      continue;
    }
    scheduledHours += totalHours;
    for (const item of pending.values()) {
      selected.add(item.number);
      steps.push({
        number: item.number, title: item.title, url: item.url, hours: item.hours!,
        impact: Object.keys(impactScale)[item.impact! - 1],
        dependencies: item.dependencies!.map((number) => ({
          number,
          url: closedDependencies.get(number) ?? byNumber.get(number)!.url,
          closed: closedDependencies.has(number),
        })),
      });
    }
  }

  return {
    budgetHours,
    scheduledHours: Number(scheduledHours.toPrecision(12)),
    steps,
    deferred: deferred.filter((item) => !selected.has(item.number)),
  };
}

type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  pull_request?: unknown;
  labels: Array<string | { name: string }>;
};

function repository() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo))
    throw new Error("Set GITHUB_REPOSITORY to load repository evidence.");
  const url = `https://github.com/${repo}`;
  async function request<T>(path: string) {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      redirect: "error",
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error(`GitHub read failed (HTTP ${response.status}).`);
    return { data: await response.json() as T, next: response.headers.get("link")?.includes('rel="next"') ?? false };
  }
  async function issues(label?: string) {
    const filter = label ? `&labels=${encodeURIComponent(label)}` : "";
    const result: RepoIssue[] = [];
    let next = true;
    for (let page = 1; page <= 3 && next; page++) {
      const data = await request<GitHubIssue[]>(`/issues?state=open&per_page=100&page=${page}${filter}`);
      next = data.next;
      result.push(...data.data
        .filter((item) => !item.pull_request && item.state === "open")
        .map((item) => ({
          number: item.number,
          title: item.title,
          url: `${url}/issues/${item.number}`,
          body: item.body ?? "",
          labels: item.labels.map((value) => typeof value === "string" ? value : value.name),
        })));
    }
    return { issues: result, truncated: next };
  }
  const cacheKey = createHash("sha256").update(JSON.stringify([repo, token])).digest("hex");
  return { url, request, issues, cacheKey };
}

function readCache<T>() {
  const entries = new Map<string, { result: Promise<T>; expires: number }>();
  return (key: string, read: () => Promise<T>) => {
    const now = Date.now();
    for (const [entryKey, entry] of entries) {
      if (entry.expires <= now) entries.delete(entryKey);
    }
    const existing = entries.get(key);
    if (existing) return existing.result;
    const result = read().catch((error) => {
      if (entries.get(key)?.result === result) entries.delete(key);
      throw error;
    });
    entries.set(key, { result, expires: now + 20_000 });
    return result;
  };
}

type Repository = ReturnType<typeof repository>;

async function readPlanningEvidence(repo: Repository) {
  const { issues, truncated } = await repo.issues();
  const openNumbers = new Set(issues.map((issue) => issue.number));
  const outside = [...new Set(issues.flatMap((issue) => planningIssue(issue).dependencies ?? []))]
    .filter((number) => !openNumbers.has(number));
  const closed = new Map<number, string>();
  const lookupLimit = 24;
  const results = await Promise.allSettled(outside.slice(0, lookupLimit).map(async (number) => {
    const { data } = await repo.request<GitHubIssue>(`/issues/${number}`);
    if (!data.pull_request && data.state === "closed") closed.set(number, `${repo.url}/issues/${number}`);
  }));
  return {
    issues,
    closed,
    source: `${repo.url}/issues`,
    warnings: [
      ...(truncated ? ["Issue scan reached its three-page limit. Additional open issues may exist."] : []),
      ...(outside.length > lookupLimit || results.some((result) => result.status === "rejected")
        ? ["Some referenced dependencies could not be verified in the current GitHub read."] : []),
    ],
  };
}

const planningEvidenceCache = readCache<Awaited<ReturnType<typeof readPlanningEvidence>>>();

export async function readSprintPlan(budgetHours: number) {
  validateBudget(budgetHours);
  const repo = repository();
  const { issues, closed, source, warnings } = await planningEvidenceCache(repo.cacheKey, () => readPlanningEvidence(repo));
  return { ...buildSprintPlan(issues, budgetHours, closed), source, warnings };
}

async function loadContributorGuide(repo: Repository) {
  const [starters, branch] = await Promise.all([
    repo.issues("good first issue"),
    repo.request<{ default_branch: string }>(""),
  ]);
  const { data: commit } = await repo.request<{ sha: string; commit: { tree: { sha: string } } }>(
    `/commits/${encodeURIComponent(branch.data.default_branch)}`,
  );
  const { data: tree } = await repo.request<{ tree: Array<{ path: string; type: string; mode: string }>; truncated: boolean }>(
    `/git/trees/${commit.commit.tree.sha}?recursive=1`,
  );
  const files = new Set(tree.tree.filter((file) => file.type === "blob" && file.mode !== "120000").map((file) => file.path));
  const fileLink = (path: string) => ({
    path,
    url: `${repo.url}/blob/${commit.sha}/${path.split("/").map(encodeURIComponent).join("/")}`,
  });
  const guides = [
    { title: "Read the project overview", match: /^readme(?:\.[^/]+)?$/i },
    { title: "Read the contribution guide", match: /^(?:(?:\.github|docs)\/)?contributing(?:\.[^/]+)?$/i },
    { title: "Inspect the project configuration", match: /^(?:package\.json|pyproject\.toml|cargo\.toml|go\.mod)$/i },
    { title: "Review the repository runbook", match: /^(?:docs\/)?(?:[\w.-]+-)?runbook\.md$/i },
  ].flatMap(({ title, match }) => {
    const path = [...files].find((file) => match.test(file));
    return path ? [{ title, ...fileLink(path) }] : [];
  });
  const issues = starters.issues
    .filter((issue) => issue.labels.some((label) => label.toLowerCase() === "good first issue"))
    .map(({ number, title, url, body }) => {
      const mentioned = [...new Set(body.match(/[\w.@+/-]+/g) ?? [])].filter((path) => files.has(path)).slice(0, 8);
      return { number, title, url, files: mentioned.map(fileLink) };
    });
  return {
    source: `${repo.url}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22`,
    ref: branch.data.default_branch,
    revision: commit.sha,
    guides,
    issues,
    warnings: [
      ...(starters.truncated ? ["Issue scan reached its three-page limit. Additional starter issues may exist."] : []),
      ...(tree.truncated ? ["GitHub returned a partial file tree. Some repository files may be missing from this guide."] : []),
    ],
  };
}

const contributorGuideCache = readCache<Awaited<ReturnType<typeof loadContributorGuide>>>();

export async function readContributorGuide() {
  const repo = repository();
  return contributorGuideCache(repo.cacheKey, () => loadContributorGuide(repo));
}

export type SprintPlan = Awaited<ReturnType<typeof readSprintPlan>>;
export type ContributorGuide = Awaited<ReturnType<typeof readContributorGuide>>;
