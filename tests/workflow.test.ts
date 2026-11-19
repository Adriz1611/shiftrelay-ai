import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepare, decide } from "../lib/proposals";
import { latest } from "../lib/records";
import { buildXray } from "../lib/xray";
import { evidenceSpotlight, spotlightIndex } from "../lib/spotlight";

test("spotlight follows only evidence present in the graph", () => {
  const url = "https://github.com/example/checkout/actions/runs/1";
  const partial = {
    url,
    conclusion: "failure",
    steps: ["Validate checkout manifest"],
  };
  assert.deepEqual(
    evidenceSpotlight(partial).map((step) => step.cue),
    ["failed step"],
  );
  const complete = evidenceSpotlight({
    ...partial,
    jobLogEvidence: [
      { url, errors: ["Checkout manifest is missing paymentSchemaRevision"] },
    ],
    comparison: {
      baseline: null,
      manifestChange: {
        url,
        patch: '-  "paymentSchemaRevision": "2026-11-18"',
      },
    },
  });
  assert.deepEqual(
    complete.map((step) => step.cue),
    ["validator output", "manifest diff", "working hypothesis"],
  );
  assert.equal(
    spotlightIndex("Now look at the **manifest diff**.", complete),
    1,
  );
  assert.equal(spotlightIndex("Checkout is failing.", complete), -1);
});

test("checkout repair restores only the prior field and verifies run identity", async () => {
  const { proposeRepair, approveRepair, verifyRepair } =
    await import("../lib/checkout-repair");
  process.env.GITHUB_REPOSITORY = "Adriz1611/shiftrelay-checkout-demo";
  process.env.GITHUB_TOKEN = "test-token";
  process.env.DATABASE_PATH = join(
    mkdtempSync(join(tmpdir(), "repair-test-")),
    "test.sqlite",
  );
  const passing = "a".repeat(40),
    failing = "b".repeat(40),
    head = "c".repeat(40),
    merge = "d".repeat(40);
  const source = { service: "checkout", keep: true };
  const restored = { ...source, paymentSchemaRevision: "original" };
  function content(value: object, sha: string) {
    return Response.json({
      sha,
      encoding: "base64",
      content: Buffer.from(JSON.stringify(value)).toString("base64"),
    });
  }
  const pr = {
    number: 3,
    html_url: "https://github.com/Adriz1611/shiftrelay-checkout-demo/pull/3",
    head: { sha: head },
    merged_at: "now",
    merge_commit_sha: merge,
  };
  const original = globalThis.fetch;
  const writes: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const endpoint = url.pathname.split("/").slice(4).join("/");
    const method = init?.method ?? "GET";
    if (method !== "GET") writes.push(endpoint);
    if (endpoint.startsWith("git/ref/heads/shiftrelay"))
      return new Response(null, { status: 404 });
    if (endpoint === "git/ref/heads/main")
      return Response.json({ object: { sha: failing } });
    if (endpoint === "git/refs") return Response.json({});
    if (endpoint === "contents/checkout/manifest.json") {
      if (method === "PUT") {
        const request = JSON.parse(String(init?.body));
        assert.deepEqual(
          JSON.parse(Buffer.from(request.content, "base64").toString()),
          restored,
        );
        assert.equal(request.sha, "broken");
        return Response.json({});
      }
      const ref = url.searchParams.get("ref");
      return ref === passing || ref === head
        ? content(restored, "fixed")
        : content(source, "broken");
    }
    if (endpoint === "pulls") return Response.json(method === "POST" ? pr : []);
    if (endpoint.startsWith("compare/"))
      return Response.json({ files: [{ filename: "checkout/manifest.json" }] });
    if (endpoint === "pulls/3/files")
      return Response.json([{ filename: "checkout/manifest.json" }]);
    if (endpoint === "pulls/3") return Response.json(pr);
    if (endpoint.endsWith("/runs")) {
      const sha = url.searchParams.get("event") === "push" ? merge : head;
      return Response.json({
        workflow_runs: [
          {
            head_sha: "unrelated",
            html_url: "https://github.com/demo/unrelated",
            status: "completed",
            conclusion: "success",
          },
          {
            head_sha: sha,
            html_url: "https://github.com/demo/verified",
            status: "completed",
            conclusion: sha === merge ? "success" : "failure",
          },
        ],
      });
    }
    throw new Error("Unexpected request " + endpoint);
  };
  try {
    const plan = await proposeRepair({
      conclusion: "failure",
      comparison: {
        revision: failing,
        baseline: { revision: passing },
        manifestChange: { patch: '-  "paymentSchemaRevision": "original"' },
      },
      jobLogEvidence: [
        { errors: ["Checkout manifest is missing paymentSchemaRevision"] },
      ],
    });
    assert.equal(writes.length, 0);
    const receipt = await approveRepair(plan);
    await approveRepair(plan);
    assert.equal(writes.length, 3);
    const state = await verifyRepair(receipt);
    assert.equal(state.pullRequestRun?.conclusion, "failure");
    assert.equal(state.mainRun?.conclusion, "success");
  } finally {
    globalThis.fetch = original;
  }
});

test("X-Ray preserves the run position and classifies only retrieved evidence", () => {
  const url = "https://github.com/demo/checkout/actions/runs/42";
  const partial = { run: "Checkout", url, conclusion: "failure" };
  const early = buildXray(partial, undefined, false);
  assert.equal(early.nodes.length, 2);
  const complete = buildXray({
    ...partial,
    jobLogEvidence: [
      { url, errors: ["Checkout manifest is missing paymentSchemaRevision"] },
    ],
    comparison: {
      baseline: null,
      manifestChange: {
        url,
        patch: '-  "paymentSchemaRevision": "2026-11-18"',
      },
    },
    historicalIssues: [
      {
        number: 2,
        title: "Checkout rehearsal",
        url: "https://github.com/demo/checkout/issues/2",
      },
    ],
  });
  assert.deepEqual(
    complete.nodes.find((node) => node.kind === "workflow")?.position,
    early.nodes[1].position,
  );
  assert.equal(
    complete.nodes.find((node) => node.kind === "hypothesis")?.classification,
    "Hypothesis",
  );
  assert.equal(
    complete.nodes.find((node) => node.kind === "history")?.relation,
    "Title match",
  );
  assert.ok(complete.nodes.some((node) => node.kind === "unknown"));
  assert.equal(
    buildXray({ ...partial, url: "javascript:alert(1)" }).invalidSource,
    true,
  );
});

test("decline, replay, verified receipts and partial outcomes", async () => {
  process.env.DATABASE_PATH = join(
    mkdtempSync(join(tmpdir(), "relay-test-")),
    "test.sqlite",
  );
  process.env.GITHUB_REPOSITORY = "demo/checkout";
  process.env.GITHUB_TOKEN = "fixture";
  process.env.DISCORD_WEBHOOK_URL = "https://example.invalid/webhook";
  const evidence = {
    createdAt: "",
    run: "checkout",
    url: "https://example.invalid/run",
    conclusion: "failure",
    steps: ["Validate"],
    jobLogEvidence: [],
    inaccessibleJobLogs: 0,
    runbook: null,
    comparison: {
      manifestChange: null,
      branch: "main",
      revision: "abc",
      status: "missing" as const,
      baseline: null,
    },
    historicalIssues: [],
    candidates: [],
  };
  const original = globalThis.fetch;
  let writes = 0;
  let discordStatus = 200;
  globalThis.fetch = async (url) => {
    writes++;
    if (String(url).includes("webhook"))
      return discordStatus !== 200
        ? new Response(null, { status: discordStatus })
        : Response.json({ id: "1234" });
    return Response.json({
      id: 42,
      html_url: "https://example.invalid/issues/42",
    });
  };
  try {
    const declined = prepare(evidence)!;
    await decide(declined.id, false);
    await decide(declined.id, true);
    assert.equal(writes, 0);
    const approved = prepare({ ...evidence, url: evidence.url + "/2" })!;
    await Promise.all([decide(approved.id, true), decide(approved.id, true)]);
    assert.equal(writes, 2);
    assert.equal(latest().state, "succeeded");
    discordStatus = 503;
    await decide(prepare({ ...evidence, url: evidence.url + "/3" })!.id, true);
    assert.equal(latest().state, "partial");
    assert.equal(latest().github, "https://example.invalid/issues/42");
    discordStatus = 429;
    const retry = prepare({ ...evidence, url: evidence.url + "/4" })!;
    await decide(retry.id, true);
    assert.equal(latest().state, "notification_rejected");
    const before = writes;
    discordStatus = 200;
    await decide(retry.id, true, true);
    assert.equal(writes, before + 1);
    assert.equal(latest().state, "succeeded");
  } finally {
    globalThis.fetch = original;
  }
});
