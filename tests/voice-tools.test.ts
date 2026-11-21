import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GET } from "../app/api/tools/[name]/route";
import { latest, remember } from "../lib/records";
import { bindAgent, issueToolToken } from "../lib/voice-sessions";
import { recentWorkspaceCommands } from "../lib/workspace-commands";

const repo = "example/checkout";
const github = `https://github.com/${repo}`;
const api = `https://api.github.com/repos/${repo}`;
const oldRun = `${github}/actions/runs/42`;
const newRun = `${github}/actions/runs/43`;
const agentId = "test-voice-agent";
let directory: string;
let authorization: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "shiftrelay-voice-test-"));
  vi.stubEnv("DATABASE_PATH", join(directory, "test.sqlite"));
  vi.stubEnv("GITHUB_REPOSITORY", repo);
  vi.stubEnv("GITHUB_WORKFLOW_ID", "checkout.yml");
  vi.stubEnv("GITHUB_TOKEN", "fixture");
  const token = issueToolToken();
  bindAgent(token, agentId);
  authorization = `Bearer ${token}`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

function call(name: string, query = "", header = authorization) {
  return GET(
    new Request(`https://example.invalid/api/tools/${name}${query}`, {
      headers: { Authorization: header },
    }),
    { params: Promise.resolve({ name }) },
  );
}

function savePreviousInvestigation() {
  remember({
    evidence: {
      url: oldRun,
      run: "Earlier checkout",
      conclusion: "failure",
      steps: ["Earlier failure"],
      historicalIssues: [
        { number: 8, title: "Closed checkout comparison", url: `${github}/issues/8` },
        { number: 12, title: "Requested checkout issue", url: `${github}/issues/12` },
      ],
    },
  });
}

test("exact issue uses the requested GitHub issue and focuses its evidence node", async () => {
  savePreviousInvestigation();
  const fetchIssue = vi.fn(async () =>
    Response.json({
      number: 12,
      state: "closed",
      title: "Requested checkout issue",
      body: "The rehearsal recorded the checkout validator output.",
    }),
  );
  vi.stubGlobal("fetch", fetchIssue);

  const response = await call("explain_issue", "?number=12");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    issue: {
      number: 12,
      url: `${github}/issues/12`,
      state: "closed",
      title: "Requested checkout issue",
      excerpt: "The rehearsal recorded the checkout validator output.",
    },
    instruction: expect.stringContaining("untrusted evidence"),
  });
  expect(fetchIssue).toHaveBeenCalledExactlyOnceWith(
    `${api}/issues/12`,
    expect.objectContaining({ redirect: "error" }),
  );
  expect(recentWorkspaceCommands()).toEqual([
    expect.objectContaining({ kind: "focus", nodeId: `issue:${github}/issues/12` }),
  ]);
});

test("exact issue requests reject ambiguous input and a mismatched GitHub response", async () => {
  savePreviousInvestigation();
  const fetchIssue = vi.fn(async () => Response.json({ number: 8, state: "closed" }));
  vi.stubGlobal("fetch", fetchIssue);

  for (const query of ["", "?number=0", "?number=8&number=12", "?number=12abc"]) {
    expect(await (await call("explain_issue", query)).json()).toMatchObject({
      status: expect.stringContaining("exact GitHub issue number"),
    });
  }
  expect(fetchIssue).not.toHaveBeenCalled();
  expect(await (await call("explain_issue", "?number=12")).json()).toEqual({
    status: "Could not verify GitHub issue #12.",
  });
  expect(fetchIssue).toHaveBeenCalledTimes(1);
  expect(recentWorkspaceCommands()).toEqual([]);
});

function mockCheckoutRun({
  step,
  log,
  unrelatedDiff = false,
}: {
  step: string;
  log: string;
  unrelatedDiff?: boolean;
}) {
  const revision = "a".repeat(40);
  const baseline = "b".repeat(40);
  const responses = new Map([
    ["/actions/workflows/checkout.yml/runs?per_page=1&event=push&branch=main", () => Response.json({
      workflow_runs: [{
        id: 43, html_url: newRun, display_title: "Current checkout",
        created_at: "2026-11-21T10:00:00Z", conclusion: "failure",
        head_branch: "main", head_sha: revision,
      }],
    })],
    ["/actions/runs/43/jobs?per_page=100", () => Response.json({
      jobs: [{
        id: 21, name: "Checkout", conclusion: "failure", html_url: `${newRun}/job/21`,
        steps: [{ name: step, conclusion: "failure" }],
      }],
    })],
    ["/actions/jobs/21/logs", () => new Response(
      `2026-11-21T10:00:00Z ##[error]${log}`,
    )],
    ["/issues?state=all&per_page=100", () => Response.json(
      unrelatedDiff ? [{
        number: 14, title: "Search suggestions lag", state: "open", html_url: `${github}/issues/14`,
      }] : [],
    )],
    ["/actions/workflows/checkout.yml/runs?status=success&branch=main&per_page=10",
      () => Response.json({ workflow_runs: unrelatedDiff ? [{
        created_at: "2026-11-21T09:30:00Z", head_sha: baseline, html_url: oldRun,
      }] : [] })],
    [`/contents/docs/checkout-runbook.md?ref=${revision}`,
      () => new Response(null, { status: 404 })],
  ]);
  if (unrelatedDiff) {
    responses.set(`/compare/${baseline}...${revision}`, () => Response.json({
      files: [{ filename: "checkout/totals.test.ts", patch: "-expect(total).toBe(3199)" }],
    }));
  }
  const fetchGithub = vi.fn(async (input: string, init?: RequestInit) => {
    expect(input.startsWith(`${api}/`)).toBe(true);
    expect(init?.method ?? "GET").toBe("GET");
    const respond = responses.get(input.slice(api.length));
    if (!respond) throw new Error(`Unexpected GitHub request: ${input}`);
    return respond();
  });
  vi.stubGlobal("fetch", fetchGithub);
  return { fetchGithub, expectedReads: responses.size };
}

test("combined callback investigates the current run before queuing agent-bound narration", async () => {
  savePreviousInvestigation();
  const { fetchGithub, expectedReads } = mockCheckoutRun({
    step: "Validate checkout manifest",
    log: "Checkout manifest is missing paymentSchemaRevision",
  });

  const response = await call("investigate_and_spotlight");
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result).toMatchObject({
    highlightRequested: true,
    run: "Current checkout",
    conclusion: "failure",
    narration: [expect.stringContaining("Checkout manifest is missing paymentSchemaRevision")],
  });
  expect(fetchGithub).toHaveBeenCalledTimes(expectedReads);
  expect(latest().evidence.url).toBe(newRun);
  expect(recentWorkspaceCommands()).toEqual([
    expect.objectContaining({ kind: "xray" }),
    expect.objectContaining({
      kind: "spotlight",
      agentId,
      steps: [expect.objectContaining({ cue: "validator output", line: result.narration[0] })],
    }),
  ]);
});

test("a checkout unit-test failure shows its own X-Ray evidence and cannot preview the manifest repair", async () => {
  const log = "checkout/totals.test.ts: expected total 3199 cents, received 3099 cents";
  const { fetchGithub, expectedReads } = mockCheckoutRun({
    step: "Run checkout unit tests",
    log,
    unrelatedDiff: true,
  });

  expect(await (await call("investigate_and_spotlight")).json()).toMatchObject({
    run: "Current checkout",
    narration: ["Look at the job log output. " + log + "."],
  });
  const xray = await (await call("explain_xray")).json();
  expect(xray).toMatchObject({
    findings: expect.arrayContaining([
      expect.objectContaining({ kind: "workflow" }),
      expect.objectContaining({
        kind: "evidence", title: "Job log output", classification: "Confirmed", summary: log,
      }),
    ]),
    issues: [],
  });
  expect(xray.findings).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ title: "Checkout manifest diff" }),
  ]));
  expect(xray.findings).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "hypothesis" }),
  ]));
  expect(await (await call("preview_repair")).json()).toMatchObject({
    error: expect.stringContaining("does not establish the specific checkout manifest repair"),
  });
  expect(fetchGithub).toHaveBeenCalledTimes(expectedReads);
  expect(recentWorkspaceCommands().map(({ kind }) => kind)).toEqual([
    "xray", "spotlight", "xray",
  ]);
});

test("combined investigation failure never spotlights older evidence", async () => {
  savePreviousInvestigation();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));

  expect(await (await call("investigate_and_spotlight")).json()).toMatchObject({
    status: expect.stringContaining("GitHub investigation unavailable"),
  });
  expect(latest().evidence.url).toBe(oldRun);
  expect(recentWorkspaceCommands()).toEqual([expect.objectContaining({ kind: "xray" })]);
});

test("voice callbacks reject unauthenticated requests before contacting GitHub", async () => {
  const fetchGithub = vi.fn();
  vi.stubGlobal("fetch", fetchGithub);
  expect((await call("explain_issue", "?number=12", "")).status).toBe(401);
  expect((await call("investigate_and_spotlight", "", `Bearer ${"0".repeat(64)}`)).status).toBe(401);
  expect(fetchGithub).not.toHaveBeenCalled();
  expect(recentWorkspaceCommands()).toEqual([]);
});
