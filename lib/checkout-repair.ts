import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { db } from "./records";

const repo = "Adriz1611/shiftrelay-checkout-demo";
const path = "checkout/manifest.json";
async function github<T>(url: string, method = "GET", body?: object) {
  if (process.env.GITHUB_REPOSITORY?.toLowerCase() !== repo.toLowerCase())
    throw new Error("Repairs are scoped to the checkout demo repository.");
  if (!process.env.GITHUB_TOKEN) throw new Error("Configure the GitHub token.");
  const response = await fetch("https://api.github.com/repos/" + repo + url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    headers: {
      Authorization: "Bearer " + process.env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404 && method === "GET") return null;
  if (!response.ok) {
    if (method !== "GET" && [403, 404].includes(response.status))
      throw new Error(
        "GitHub denied the write. Grant Contents and Pull requests Read and write for the demo repository.",
      );
    throw new Error(
      "GitHub repair request failed (HTTP " + response.status + ").",
    );
  }
  return (await response.json()) as T;
}

async function manifest(ref: string) {
  const file = await github<{ sha: string; content: string; encoding: string }>(
    "/contents/" + path + "?ref=" + encodeURIComponent(ref),
  );
  if (!file || file.encoding !== "base64")
    throw new Error("Checkout manifest is unavailable.");
  const value: unknown = JSON.parse(
    Buffer.from(file.content, "base64").toString("utf8"),
  );
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Checkout manifest must contain a JSON object.");
  return { sha: file.sha, value: value as Record<string, unknown> };
}

type Evidence = {
  url?: string;
  conclusion?: string;
  jobLogEvidence?: { errors: string[] }[];
  comparison?: {
    revision?: string;
    baseline?: { revision?: string } | null;
    manifestChange?: { patch?: string } | null;
  };
};

export async function proposeRepair(evidence: Evidence) {
  const failing = evidence.comparison?.revision;
  const passing = evidence.comparison?.baseline?.revision;
  if (
    evidence.conclusion !== "failure" ||
    !failing ||
    !passing ||
    !/^[a-f0-9]{40}$/.test(failing) ||
    !/^[a-f0-9]{40}$/.test(passing) ||
    !evidence.comparison?.manifestChange?.patch
      ?.split("\n")
      .some((line) => /^-.*"paymentSchemaRevision"/.test(line)) ||
    !evidence.jobLogEvidence?.some((job) =>
      job.errors.includes("Checkout manifest is missing paymentSchemaRevision"),
    )
  )
    throw new Error(
      "This run does not establish the specific checkout manifest repair.",
    );
  const [before, failed, current] = await Promise.all([
    manifest(passing),
    manifest(failing),
    manifest("main"),
  ]);
  const restored = before.value.paymentSchemaRevision;
  if (
    typeof restored !== "string" ||
    !restored.trim() ||
    "paymentSchemaRevision" in failed.value
  )
    throw new Error("Cannot verify which revision should be restored.");
  if (current.sha !== failed.sha)
    throw new Error("The manifest on main changed. Run a new investigation.");
  const content =
    JSON.stringify(
      { ...current.value, paymentSchemaRevision: restored },
      null,
      2,
    ) + "\n";
  const id = createHash("sha256")
    .update(JSON.stringify([repo, failing, passing, current.sha, content]))
    .digest("hex");
  return {
    id,
    content,
    revision: restored,
    manifestSha: current.sha,
    sourceRun: evidence.url,
    branch: "shiftrelay/restore-checkout-" + failing.slice(0, 12),
  };
}
type Proposal = Awaited<ReturnType<typeof proposeRepair>>;
type PR = {
  number: number;
  html_url: string;
  merged_at?: string | null;
  merge_commit_sha: string | null;
  head: { sha: string };
};
type ValidationRun = { url: string; status: string; conclusion: string | null };
type Verification = {
  pullRequestRun: ValidationRun | null;
  mainRun: ValidationRun | null;
  merged: boolean;
};
type Receipt = {
  id: string;
  number: number;
  url: string;
  headSha: string;
  branch: string;
  sourceRun?: string;
  verification?: Verification;
};

export function repairReceipt(id: string, value?: Receipt): Receipt | null {
  const connection = db();
  try {
    connection.exec(
      "CREATE TABLE IF NOT EXISTS checkout_repairs (id TEXT PRIMARY KEY, receipt TEXT NOT NULL)",
    );
    if (value)
      connection
        .prepare("INSERT OR REPLACE INTO checkout_repairs VALUES (?, ?)")
        .run(id, JSON.stringify(value));
    const row = connection
      .prepare("SELECT receipt FROM checkout_repairs WHERE id=?")
      .get(id);
    return row ? JSON.parse(String(row.receipt)) : null;
  } finally {
    connection.close();
  }
}

export function latestRepair(): Receipt | null {
  const connection = db();
  try {
    connection.exec(
      "CREATE TABLE IF NOT EXISTS checkout_repairs (id TEXT PRIMARY KEY, receipt TEXT NOT NULL)",
    );
    const row = connection
      .prepare(
        "SELECT receipt FROM checkout_repairs ORDER BY rowid DESC LIMIT 1",
      )
      .get();
    return row ? JSON.parse(String(row.receipt)) : null;
  } finally {
    connection.close();
  }
}

export async function approveRepair(plan: Proposal) {
  const saved = repairReceipt(plan.id);
  if (saved) return saved;
  const route = "/git/ref/heads/" + plan.branch;
  if (!(await github(route))) {
    const base = await github<{ object: { sha: string } }>(
      "/git/ref/heads/main",
    );
    if (!base) throw new Error("Main branch unavailable.");
    try {
      await github("/git/refs", "POST", {
        ref: "refs/heads/" + plan.branch,
        sha: base.object.sha,
      });
    } catch (error) {
      if (!(await github(route))) throw error;
    }
  }
  const current = await manifest(plan.branch);
  const expected: unknown = JSON.parse(plan.content);
  if (current.sha === plan.manifestSha) {
    try {
      await github("/contents/" + path, "PUT", {
        branch: plan.branch,
        sha: current.sha,
        message: "Restore checkout payment schema revision",
        content: Buffer.from(plan.content).toString("base64"),
      });
    } catch (error) {
      if (!isDeepStrictEqual((await manifest(plan.branch)).value, expected))
        throw error;
    }
  } else if (!isDeepStrictEqual(current.value, expected))
    throw new Error("The repair branch contains an unexpected manifest.");
  const lookup = async () =>
    (
      await github<PR[]>(
        "/pulls?state=all&base=main&head=" +
          encodeURIComponent(repo.split("/")[0] + ":" + plan.branch),
      )
    )?.[0];
  let pr = await lookup();
  if (!pr) {
    const comparison = await github<{ files: { filename: string }[] }>(
      "/compare/main..." + encodeURIComponent(plan.branch),
    );
    if (
      comparison?.files?.length !== 1 ||
      comparison.files[0].filename !== path
    )
      throw new Error(
        "Repair branch changes must be limited to the checkout manifest.",
      );
    try {
      pr =
        (await github<PR>("/pulls", "POST", {
          title: "Restore checkout payment schema revision",
          head: plan.branch,
          base: "main",
          body:
            "Operator-approved ShiftRelay repair. Restores the schema revision from the last passing manifest.\n\nFailed run: " +
            plan.sourceRun,
        })) ?? undefined;
    } catch (error) {
      pr = await lookup();
      if (!pr) throw error;
    }
  }
  if (!pr || !isDeepStrictEqual((await manifest(pr.head.sha)).value, expected))
    throw new Error("PR head did not match the approved manifest.");
  const files = await github<{ filename: string }[]>(
    "/pulls/" + pr.number + "/files",
  );
  if (files?.length !== 1 || files[0].filename !== path)
    throw new Error("PR contains changes outside the approved manifest.");
  const receipt = {
    id: plan.id,
    number: pr.number,
    url: pr.html_url,
    headSha: pr.head.sha,
    branch: plan.branch,
    sourceRun: plan.sourceRun,
  };
  repairReceipt(plan.id, receipt);
  return receipt;
}

export async function verifyRepair(receipt: Receipt) {
  const pr = await github<PR>("/pulls/" + receipt.number);
  if (!pr || pr.head.sha !== receipt.headSha)
    throw new Error(
      "The PR head changed after approval. Inspect it on GitHub.",
    );
  const workflow = encodeURIComponent(
    process.env.GITHUB_WORKFLOW_ID || "checkout.yml",
  );
  async function run(sha: string, ref: string, event: string) {
    const query = new URLSearchParams({ branch: ref, event, per_page: "10" });
    const result = await github<{
      workflow_runs: {
        head_sha: string;
        html_url: string;
        status: string;
        conclusion: string | null;
        pull_requests?: { number: number; head: { sha: string } }[];
      }[];
    }>("/actions/workflows/" + workflow + "/runs?" + query);
    const match = result?.workflow_runs.find(
      (candidate) =>
        candidate.head_sha === sha ||
        (event === "pull_request" &&
          candidate.pull_requests?.some(
            (item) => item.number === receipt.number && item.head.sha === sha,
          )),
    );
    return match
      ? {
          url: match.html_url,
          status: match.status,
          conclusion: match.conclusion,
        }
      : null;
  }
  const [pullRequestRun, mainRun] = await Promise.all([
    run(receipt.headSha, receipt.branch, "pull_request"),
    pr.merged_at && pr.merge_commit_sha
      ? run(pr.merge_commit_sha, "main", "push")
      : null,
  ]);
  const verification = {
    pullRequestRun,
    mainRun,
    merged: Boolean(pr.merged_at),
  };
  repairReceipt(receipt.id, { ...receipt, verification });
  return verification;
}
