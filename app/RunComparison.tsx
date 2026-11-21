import { CircleCheck, CircleMinus, CircleX, ExternalLink } from "lucide-react";
import type { loadEvidence, readWorkspace } from "./actions";

type Evidence = Extract<
  Awaited<ReturnType<typeof loadEvidence>>,
  { data: unknown }
>["data"];
type Repair = NonNullable<Awaited<ReturnType<typeof readWorkspace>>>["repair"];

function RunLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} <ExternalLink aria-hidden="true" size={12} />
    </a>
  );
}

export default function RunComparison({
  data,
  repair,
}: {
  data: Evidence;
  repair: Repair;
}) {
  if (data.conclusion !== "failure") return null;

  const baseline = data.comparison?.baseline;
  const matchingRepair = repair?.sourceRun === data.url ? repair : null;
  const main = matchingRepair?.verification?.mainRun;
  const prRun = matchingRepair?.verification?.pullRequestRun;
  const recovered =
    main?.status === "completed" && main.conclusion === "success";
  const prPassed = prRun?.status === "completed" && prRun.conclusion === "success";
  const AfterIcon = recovered ? CircleCheck : CircleMinus;
  const BeforeIcon = baseline ? CircleCheck : CircleMinus;
  let mainStatus = "Awaiting verified main run";
  if (main) {
    mainStatus = main.conclusion
      ? `Main run ended with ${main.conclusion.replaceAll("_", " ")}`
      : `Main validation ${main.status.replaceAll("_", " ")}`;
  }

  return (
    <section className="run-comparison" aria-labelledby="run-comparison-heading">
      <h3 id="run-comparison-heading">Checkout validation</h3>
      <ol className="run-comparison-stages">
        <li>
          <h4>
            <BeforeIcon aria-hidden="true" size={16} />
            Last passing run
          </h4>
          {baseline ? (
            <RunLink href={baseline.url}>
              View passing run <code>{baseline.revision.slice(0, 8)}</code>
            </RunLink>
          ) : (
            <p>
              {data.comparison?.status === "missing"
                ? "No earlier passing run found"
                : "Earlier run unavailable"}
            </p>
          )}
        </li>
        <li>
          <h4>
            <CircleX aria-hidden="true" size={16} /> Failed run
          </h4>
          <RunLink href={data.url}>
            View failed run{" "}
            {data.comparison?.revision && (
              <code>{data.comparison.revision.slice(0, 8)}</code>
            )}
          </RunLink>
          {data.steps[0] && <p>{data.steps[0]}</p>}
        </li>
        <li className={recovered ? "run-verified" : undefined}>
          <h4>
            <AfterIcon aria-hidden="true" size={16} /> After repair
          </h4>
          {recovered ? (
            <RunLink href={main.url}>Verified passing run on main</RunLink>
          ) : (
            <>
              <p>{mainStatus}</p>
              {main ? (
                <RunLink href={main.url}>View main run</RunLink>
              ) : (
                prPassed && <RunLink href={prRun.url}>View passing PR check</RunLink>
              )}
            </>
          )}
          {matchingRepair && (
            <RunLink href={matchingRepair.url}>
              Repair PR #{matchingRepair.number}
            </RunLink>
          )}
        </li>
      </ol>
    </section>
  );
}
