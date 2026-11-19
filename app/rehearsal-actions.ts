"use server";

import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authorize } from "../lib/auth";
import { prepare, decide } from "../lib/proposals";

export async function rehearseRecovery() {
  await authorize();
  const path = join(
    tmpdir(),
    "shiftrelay-rehearsal-" + randomUUID() + ".sqlite",
  );
  let githubWrites = 0;
  let discordAttempts = 0;
  const options = {
    path,
    repository: "rehearsal/checkout",
    githubToken: "rehearsal",
    webhook: "https://discord.invalid/webhook",
    send: (async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "api.github.com") {
        githubWrites++;
        return Response.json({
          id: 1,
          html_url: "https://github.invalid/issues/1#comment-1",
        });
      }
      if (url.hostname === "discord.invalid") {
        discordAttempts++;
        return discordAttempts === 1
          ? new Response(null, { status: 429 })
          : Response.json({ id: "rehearsal-message" });
      }
      throw new Error("Unexpected rehearsal destination");
    }) satisfies typeof fetch,
  };
  try {
    const proposal = prepare(
      {
        createdAt: "",
        run: "Rehearsal",
        url: "https://github.invalid/actions/runs/1",
        conclusion: "failure",
        steps: ["Validate checkout manifest"],
        jobLogEvidence: [],
        inaccessibleJobLogs: 0,
        runbook: null,
        comparison: {
          branch: "main",
          revision: "",
          status: "missing",
          baseline: null,
          manifestChange: null,
        },
        historicalIssues: [],
        candidates: [
          {
            number: 1,
            title: "Checkout regression",
            url: "https://github.invalid/issues/1",
          },
        ],
      },
      options,
    );
    if (!proposal) throw new Error("Rehearsal proposal unavailable");
    const first = await decide(proposal.id, true, false, options);
    const retry = await decide(proposal.id, true, true, options);
    if (
      githubWrites !== 1 ||
      discordAttempts !== 2 ||
      !first.includes("429") ||
      !retry.includes("rehearsal-message")
    )
      throw new Error("Rehearsal did not recover as expected");
    return { githubWrites, discordAttempts };
  } finally {
    await unlink(path).catch(() => undefined);
  }
}
