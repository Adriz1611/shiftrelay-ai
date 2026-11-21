"use client";

import { useEffect, useState } from "react";
import { CircleDot, GitPullRequestClosed, History, Plus, Radio, RotateCcw, Workflow } from "lucide-react";
import type { loadRepoHistory, RepoEvent } from "@/lib/repo-history";
import styles from "./history.module.css";

type HistoryData = NonNullable<Awaited<ReturnType<typeof loadRepoHistory>>>;
const eventLabel = { opened: "Opened", closed: "Closed", reopened: "Reopened" };
const eventIcon = { opened: Plus, closed: GitPullRequestClosed, reopened: RotateCcw };
const nodeLabel = { opened: "Open", closed: "Closed", reopened: "Reopened" };
const nodeIcon = { opened: CircleDot, closed: GitPullRequestClosed, reopened: RotateCcw };
const eventOrder = { opened: 0, closed: 1, reopened: 1 };
const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const timestamp = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default function HistoryView() {
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [connection, setConnection] = useState("Connecting to the event stream…");
  const [events, setEvents] = useState<RepoEvent[]>([]);
  const [incoming, setIncoming] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState(8);
  const [visibleCount, setVisibleCount] = useState(12);
  const webhookConfigured = history?.webhookConfigured;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/repo-events", { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Repository history could not be loaded.");
        setHistory(data);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "History is unavailable.");
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!live || !webhookConfigured) return;
    const source = new EventSource("/api/repo-events/stream");
    source.onopen = () => setConnection("Listening for GitHub deliveries");
    source.onerror = () => setConnection(source.readyState === EventSource.CLOSED
      ? "Stream unavailable. Check your sign-in and enable live mode again."
      : "Reconnecting to the event stream…");
    const receive = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as RepoEvent;
      setEvents((current) => current.some((item) => item.key === event.key) ? current : [...current, event]);
      if (message.type === "issue") setIncoming(event.key);
    };
    source.addEventListener("issue", receive);
    source.addEventListener("issue-replay", receive);
    return () => source.close();
  }, [live, webhookConfigured]);

  const merged = new Map(history?.events.map((event) => [event.key, event]));
  for (const event of events) merged.set(event.key, event);
  const ordered = [...merged.values()].sort((a, b) =>
    a.at.localeCompare(b.at) || eventOrder[a.type] - eventOrder[b.type] || a.key.localeCompare(b.key),
  );
  const moments = [...new Set(ordered.map((event) => event.at))];
  const current = live || !selected ? moments.length - 1 : moments.indexOf(selected);
  const asOf = moments[current] ?? history?.loadedAt;
  const observed = asOf ? ordered.filter((event) => event.at <= asOf).reverse() : [];
  const limited = history && Object.values(history.coverage).includes("limited");
  const missing = history && Object.values(history.coverage).includes("unavailable");
  const currentMoment = observed.filter((event) => event.at === asOf);
  const issueNodes = new Map<number, RepoEvent>();
  const ambiguous = new Set<number>();
  for (const event of observed) {
    const latest = issueNodes.get(event.number);
    if (!latest) {
      issueNodes.set(event.number, event);
    } else if (latest.at === event.at && latest.type !== event.type && event.type !== "opened") {
      ambiguous.add(event.number);
    }
  }
  const nodes = [...issueNodes.values()];

  return (
    <section className={styles.history} aria-labelledby="repo-history-title">
      <header className={styles.header}>
        <div>
          <h2 id="repo-history-title"><History size={21} /> Repository history</h2>
          {history && <p>{history.repository} · Issue activity in UTC</p>}
        </div>
        <button
          className={styles.live}
          type="button"
          aria-pressed={live}
          disabled={!webhookConfigured}
          onClick={() => {
            if (!live) setConnection("Connecting to the event stream…");
            setLive(!live);
            setSelected(null);
            setIncoming(null);
            setNodeCount(8);
            setVisibleCount(12);
          }}
        >
          <Radio size={16} /> Live mode
        </button>
      </header>
      {error && <p role="alert" className={styles.notice}>{error}{" "}
        <button className={styles.textButton} type="button" onClick={() => {
          setError("");
          setAttempt(attempt + 1);
        }}>Retry</button>
      </p>}
      {!history && !error && <p role="status" className={styles.notice}>Loading GitHub issue history…</p>}
      {history && <>
        <p role="status" className={styles.notice}>
          {live ? connection : !webhookConfigured ? "Live mode requires a repository webhook." : "Browsing saved history."}
          {limited && " GitHub history reached the page limit. Earlier activity may be missing."}
          {missing && " Some GitHub history could not be fetched. Showing available events."}
        </p>
        {moments.length > 0 && <>
          <div className={styles.scrubber}>
            <label htmlFor="repo-history-time">As of <strong>{timestamp.format(new Date(asOf!))} UTC</strong></label>
            <button className={styles.textButton} type="button" disabled={current === moments.length - 1}
              onClick={() => { setSelected(null); setVisibleCount(12); setNodeCount(8); }}>Latest</button>
            <input
              id="repo-history-time"
              type="range"
              min={0}
              max={Math.max(0, moments.length - 1)}
              value={Math.max(0, current)}
              disabled={live || moments.length < 2}
              aria-valuetext={`${timestamp.format(new Date(asOf!))} UTC`}
              onChange={(event) => {
                setSelected(moments[Number(event.currentTarget.value)]);
                setVisibleCount(12);
                setNodeCount(8);
              }}
            />
            <div className={styles.rangeEnds}>
              <span>{date.format(new Date(moments[0]))}</span>
              <span>{date.format(new Date(moments[moments.length - 1]))}</span>
            </div>
          </div>
          <div className={styles.eventHeader}>
            <h3>Issue map</h3>
            <span>{nodes.length} {nodes.length === 1 ? "tracked issue" : "tracked issues"} observed</span>
          </div>
          <div className={styles.map}>
            <div className={styles.repositoryNode}><Workflow size={16} aria-hidden="true" />{history.repository}</div>
            <ul className={styles.branches} aria-label={`Issues tracked by ${history.repository}`}>
              {nodes.slice(0, nodeCount).map((event) => {
                const Icon = nodeIcon[event.type];
                const unclear = ambiguous.has(event.number);
                return <li key={event.number}>
                  <a
                    className={styles.issueNode}
                    data-state={unclear ? undefined : event.type}
                    href={`https://github.com/${event.repository}/issues/${event.number}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {live && incoming === event.key && <span key={event.key} className={styles.arrival} aria-hidden="true" />}
                    <span className={styles.nodeDescription}><strong>#{event.number}</strong> {event.title}</span>
                    <span className={styles.nodeState}>
                      {unclear ? "State unclear" : <><Icon size={15} aria-hidden="true" /> {nodeLabel[event.type]}</>}
                    </span>
                  </a>
                </li>;
              })}
            </ul>
            {nodes.length > nodeCount && <button className={styles.textButton} type="button"
              onClick={() => setNodeCount(nodeCount + 8)}>Show more issues</button>}
          </div>
          <div className={styles.eventHeader}>
            <h3>Issue activity</h3>
            <span>{currentMoment.length} {currentMoment.length === 1 ? "event" : "events"} at this point</span>
          </div>
          <ol className={styles.timeline}>
            {observed.slice(0, visibleCount).map((event) => {
              const Icon = eventIcon[event.type];
              return <li key={event.key} className={event.at === asOf ? styles.current : undefined}>
                <span className={styles.marker} data-state={event.type}><Icon size={15} aria-hidden="true" /></span>
                <div>
                  <span className={styles.eventLabel}>{eventLabel[event.type]} <span>#{event.number}</span></span>
                  <a href={`https://github.com/${event.repository}/issues/${event.number}`} target="_blank" rel="noreferrer">{event.title}</a>
                </div>
                <time dateTime={event.at}>{timestamp.format(new Date(event.at))}</time>
              </li>;
            })}
          </ol>
          {observed.length > visibleCount && <button className={styles.textButton} type="button"
            onClick={() => setVisibleCount(visibleCount + 12)}>Show older events</button>}
        </>}
        {moments.length === 0 && <p className={styles.empty}>
          {missing ? "Issue activity is unavailable." : "No issue events are available for this repository yet."}
        </p>}
      </>}
    </section>
  );
}
