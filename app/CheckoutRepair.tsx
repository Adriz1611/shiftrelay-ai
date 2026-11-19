"use client";

import { useState } from "react";
import { ExternalLink, GitPullRequest } from "lucide-react";
import {
  checkoutRepairStatus,
  openCheckoutRepair,
  previewCheckoutRepair,
} from "./repair-actions";

type Result = NonNullable<
  Awaited<ReturnType<typeof checkoutRepairStatus>>["value"]
>;
type Plan = NonNullable<
  Awaited<ReturnType<typeof previewCheckoutRepair>>["value"]
>;
function valueOf<T>(response: { value?: T; error?: string }) {
  if (response.error) throw new Error(response.error);
  return response.value as T;
}
export default function CheckoutRepair({
  onVerification,
  initialPlan,
  initialResult,
}: {
  onVerification: (result: Result) => void;
  initialPlan?: Plan;
  initialResult?: Result;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [result, setResult] = useState(initialResult);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function operate(operation: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to confirm the repair.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    const latest = valueOf(await checkoutRepairStatus());
    if (latest) {
      setResult(latest);
      onVerification(latest);
    } else setMessage("No repair pull request recorded.");
  }
  function runLabel(run: Result["verification"]["mainRun"]) {
    return run?.status === "completed"
      ? "Validation " +
          (run.conclusion === "success"
            ? "passed"
            : (run.conclusion ?? "outcome unknown"))
      : run
        ? run.status.replaceAll("_", " ")
        : "Run not found yet";
  }

  return (
    <section
      className="checkout-repair"
      id="checkout-repair"
      tabIndex={-1}
      aria-label="Checkout repair"
    >
      <h3>
        <GitPullRequest size={16} /> Checkout repair
      </h3>
      {!plan && !result && (
        <p className="muted">
          Restore the missing field from the last passing manifest and validate
          the fix in GitHub.
        </p>
      )}
      {!result && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void operate(async () =>
              setPlan(valueOf(await previewCheckoutRepair())),
            )
          }
        >
          Preview repair
        </button>
      )}
      {plan && !result && (
        <div className="repair-preview">
          <p>Restore paymentSchemaRevision from the passing build.</p>
          <pre>
            + {JSON.stringify("paymentSchemaRevision")}:{" "}
            {JSON.stringify(plan.revision)}
          </pre>
          <details>
            <summary>Review the exact proposed manifest</summary>
            <pre>{plan.content}</pre>
          </details>
          <p className="muted">
            Approval opens a PR and GitHub runs the checkout validator. Merge
            remains a separate action in GitHub.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void operate(async () => {
                valueOf(await openCheckoutRepair(plan.id));
                await check();
              })
            }
          >
            Approve and open repair PR
          </button>
        </div>
      )}
      {result && (
        <dl className="handover-proof">
          <dt>Repair PR</dt>
          <dd>
            <a href={result.receipt.url}>
              #{result.receipt.number} ·{" "}
              {result.verification.merged ? "Merged" : "Review in GitHub"}{" "}
              <ExternalLink size={13} />
            </a>
          </dd>
          <dt>PR validation</dt>
          <dd>
            {result.verification.pullRequestRun ? (
              <a href={result.verification.pullRequestRun.url}>
                {runLabel(result.verification.pullRequestRun)}
              </a>
            ) : (
              runLabel(null)
            )}
          </dd>
          <dt>Main validation</dt>
          <dd>
            {result.verification.mainRun ? (
              <a href={result.verification.mainRun.url}>
                {runLabel(result.verification.mainRun)}
              </a>
            ) : result.verification.merged ? (
              "Waiting for merge-commit run"
            ) : (
              "Waiting for merge"
            )}
          </dd>
        </dl>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => void operate(check)}
      >
        Check repair status
      </button>
      <p role="status">{busy ? "Checking GitHub…" : message}</p>
    </section>
  );
}
