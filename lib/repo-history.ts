import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./records";

export type RepoEvent = {
  key: string;
  type: "opened" | "closed" | "reopened";
  number: number;
  title: string;
  at: string;
  repository: string;
};

type GitHubIssue = {
  number?: number;
  title?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  pull_request?: unknown;
};

type GitHubIssueEvent = {
  event: string;
  created_at: string;
  issue?: GitHubIssue;
};

export function historyRepository() {
  const repo = process.env.GITHUB_REPOSITORY?.trim();
  return repo && /^[a-z\d][a-z\d-]{0,38}\/[\w.-]{1,100}$/i.test(repo)
    && !/\/\.{1,2}$/.test(repo) ? repo.toLowerCase() : null;
}

function asIssueEvent(repo: string, issue: GitHubIssue, type: unknown, timestamp: unknown): RepoEvent | null {
  if (
    (type !== "opened" && type !== "closed" && type !== "reopened") ||
    issue.pull_request || typeof issue.number !== "number" ||
    !Number.isSafeInteger(issue.number) || issue.number < 1 ||
    typeof issue.title !== "string" || typeof timestamp !== "string" ||
    !Number.isFinite(Date.parse(timestamp))
  ) return null;
  const at = new Date(timestamp).toISOString();
  return {
    key: `${repo}/${issue.number}/${type}/${at}`,
    type,
    repository: repo,
    number: issue.number,
    title: issue.title.slice(0, 300),
    at,
  };
}

export function matchesWebhookSignature(raw: Uint8Array, signature: string, secret: string) {
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

export function webhookIssueEvent(payload: unknown, repo: string): RepoEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { action, issue, repository } = payload as {
    action?: unknown;
    issue?: GitHubIssue;
    repository?: { full_name?: string };
  };
  if (typeof repository?.full_name !== "string" || repository.full_name.toLowerCase() !== repo ||
    typeof issue !== "object" || issue === null) return null;
  const at = action === "opened" ? issue.created_at :
    action === "closed" ? issue.closed_at : issue.updated_at;
  return asIssueEvent(repo, issue, action, at);
}

function eventDb(path?: string) {
  const database = db(path);
  database.exec(`
    CREATE TABLE IF NOT EXISTS repo_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repository TEXT NOT NULL,
      delivery TEXT NOT NULL UNIQUE,
      event_key TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS repo_events_repository_id ON repo_events(repository, id);
  `);
  return database;
}

export function persistRepoEvent(delivery: string, event: RepoEvent, path?: string) {
  const database = eventDb(path);
  try {
    return database.prepare(
      "INSERT OR IGNORE INTO repo_events(repository, delivery, event_key, data) VALUES (?, ?, ?, ?)",
    ).run(event.repository, delivery, event.key, JSON.stringify(event)).changes > 0;
  } finally {
    database.close();
  }
}

export function readRepoEvents(repository: string, after: number | null, path?: string) {
  const database = eventDb(path);
  try {
    const rows = after === null
      ? database.prepare("SELECT id, data FROM repo_events WHERE repository = ? ORDER BY id DESC LIMIT 100").all(repository).reverse()
      : database.prepare("SELECT id, data FROM repo_events WHERE repository = ? AND id > ? ORDER BY id LIMIT 100").all(repository, after);
    return rows.map((row) => ({ id: Number(row.id), event: JSON.parse(String(row.data)) as RepoEvent }));
  } finally {
    database.close();
  }
}

const pageLimit = 3;

async function readHistoryPages<T>(repo: string, path: string) {
  const entries: T[] = [];
  const token = process.env.GITHUB_TOKEN;
  try {
    for (let page = 1; page <= pageLimit; page++) {
      const response = await fetch(`https://api.github.com/repos/${repo}/${path}&per_page=100&page=${page}`, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: {
          Accept: "application/vnd.github+json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
      const items = await response.json() as T[];
      if (!Array.isArray(items)) throw new Error("GitHub history was unavailable.");
      entries.push(...items);
      if (!response.headers.get("link")?.includes('rel="next"')) return { entries, coverage: "complete" as const };
    }
    return { entries, coverage: "limited" as const };
  } catch {
    return { entries, coverage: "unavailable" as const };
  }
}

export async function loadRepoHistory(repository = historyRepository()) {
  if (!repository) return null;
  const [issues, transitions] = await Promise.all([
    readHistoryPages<GitHubIssue>(repository, "issues?state=all&sort=created&direction=desc"),
    readHistoryPages<GitHubIssueEvent>(repository, "issues/events?"),
  ]);
  const events = new Map<string, RepoEvent>();
  const add = (event: RepoEvent | null) => {
    if (event) events.set(event.key, event);
  };
  for (const issue of issues.entries) add(asIssueEvent(repository, issue, "opened", issue.created_at));
  for (const row of transitions.entries) {
    if (row.issue && (row.event === "reopened" || row.event === "closed")) {
      add(asIssueEvent(repository, row.issue, row.event, row.created_at));
    }
  }
  for (const row of readRepoEvents(repository, null)) add(row.event);
  return {
    repository,
    coverage: { issues: issues.coverage, transitions: transitions.coverage },
    events: [...events.values()].sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key)),
    loadedAt: new Date().toISOString(),
    webhookConfigured: Boolean(process.env.GITHUB_WEBHOOK_SECRET),
  };
}
