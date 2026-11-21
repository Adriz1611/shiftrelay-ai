import { z } from "zod";

const sourceUrl = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com";
  });
const reference = z.object({
  title: z.string(),
  url: sourceUrl,
  number: z.number(),
  previousRun: sourceUrl.optional(),
});
const evidence = z.object({
  run: z.string().optional(),
  url: sourceUrl.optional(),
  conclusion: z.string().optional(),
  createdAt: z.string().optional(),
  steps: z.array(z.string()).optional(),
  inaccessibleJobLogs: z.number().optional(),
  jobLogEvidence: z
    .array(z.object({ url: sourceUrl, errors: z.array(z.string()) }))
    .optional(),
  runbook: z
    .object({ url: sourceUrl, excerpt: z.string() })
    .nullable()
    .optional(),
  comparison: z
    .object({
      baseline: z.object({ url: sourceUrl, revision: z.string() }).nullable(),
      manifestChange: z
        .object({ url: sourceUrl, patch: z.string() })
        .nullable()
        .optional(),
    })
    .optional(),
  candidates: z.array(reference).optional(),
  historicalIssues: z.array(reference).optional(),
});
const nodeSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "incident",
    "workflow",
    "evidence",
    "history",
    "runbook",
    "hypothesis",
    "unknown",
    "action",
  ]),
  classification: z.enum(["Confirmed", "Hypothesis", "Unknown"]),
  title: z.string().min(1),
  summary: z.string(),
  detail: z.string(),
  relation: z.string(),
  url: sourceUrl.optional(),
  relatedUrl: sourceUrl.optional(),
  timestamp: z.string().optional(),
  extra: z.boolean().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
});
export type XrayNode = z.infer<typeof nodeSchema>;
const graphSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      label: z.string(),
    }),
  ),
});

export function buildXray(
  raw: unknown,
  action?: {
    target?: string;
    state?: string;
    summary?: string;
    github?: string;
  },
  complete = true,
  repair?: {
    url: string;
    sourceRun?: string;
    verification?: {
      pullRequestRun: {
        url: string;
        status: string;
        conclusion: string | null;
      } | null;
      mainRun: {
        url: string;
        status: string;
        conclusion: string | null;
      } | null;
    };
  } | null,
) {
  const parsed = evidence.safeParse(raw ?? {});
  const data = parsed.success ? parsed.data : {};
  const nodes: XrayNode[] = [];
  const edges: z.infer<typeof graphSchema>["edges"] = [];
  function add(node: XrayNode, parent?: string) {
    nodes.push(node);
    if (parent)
      edges.push({
        id: parent + "::" + node.id,
        source: parent,
        target: node.id,
        label: node.relation,
      });
  }
  const incident = "checkout-incident";
  const workflow = data.url ? "run:" + data.url : incident;
  const logs = data.jobLogEvidence?.flatMap((job) => job.errors) ?? [];
  const manifestValidatorOutput = /missing paymentSchemaRevision/i.test(
    logs[0] ?? "",
  );
  const diff = data.comparison?.manifestChange;
  add({
    id: incident,
    kind: "incident",
    classification: "Confirmed",
    title: "Checkout deployment",
    summary: data.conclusion
      ? "Latest run · " + data.conclusion
      : "Investigation target",
    detail: "The selected checkout service and its recorded investigation.",
    relation: "",
    position: { x: 0, y: 165 },
  });
  if (data.url)
    add(
      {
        id: workflow,
        kind: "workflow",
        classification: "Confirmed",
        title:
          data.conclusion === "failure"
            ? "Failed workflow run"
            : "Latest workflow run",
        summary:
          "GitHub Actions · " + (data.conclusion ?? "status unavailable"),
        detail:
          [data.run, ...(data.steps ?? [])].filter(Boolean).join("\n") ||
          "No failed step returned.",
        relation: "Latest run",
        url: data.url,
        timestamp: data.createdAt,
        position: { x: 300, y: 165 },
      },
      incident,
    );
  if (logs.length || data.steps?.length)
    add(
      {
        id: workflow + ":failure",
        kind: "evidence",
        classification: "Confirmed",
        title: manifestValidatorOutput
          ? "Validator output"
          : logs.length
            ? "Job log output"
            : "Failed step",
        summary: logs[0] ?? data.steps![0],
        detail: logs.join("\n") || data.steps!.join("\n"),
        relation: "Observed output",
        url:
          data.jobLogEvidence?.find((job) => job.errors.length)?.url ??
          data.url,
        position: { x: 600, y: 0 },
      },
      workflow,
    );
  if (diff)
    add(
      {
        id: workflow + ":diff",
        kind: "evidence",
        classification: "Confirmed",
        title: "Checkout manifest diff",
        summary: "Compared with the last passing run",
        detail: diff.patch,
        relation: "Diff",
        url: diff.url,
        position: { x: 600, y: 145 },
      },
      workflow,
    );
  if (complete && data.url && data.conclusion === "failure")
    add(
      {
        id: workflow + ":unknown",
        kind: "unknown",
        classification: "Unknown",
        title: "Evidence gap",
        summary: data.inaccessibleJobLogs
          ? "Some job logs were unavailable"
          : diff
            ? "Wider service impact is unverified"
            : "Manifest comparison unavailable",
        detail:
          "Workflow evidence does not establish production impact. Verify service health and deployment scope separately.",
        relation: "Needs verification",
        position: { x: 600, y: 285 },
      },
      workflow,
    );
  if (
    diff &&
    /^-.*"paymentSchemaRevision"/m.test(diff.patch) &&
    logs.some((line) => /missing paymentSchemaRevision/i.test(line))
  ) {
    add(
      {
        id: workflow + ":hypothesis",
        kind: "hypothesis",
        classification: "Hypothesis",
        title: "Missing schema field",
        summary: "The removed field matches the validator error",
        detail:
          "The diff shows the field was removed, and the workflow reported that field missing. This supports the controlled regression hypothesis. It does not establish wider service impact.",
        relation: "Supports",
        url: diff.url,
        position: { x: 900, y: 145 },
      },
      workflow + ":diff",
    );
    edges.push({
      id: workflow + ":failure::" + workflow + ":hypothesis",
      source: workflow + ":failure",
      target: workflow + ":hypothesis",
      label: "Supports",
    });
  }
  const related = [
    ...(data.candidates ?? []).map((issue) => ({ ...issue, state: "Open" })),
    ...(data.historicalIssues ?? []).map((issue) => ({
      ...issue,
      state: "Closed",
    })),
  ].slice(0, 4);
  related.forEach((issue, index) =>
    add(
      {
        id: "issue:" + issue.url,
        kind: "history",
        classification: "Confirmed",
        title: "#" + issue.number + " " + issue.title,
        summary: issue.state + " GitHub issue",
        detail: issue.previousRun
          ? "The issue matches the checkout service and cites an earlier workflow run. Open that run to compare evidence. The link does not establish the same cause."
          : "The GitHub issue title matches the checkout service. Similarity alone does not establish the same cause.",
        relation: "Title match",
        url: issue.url,
        relatedUrl: issue.previousRun,
        position: { x: 300 + index * 285, y: 460 },
        extra: index > 1,
      },
      incident,
    ),
  );
  if (data.runbook)
    add(
      {
        id: "runbook:" + data.runbook.url,
        kind: "runbook",
        classification: "Confirmed",
        title: "Checkout runbook",
        summary: "Troubleshooting procedure at the run commit",
        detail: data.runbook.excerpt,
        relation: "Guides next check",
        url: data.runbook.url,
        position: { x: 900, y: 285 },
      },
      nodes.some((node) => node.id === workflow + ":unknown")
        ? workflow + ":unknown"
        : workflow,
    );
  if (action?.target || action?.state) {
    const url = sourceUrl.safeParse(action.github);
    add(
      {
        id: workflow + ":action",
        kind: "action",
        classification: "Confirmed",
        title: action.target ?? "Operator action",
        summary: action.target
          ? "Awaiting operator approval"
          : (action.state ?? "").replaceAll("_", " "),
        detail:
          action.summary ??
          "Review the exact proposal and approve or decline in the workspace.",
        relation: "Operator decision",
        url: url.success ? url.data : undefined,
        position: { x: 0, y: 460 },
      },
      incident,
    );
  }
  if (
    repair &&
    (repair.sourceRun === data.url ||
      repair.verification?.mainRun?.url === data.url)
  ) {
    const verified =
      repair.verification?.mainRun ?? repair.verification?.pullRequestRun;
    const url = sourceUrl.safeParse(repair.url);
    const run = sourceUrl.safeParse(verified?.url);
    if (url.success)
      add(
        {
          id: "repair:" + repair.url,
          kind: "action",
          classification: "Confirmed",
          title: "Checkout repair PR",
          summary:
            verified?.status === "completed"
              ? (repair.verification?.mainRun
                  ? "Main validation "
                  : "PR validation ") +
                (verified.conclusion === "success"
                  ? "passed"
                  : (verified.conclusion ?? "outcome unavailable"))
              : "Awaiting GitHub validation",
          detail:
            "The operator-approved PR restores the field from the passing manifest. This workflow validates the manifest.",
          relation: "Repair PR",
          url: url.data,
          relatedUrl: run.success ? run.data : undefined,
          position: { x: 0, y: 0 },
        },
        incident,
      );
  }
  return {
    ...graphSchema.parse({ nodes, edges }),
    invalidSource: !parsed.success,
  };
}
