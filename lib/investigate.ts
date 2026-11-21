export async function readHistoricalIssue(url: string) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const parsed = new URL(url);
  const match = /^\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)$/.exec(parsed.pathname);
  if (
    parsed.origin !== "https://github.com" ||
    !match ||
    match[1].toLowerCase() !== repo?.toLowerCase()
  )
    return null;
  try {
    const response = await fetch(
      "https://api.github.com/repos/" + match[1] + "/issues/" + match[2],
      {
        headers: {
          Accept: "application/vnd.github+json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      },
    );
    if (!response.ok) return null;
    const issue = await response.json();
    if (issue.pull_request || issue.number !== Number(match[2])) return null;
    return {
      number: issue.number,
      title: String(issue.title),
      url: parsed.href,
      state: String(issue.state),
      excerpt: typeof issue.body === "string" ? issue.body.slice(0, 700) : null,
    };
  } catch {
    return null;
  }
}

export async function investigate(
  onEvidence?: (evidence: Record<string, unknown>) => void,
) {
  const repo = process.env.GITHUB_REPOSITORY;
  const workflow = process.env.GITHUB_WORKFLOW_ID;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !workflow)
    throw new Error(
      "Set GITHUB_REPOSITORY and GITHUB_WORKFLOW_ID to investigate checkout.",
    );
  async function request(path: string) {
    const token = process.env.GITHUB_TOKEN;
    const res = await fetch("https://api.github.com/repos/" + repo + path, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
    });
    if (!res.ok)
      throw new Error("GitHub read failed (HTTP " + res.status + ").");
    return res;
  }
  async function read(path: string) {
    return (await request(path)).json();
  }
  const runs = await read(
    "/actions/workflows/" + encodeURIComponent(workflow) + "/runs?per_page=1&event=push&branch=" +
      encodeURIComponent(process.env.GITHUB_DEPLOY_BRANCH || "main"),
  );
  const run = runs.workflow_runs[0];
  if (!run) throw new Error("This workflow has no runs.");
  onEvidence?.({
    run: run.display_title,
    url: run.html_url,
    conclusion: run.conclusion ?? run.status,
    createdAt: run.created_at,
  });
  const jobs = await read("/actions/runs/" + run.id + "/jobs?per_page=100");
  const steps: string[] = jobs.jobs.flatMap(
    (j: { name: string; steps?: { name: string; conclusion: string }[] }) =>
      (j.steps ?? [])
        .filter((s) => s.conclusion === "failure")
        .map((s) => j.name + " / " + s.name),
  );
  onEvidence?.({ steps });
  const failedJobs = jobs.jobs
    .filter(
      (job: { id: number; conclusion: string }) =>
        Number.isSafeInteger(job.id) && job.conclusion === "failure",
    )
    .slice(0, 3) as { id: number; html_url: string }[];
  const logResults = await Promise.all(
    failedJobs.map(async (job) => {
      try {
        const log = await (
          await request("/actions/jobs/" + job.id + "/logs")
        ).text();
        return {
          url: job.html_url,
          errors: log
            .split(/\r?\n/)
            .filter((line) => /^\S+ ##\[error\]/.test(line))
            .slice(0, 5)
            .map((line) => line.replace(/^\S+ ##\[error\]/, "").slice(0, 300)),
        };
      } catch {
        return null;
      }
    }),
  );
  onEvidence?.({
    jobLogEvidence: logResults.filter(Boolean),
    inaccessibleJobLogs: logResults.filter((result) => result === null).length,
  });
  const [issues, successfulRuns] = await Promise.all([
    read("/issues?state=all&per_page=100"),
    read(
      "/actions/workflows/" +
        encodeURIComponent(workflow) +
        "/runs?status=success&branch=" +
        encodeURIComponent(run.head_branch) +
        "&per_page=10",
    ).catch(() => null),
  ]);
  let runbook: { url: string; excerpt: string } | null = null;
  try {
    const doc = await read(
      "/contents/docs/checkout-runbook.md?ref=" +
        encodeURIComponent(run.head_sha),
    );
    if (doc.encoding === "base64" && typeof doc.content === "string")
      runbook = {
        url: doc.html_url,
        excerpt: Buffer.from(doc.content, "base64")
          .toString("utf8")
          .slice(0, 1800),
      };
  } catch {
    /* An unavailable runbook must not erase retrieved build evidence. */
  }
  const related = issues.filter(
    (i: { pull_request?: unknown; title: string; state: string }) =>
      !i.pull_request && /checkout/i.test(i.title),
  );
  const historicalIssues = related
    .filter((issue: { state: string }) => issue.state === "closed")
    .slice(0, 5)
    .map(
      (issue: {
        number: number;
        title: string;
        html_url: string;
        body?: string;
      }) => ({
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        previousRun: issue.body
          ?.match(
            /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+/g,
          )
          ?.find((link) =>
            link.startsWith("https://github.com/" + repo + "/actions/runs/"),
          ),
      }),
    ) as { number: number; title: string; url: string; previousRun?: string }[];
  const candidates = related
    .filter((issue: { state: string }) => issue.state === "open")
    .map((issue: { number: number; title: string; html_url: string }) => ({
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
    })) as { number: number; title: string; url: string }[];
  onEvidence?.({ historicalIssues, candidates, runbook });
  const baseline = successfulRuns?.workflow_runs.find(
    (candidate: { created_at: string }) =>
      candidate.created_at < run.created_at,
  );
  let manifestChange: { url: string; patch: string } | null = null;
  if (baseline && baseline.head_sha !== run.head_sha) {
    try {
      const before = encodeURIComponent(baseline.head_sha);
      const after = encodeURIComponent(run.head_sha);
      const comparison = await read("/compare/" + before + "..." + after);
      const manifest = comparison.files?.find(
        (file: { filename: string }) =>
          file.filename === "checkout/manifest.json",
      );
      if (typeof manifest?.patch === "string" && manifest.patch.length) {
        manifestChange = {
          url:
            "https://github.com/" + repo + "/compare/" + before + "..." + after,
          patch: manifest.patch.slice(0, 2400),
        };
      }
    } catch {
      // The build and log evidence remain available without a commit diff.
    }
  }
  return {
    createdAt: String(run.created_at ?? ""),
    run: run.display_title as string,
    url: run.html_url as string,
    conclusion: String(run.conclusion ?? run.status),
    steps,
    jobLogEvidence: logResults.filter((result) => result !== null),
    inaccessibleJobLogs: logResults.filter((result) => result === null).length,
    runbook,
    comparison: {
      manifestChange,
      branch: String(run.head_branch ?? ""),
      revision: String(run.head_sha ?? ""),
      status:
        successfulRuns === null
          ? ("unavailable" as const)
          : baseline
            ? ("found" as const)
            : ("missing" as const),
      baseline: baseline
        ? {
            url: String(baseline.html_url),
            revision: String(baseline.head_sha),
          }
        : null,
    },
    historicalIssues,
    candidates,
  };
}
