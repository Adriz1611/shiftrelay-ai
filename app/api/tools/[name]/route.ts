import { validToolToken, toolAgent } from "../../../../lib/voice-sessions";
import { evidenceSpotlight } from "../../../../lib/spotlight";
import { buildXray } from "../../../../lib/xray";
import { outcomeForRun } from "../../../../lib/records";
import { readHistoricalIssue } from "../../../../lib/investigate";
import { runInvestigation } from "../../../../lib/investigation-progress";
import { latest } from "../../../../lib/records";
import {
  latestRepair,
  proposeRepair,
  verifyRepair,
} from "../../../../lib/checkout-repair";
import { sendWorkspaceCommand } from "../../../../lib/workspace-commands";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  if (!validToolToken(req.headers.get("Authorization")))
    return new Response(null, { status: 401 });
  const { name } = await params;
  if (name === "explain_xray" || name === "explain_history") {
    const record = latest();
    if (!record.evidence)
      return Response.json({
        status: "No investigation has been saved yet. Investigate first.",
      });
    const outcome = outcomeForRun(record.evidence.url);
    const graph = buildXray(
      record.evidence,
      record.proposal
        ? { target: record.proposal.target }
        : outcome
          ? {
              state: outcome.state,
              summary: outcome.summary,
              github: outcome.github,
            }
          : undefined,
    );
    if (name === "explain_history") {
      const history = graph.nodes.filter(
        (node) =>
          node.kind === "history" && node.summary === "Closed GitHub issue",
      );
      if (history.length === 1)
        sendWorkspaceCommand({ kind: "focus", nodeId: history[0].id });
      const source =
        history.length === 1 && history[0].url
          ? await readHistoricalIssue(history[0].url)
          : null;
      return Response.json({
        closedIssues: history.map((node) => ({
          title: node.title,
          reason: node.detail,
          previousWorkflow: node.relatedUrl ?? null,
        })),
        explanation:
          "A closed issue is a historical comparison record. Its status does not describe a current repair PR or imply the current failure is resolved.",
        source,
      });
    }
    sendWorkspaceCommand({ kind: "xray" });
    return Response.json({
      findings: graph.nodes
        .filter((node) => node.kind !== "history" && node.kind !== "action")
        .map((node) => ({
          title: node.title,
          kind: node.kind,
          classification: node.classification,
          summary: node.summary,
          relationship: node.relation,
        })),
      issues: graph.nodes
        .filter((node) => node.kind === "history")
        .map((node) => ({
          title: node.title,
          state:
            node.summary === "Closed GitHub issue"
              ? "closed historical reference"
              : "open tracking issue",
          reason: node.detail,
        })),
      operatorAction: record.proposal
        ? {
            status: "awaiting operator approval",
            target: record.proposal.target,
          }
        : outcome
          ? { status: outcome.state, receiptSummary: outcome.summary }
          : null,
      instruction:
        "Explain the failed run, its evidence and what remains unknown in plain speech. Distinguish open tracking issues from closed historical references. Name recorded GitHub and Discord outcomes from the receipt, or say approval is pending. Avoid listing every node or ending with a generic follow-up question.",
    });
  }
  if (name === "spotlight_evidence") {
    const steps = evidenceSpotlight(latest().evidence);
    if (!steps.length)
      return Response.json({
        status:
          "No spotlight evidence is saved. Run investigate first, then call spotlight_evidence once.",
      });
    sendWorkspaceCommand({
      kind: "spotlight",
      steps,
      agentId: toolAgent(req.headers.get("Authorization")),
    });
    return Response.json({
      highlightRequested: true,
      narration: steps.map((step) => step.line),
      limitation:
        steps.length < 3
          ? "Some comparison evidence is unavailable; only discuss the findings returned."
          : "Wider service impact is still unknown.",
    });
  }
  if (name === "status")
    return Response.json({ service: "ShiftRelay", status: "reachable" });
  if (name === "handover") {
    const completed = latest(true);
    const record = completed.evidence ? completed : latest();
    if (!record.evidence) return Response.json({ status: "No handover saved" });
    const issue = record.evidence.candidates?.[0]?.number;
    const repair = latestRepair();
    const run =
      repair?.verification?.mainRun ?? repair?.verification?.pullRequestRun;
    return Response.json({
      failedSteps: record.evidence.steps,
      actions:
        record.state === "succeeded"
          ? [
              issue
                ? `A comment was posted on GitHub issue #${issue}.`
                : "The GitHub issue was created.",
              "The Discord notification was delivered.",
              "The handover was saved.",
            ]
          : [record.summary ?? record.action].filter(Boolean),
      rootCause: "Unconfirmed.",
      repair: repair
        ? {
            pullRequest: repair.number,
            appliesToLatestHandover: repair.sourceRun === record.evidence.url,
            merged: repair.verification?.merged ?? false,
            validation:
              run?.status === "completed"
                ? run.conclusion
                : (run?.status ?? "unverified"),
            scope: repair.verification?.mainRun
              ? "main checkout manifest"
              : "PR checkout manifest",
          }
        : null,
      nextCheck:
        "Use investigate to read the failed job's actual error lines. Compare manifest contents only if a passing baseline exists.",
    });
  }
  if (name === "open_xray") {
    sendWorkspaceCommand({ kind: "xray" });
    return Response.json({ requested: "Open Incident X-Ray" });
  }
  if (
    name === "preview_repair" ||
    name === "repair_status" ||
    name === "review_update"
  ) {
    try {
      if (name === "preview_repair") {
        const plan = await proposeRepair(latest().evidence ?? {});
        sendWorkspaceCommand({ kind: "preview", plan });
        return Response.json({
          revision: plan.revision,
          file: "checkout/manifest.json",
          approvalRequired: true,
        });
      }
      if (name === "repair_status") {
        const receipt = latestRepair();
        if (!receipt)
          return Response.json({
            status: "No repair pull request has been recorded.",
          });
        const verification = await verifyRepair(receipt);
        sendWorkspaceCommand({
          kind: "status",
          result: { receipt, verification },
        });
        return Response.json({
          number: receipt.number,
          ...verification,
          scope: "Checkout manifest validation",
        });
      }
      const saved = latest();
      const proposal = saved.proposal ?? (await runInvestigation()).proposal;
      sendWorkspaceCommand({ kind: "review" });
      if (!proposal)
        return Response.json({ status: "No new update is awaiting approval." });
      return Response.json({
        target: proposal.target,
        notification: "Discord",
        approvalRequired: true,
      });
    } catch (error) {
      return Response.json({
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete the requested read.",
      });
    }
  }
  if (name !== "investigate") return new Response(null, { status: 404 });
  try {
    sendWorkspaceCommand({ kind: "xray" });
    const { data: evidence, proposal } = await runInvestigation();
    return Response.json({
      run: evidence.run,
      conclusion: evidence.conclusion,
      failedSteps: evidence.steps,
      jobLogEvidence: evidence.jobLogEvidence.map(({ errors }) => errors),
      inaccessibleJobLogs: evidence.inaccessibleJobLogs,
      passingBaseline: evidence.comparison.baseline
        ? "An earlier run on this branch passed."
        : evidence.comparison.status === "missing"
          ? "No earlier passing run found on this branch."
          : "Passing run lookup unavailable.",
      manifestDiff: evidence.comparison.manifestChange?.patch ?? null,
      openIssueNumbers: evidence.candidates.map(({ number }) => number),
      proposalPending: Boolean(proposal),
      rootCause:
        "Unconfirmed. Job log messages are evidence reported by the workflow. Fixture messages describe the controlled demo.",
    });
  } catch {
    return Response.json(
      { error: "GitHub investigation unavailable" },
      { status: 502 },
    );
  }
}
