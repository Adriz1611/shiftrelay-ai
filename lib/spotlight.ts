import { buildXray } from "./xray";

export type SpotlightStep = { id: string; cue: string; line: string };
export function evidenceSpotlight(evidence: unknown) {
  const graph = buildXray(evidence);
  const workflow = graph.nodes.find((node) => node.kind === "workflow");
  if (!workflow) return [];
  const choices = [
    {
      suffix: "failure",
      cue: "validator output",
      prefix: "Look at the validator output",
    },
    {
      suffix: "diff",
      cue: "manifest diff",
      prefix: "Now look at the manifest diff",
    },
    {
      suffix: "hypothesis",
      cue: "working hypothesis",
      prefix: "Finally, look at the working hypothesis",
    },
  ];
  return choices.flatMap(({ suffix, cue, prefix }) => {
    const node = graph.nodes.find(
      (item) => item.id === workflow.id + ":" + suffix,
    );
    if (!node) return [];
    if (suffix === "failure" && node.title === "Failed step") {
      return [
        {
          id: node.id,
          cue: "failed step",
          line: "Look at the failed step. " + node.summary + ".",
        },
      ];
    }
    const summary =
      suffix === "diff" && /^-.*"paymentSchemaRevision"/m.test(node.detail)
        ? "The field for the payment schema revision disappeared after the last passing build"
        : node.summary.replace(/[.!?]+$/, "");
    return [{ id: node.id, cue, line: prefix + ". " + summary + "." }];
  });
}

export function spotlightIndex(text: string, steps: SpotlightStep[]) {
  const words = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  return steps.reduce(
    (index, step, next) => (words.includes(step.cue) ? next : index),
    -1,
  );
}
