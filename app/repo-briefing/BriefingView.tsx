"use client";

import { Activity, ArrowUpRight, CircleDot, GitPullRequest, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { loadRepositoryBriefing } from "./actions";
import type { RepositoryBriefing } from "../../lib/repo-briefing";
import styles from "./briefing.module.css";

const icons = { ci: Activity, review: GitPullRequest, issue: CircleDot };
const briefingMetrics = new Set(["ci", "new-issues", "your-reviews"]);
const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export default function BriefingView({
  mode = "briefing",
  requestId,
}: {
  mode?: "briefing" | "health";
  requestId?: number;
}) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    key: string;
    briefing?: RepositoryBriefing;
    error?: string;
  }>();
  const key = [requestId, version].join("/");
  const busy = state?.key !== key;
  const briefing = state?.briefing;
  const health = mode === "health";

  useEffect(() => {
    let active = true;
    void loadRepositoryBriefing().then(
      (result) => {
        if (active) setState({ key, ...result });
      },
      () => {
        if (active) setState({ key, error: "The repository briefing could not be loaded. Try refreshing." });
      },
    );
    return () => { active = false; };
  }, [key]);

  const [primaryEvidence, ...otherEvidence] = briefing?.evidence ?? [];
  const metrics = briefing?.metrics.filter((metric) =>
    health ? metric.id === "ci" || !briefingMetrics.has(metric.id) : briefingMetrics.has(metric.id),
  );
  const scored = briefing?.healthScore.filter((signal) => signal.met !== null) ?? [];
  const met = scored.filter((signal) => signal.met).length;
  return (
    <section className={styles.panel} aria-labelledby="repository-briefing-heading" aria-busy={busy}>
      <header className={styles.header}>
        <div>
          <h2 id="repository-briefing-heading">{health ? "Repository health" : "Morning briefing"}</h2>
          {briefing?.repository && (
            <p className={styles.metadata}>
              {briefing.repository} · GitHub snapshot{" "}
              <time dateTime={briefing.asOf}>{dateFormat.format(new Date(briefing.asOf))}</time>
            </p>
          )}
        </div>
        <button type="button" className={styles.refresh} onClick={() => setVersion((value) => value + 1)} disabled={busy}>
          <RefreshCw size={15} aria-hidden="true" /> {busy ? "Loading…" : "Refresh"}
        </button>
      </header>
      {state?.error && <p className={styles.notice} role="alert">{state.error}</p>}
      {!state && <p className={styles.notice} role="status">Reading repository signals from GitHub…</p>}
      {briefing && (
        <>
          {(!health || !briefing.repository) && <p className={styles.summary} role="status">{briefing.summary}</p>}
          {health && !!briefing.healthScore.length && (
            <section className={styles.healthScore} aria-labelledby="health-score-heading">
              <h3 id="health-score-heading">Repository health score</h3>
              <p>
                {scored.length ? met + " of " + scored.length + " available signals meet the thresholds." : "The score is unavailable."}
                {" "}{briefing.healthScore.length - scored.length} of {briefing.healthScore.length} signals unknown.
              </p>
              <details className={styles.limitations}>
                <summary>Scoring thresholds</summary>
                <ul>
                  {briefing.healthScore.map((signal) => (
                    <li key={signal.label}>
                      <strong>{signal.label}</strong> · {signal.met === null ? "Unknown" : signal.met ? "Met" : "Below threshold"}. {signal.threshold}
                    </li>
                  ))}
                </ul>
                <p>The score describes this GitHub sample using local thresholds.</p>
              </details>
            </section>
          )}
          {!!metrics?.length && (
            <dl className={styles.metrics}>
              {metrics.map((metric) => (
                <div className={styles.metric} key={metric.id}>
                  <dt><a href={metric.sourceUrl} target="_blank" rel="noreferrer">{metric.label} <ArrowUpRight size={13} aria-hidden="true" /></a></dt>
                  <dd className={styles.value}>
                    {metric.value === null ? "Unavailable" : metric.value.toLocaleString()}
                  </dd>
                  <dd className={styles.detail}>
                    {metric.detail} {metric.limited && metric.value !== null && <span>Sample limit applies.</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {!health && briefing.repository && (
            <section className={styles.evidence} aria-labelledby="briefing-evidence-heading">
              <h3 id="briefing-evidence-heading">Briefing evidence</h3>
              {primaryEvidence ? (
                <>
                  <div className={styles.priorityEvidence}>
                    <EvidenceLink item={primaryEvidence} primary />
                  </div>
                  {!!otherEvidence.length && (
                    <ul>
                      {otherEvidence.map((item) => <li key={item.id}><EvidenceLink item={item} /></li>)}
                    </ul>
                  )}
                </>
              ) : <p className={styles.metadata}>No evidence links were returned for this snapshot.</p>}
            </section>
          )}
          {!!briefing.limitations.length && (
            <details className={styles.limitations}>
              <summary>Data limits ({briefing.limitations.length})</summary>
              <ul>
                {briefing.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function EvidenceLink({ item, primary }: {
  item: RepositoryBriefing["evidence"][number];
  primary?: boolean;
}) {
  const Icon = icons[item.kind];
  return (
    <a href={item.url} target="_blank" rel="noreferrer">
      <Icon size={primary ? 22 : 16} aria-hidden="true" />
      <span>
        {primary && <span className={styles.priorityLabel}>Lead evidence</span>}
        <strong>{item.title}</strong>
        <small>{item.detail} · <time dateTime={item.timestamp}>{dateFormat.format(new Date(item.timestamp))}</time></small>
      </span>
      <ArrowUpRight size={15} aria-hidden="true" />
    </a>
  );
}
