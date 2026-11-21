"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { ArrowUpRight, Clock3, FileCode2, GitPullRequest, ListChecks } from "lucide-react";
import type { ContributorGuide, SprintPlan } from "../../lib/repo-paths";
import { getContributorPath, getSprintPath } from "./actions";
import { rehearsalIssues } from "./rehearsal";
import styles from "./paths.module.css";

function EvidenceLink({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <a href={url} target={url.startsWith("#") ? undefined : "_blank"} rel="noreferrer">
      {children} <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}

function Warnings({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return <ul className={styles.notice}>{messages.map((message) => <li key={message}>{message}</li>)}</ul>;
}

function SprintResult({ plan }: { plan: SprintPlan }) {
  return (
    <>
      <header className={styles.resultHeader}>
        <h3>{plan.scheduledHours} of {plan.budgetHours} hours scheduled</h3>
        <EvidenceLink url={plan.source}>
          {plan.source.startsWith("#") ? "View local example evidence" : "Open GitHub issues"}
        </EvidenceLink>
      </header>
      <progress className={styles.progress} aria-label="Time budget used" value={plan.scheduledHours} max={plan.budgetHours} />
      <Warnings messages={plan.warnings} />
      {plan.steps.length ? (
        <ol className={styles.path} role="list">
          {plan.steps.map((step) => (
            <li key={step.number}>
              <div className={styles.step}>
                <EvidenceLink url={step.url}>#{step.number} {step.title}</EvidenceLink>
                <p className={styles.meta}>{step.hours} h · {step.impact} impact</p>
                {step.dependencies.length > 0 && (
                  <p className={styles.meta}>
                    Depends on {step.dependencies.map((dependency, index) => (
                      <span key={dependency.number}>
                        {index > 0 && ", "}
                        <EvidenceLink url={dependency.url}>#{dependency.number}</EvidenceLink>
                        {dependency.closed && " (closed)"}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : <p className={styles.empty}>No issues could be scheduled within this budget using the available evidence.</p>}
      {plan.deferred.length > 0 && (
        <section className={styles.deferred}>
          <h3>Deferred issues</h3>
          <ul>
            {plan.deferred.map((item) => (
              <li key={item.number}>
                <EvidenceLink url={item.url}>#{item.number} {item.title}</EvidenceLink>
                <p className={styles.meta}>{item.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Planner({ hours }: { hours?: number }) {
  const [budget, setBudget] = useState(String(hours ?? 8));
  const [rehearsal, setRehearsal] = useState(false);
  const [requested, setRequested] = useState<{ hours: number; rehearsal: boolean } | null>(
    () => hours === undefined ? null : { hours, rehearsal: false },
  );
  const [state, setState] = useState<Awaited<ReturnType<typeof getSprintPath>> | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!requested) return;
    let current = true;
    startTransition(async () => {
      try {
        const result = await getSprintPath(requested.hours, requested.rehearsal);
        if (current) setState(result);
      } catch {
        if (current) setState({ data: null, error: "Could not load the sprint plan. Try again." });
      }
    });
    return () => { current = false; };
  }, [requested]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState(null);
    setRequested({ hours: Number(budget), rehearsal });
  }

  return (
    <>
      <form className={styles.controls} onSubmit={submit}>
        <label>
          Time budget (hours)
          <input type="number" required min="0.25" max="168" step="any" value={budget} onChange={(event) => setBudget(event.target.value)} />
        </label>
        <label>
          Issue source
          <select value={rehearsal ? "example" : "github"} onChange={(event) => {
            setRehearsal(event.target.value === "example");
            setRequested(null);
            setState(null);
          }}>
            <option value="github">Live GitHub issues</option>
            <option value="example">Local example issues</option>
          </select>
        </label>
        <button className={styles.button} type="submit" disabled={pending}>
          <ListChecks size={16} aria-hidden="true" /> Build sprint plan
        </button>
      </form>
      <details className={styles.help}>
        <summary>Required issue metadata</summary>
        <p>Put each field on its own line in the issue body. Use hours for effort, low / medium / high / critical for impact, and same-repository issue numbers or <code>none</code> for dependencies.</p>
        <pre>{"Effort: 2h\nImpact: high\nDepends on: #12, #15"}</pre>
      </details>
      {requested && pending ? <p role="status">{requested.rehearsal ? "Building the local example…" : "Reading GitHub issues…"}</p> : state?.error
        ? <p className={styles.notice} role="alert">{state.error}</p> : state?.data && <SprintResult plan={state.data} />}
      {rehearsal && (
        <section id="sprint-example-evidence" className={styles.deferred}>
          <h3>Local example evidence</h3>
          <p className={styles.meta}>These three sample issues are included with ShiftRelay for rehearsal.</p>
          <ul>
            {rehearsalIssues.map((issue) => (
              <li key={issue.number} id={issue.url.slice(1)}>
                <h4>#{issue.number} {issue.title}</h4>
                <pre className={styles.exampleFields}>{issue.body}</pre>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function GuideResult({ guide }: { guide: ContributorGuide }) {
  return (
    <>
      <header className={styles.resultHeader}>
        <h3>Start here</h3>
        <p className={styles.meta}>{guide.ref} · <code>{guide.revision.slice(0, 7)}</code></p>
      </header>
      <Warnings messages={guide.warnings} />
      <ol className={styles.path} role="list">
        {guide.guides.map((file) => (
          <li key={file.path}>
            <div className={styles.step}>
              <h4>{file.title}</h4>
              <EvidenceLink url={file.url}>{file.path}</EvidenceLink>
            </div>
          </li>
        ))}
        <li>
          <div className={styles.step}>
            <h4>Choose a good first issue</h4>
            <EvidenceLink url={guide.source}>View the GitHub label</EvidenceLink>
            {guide.issues.length ? (
              <ul className={styles.starters}>
                {guide.issues.map((issue) => (
                  <li key={issue.number}>
                    <EvidenceLink url={issue.url}>#{issue.number} {issue.title}</EvidenceLink>
                    {issue.files.length ? (
                      <ul className={styles.files}>
                        {issue.files.map((file) => (
                          <li key={file.path}><FileCode2 size={14} aria-hidden="true" /> <EvidenceLink url={file.url}>{file.path}</EvidenceLink></li>
                        ))}
                      </ul>
                    ) : <p className={styles.meta}>No file paths in this issue could be verified.</p>}
                  </li>
                ))}
              </ul>
            ) : <p className={styles.empty}>GitHub returned no open issues labeled “good first issue”.</p>}
          </div>
        </li>
      </ol>
    </>
  );
}

function Contributor() {
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<Awaited<ReturnType<typeof getContributorPath>> | null>(null);

  useEffect(() => {
    let current = true;
    getContributorPath().then((result) => {
      if (current) setState(result);
    }).catch(() => {
      if (current) setState({ data: null, error: "Could not load the contributor guide. Try again." });
    });
    return () => { current = false; };
  }, [attempt]);

  if (!state) return <p role="status">Checking GitHub issues and repository files…</p>;
  if (state.error || !state.data) return (
    <div className={styles.notice}>
      <p role="alert">{state.error}</p>
      <button className={styles.button} onClick={() => { setState(null); retry(attempt + 1); }}>Retry GitHub read</button>
    </div>
  );
  return <GuideResult guide={state.data} />;
}

export default function PathsView({ mode, hours }: { mode: "plan" | "onboard"; hours?: number }) {
  const sprint = mode === "plan";
  return (
    <section className={styles.panel} aria-label={sprint ? "Sprint planner" : "New contributor guide"}>
      <header className={styles.heading}>
        {sprint ? <Clock3 size={24} aria-hidden="true" /> : <GitPullRequest size={24} aria-hidden="true" />}
        <div>
          <h2>{sprint ? "Sprint planner" : "New contributor guide"}</h2>
          <p>{sprint
            ? "Build a time-boxed backlog from documented effort, impact, and dependencies."
            : "Get oriented with verified repository files and open starter issues."}</p>
        </div>
      </header>
      {sprint ? <Planner key={hours ?? "manual"} hours={hours} /> : <Contributor />}
    </section>
  );
}
