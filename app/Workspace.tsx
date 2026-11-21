"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Box,
  ExternalLink,
  FileText,
  GitBranch,
  History,
  Network,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import { usePersistentVoice } from "./VoiceProvider";
import IncidentXray from "./IncidentXray";
import CheckoutRepair from "./CheckoutRepair";
import RunComparison from "./RunComparison";
import dynamic from "next/dynamic";
import type { RepoMode } from "./RepositoryRoom";
const RepositoryRoom = dynamic(() => import("./RepositoryRoom"));
import { rehearseRecovery } from "./rehearsal-actions";
import { loadEvidence, review, retryDiscord, readWorkspace } from "./actions";

type EvidenceResponse = Extract<
  Awaited<ReturnType<typeof loadEvidence>>,
  { data: unknown }
>;
type Result = {
  data?: EvidenceResponse["data"];
  proposal?: EvidenceResponse["proposal"];
  error?: string;
};
type VoiceCommand = NonNullable<
  Awaited<ReturnType<typeof readWorkspace>>
>["commands"][number];

export default function Workspace() {
  const { mount, configure, signal } = usePersistentVoice();
  const [result, setResult] = useState<Result>({});
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [retryId, setRetryId] = useState("");
  const [events, setEvents] = useState<
    { id: number; time: string; text: string }[]
  >([]);
  const [status, setStatus] = useState("");
  const [receipt, setReceipt] = useState("");
  const [handoverSummary, setHandoverSummary] = useState("");
  const [rehearsal, setRehearsal] =
    useState<Awaited<ReturnType<typeof rehearseRecovery>>>();
  const [rehearsing, setRehearsing] = useState(false);
  const [rehearsalError, setRehearsalError] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [repair, setRepair] =
    useState<NonNullable<Awaited<ReturnType<typeof readWorkspace>>>["repair"]>(
      null,
    );
  const [xray, setXray] = useState(false);
  const [repoRoom, setRepoRoom] = useState<{ mode: RepoMode; hours?: number; id?: number }>();
  const focusViewControl = useRef(false);
  const viewControl = useCallback((button: HTMLButtonElement | null) => {
    if (!button || !focusViewControl.current) return;
    focusViewControl.current = false;
    button.focus();
  }, []);
  const voiceCursor = useRef<number | null>(null);
  const [voiceCommand, setVoiceCommand] = useState<VoiceCommand>();
  const [spotlight, setSpotlight] =
    useState<Extract<VoiceCommand, { kind: "spotlight" }>>();
  const [repairCommand, setRepairCommand] =
    useState<Extract<VoiceCommand, { kind: "preview" | "status" }>>();
  const [offline, setOffline] = useState(false);
  const [progress, setProgress] = useState<{
    phase: "running" | "failed";
    evidence: unknown;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const record = await readWorkspace();
      setSignedIn(Boolean(record));
      setOffline(false);
      setRepair(record?.repair ?? null);
      if (record) {
        const cursor = voiceCursor.current;
        const commands = record.commands;
        const newest = commands.at(-1);
        if (cursor !== null) {
          for (const command of commands) {
            if (command.id <= cursor) continue;
            setRepoRoom(command.kind === "repository" ? {mode: command.mode, hours: command.hours, id: command.id} : undefined);
            setXray(
              command.kind === "xray" ||
                command.kind === "spotlight" ||
                command.kind === "focus",
            );
            setVoiceCommand(command);
            if (command.kind === "spotlight") setSpotlight(command);
            else setSpotlight(undefined);
            if (command.kind === "preview" || command.kind === "status")
              setRepairCommand(command);
          }
        }
        voiceCursor.current = Math.max(cursor ?? 0, newest?.id ?? 0);
      }
      setProgress((previous) =>
        JSON.stringify(previous) === JSON.stringify(record?.progress ?? null)
          ? previous
          : (record?.progress ?? null),
      );
      if (record?.evidence) {
        setEvents(record.events ?? []);
        setRetryId(record.retryId ?? "");
        setStatus(record.state ?? "");
        setReceipt(record.github ?? "");
        setHandoverSummary(record.summary ?? "");
        setResult((previous) => ({
          data: record.evidence,
          proposal: record.proposal,
          error: previous.error,
        }));
      } else {
        setEvents((previous) => previous.length ? [] : previous);
        setRetryId("");
        setStatus("");
        setReceipt("");
        setHandoverSummary("");
        setResult((previous) => previous.data || previous.proposal ? {error:previous.error} : previous);
      }
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => configure(signedIn, refresh), [configure, signedIn, refresh]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await refresh();
      if (!cancelled) timer = setTimeout(poll, xray || signedIn ? 950 : 3000);
    }
    timer = setTimeout(poll, 0);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refresh, xray, signedIn]);

  useEffect(() => {
    if (
      !voiceCommand ||
      voiceCommand.kind === "repository" ||
      voiceCommand.kind === "xray" ||
      voiceCommand.kind === "spotlight" ||
      voiceCommand.kind === "focus" ||
      xray
    )
      return;
    const target =
      voiceCommand.kind === "review"
        ? (document.getElementById("approval-proposal") ??
          document.getElementById("operator-decision"))
        : document.getElementById("checkout-repair");
    target?.scrollIntoView({ block: "nearest" });
    target?.focus({ preventScroll: true });
  }, [voiceCommand, xray]);

  async function check() {
    setNotice("");
    setBusy(true);
    setResult((previous) => ({ ...previous, error: undefined }));
    try {
      const response = await loadEvidence();
      if ("error" in response)
        setResult((previous) => ({ ...previous, error: response.error }));
      else {
        setResult(response);
        await refresh();
      }
    } catch {
      setResult((previous) => ({
        ...previous,
        error: "Unable to reach the investigation service.",
      }));
    } finally {
      setBusy(false);
    }
  }

  async function perform(action: () => Promise<string>) {
    setSaving(true);
    setNotice("");
    try {
      setNotice(await action());
      await refresh();
    } catch {
      setNotice(
        "Unable to confirm the result. Check the activity before retrying.",
      );
    } finally {
      setSaving(false);
    }
  }

  const { data, proposal, error } = result;
  const stateLabel = proposal
    ? "Approval needed"
    : status === "succeeded"
      ? "Handover saved"
      : status
        ? status.replaceAll("_", " ")
        : "Investigation";

  return (
    <>
      <header className="topbar workspace-topbar">
        <div className="shell topbar-inner">
          <div className="workspace-brand">
            <Link className="brand" href="/" aria-label="ShiftRelay home">
              <span className="brand-mark" aria-hidden="true">
                <AudioLines size={20} />
              </span>
              ShiftRelay AI
            </Link>
            <span className="brand-detail">Incident operations</span>
          </div>
          <span className="access">
            <i className={signedIn ? "online" : ""} />
            {signedIn ? "Workspace ready" : "Connecting"}
          </span>
        </div>
      </header>
      <main
        className={xray ? "shell workspace xray-workspace" : "shell workspace"}
      >
        {repoRoom && signedIn ? (
          <RepositoryRoom initial={repoRoom} activeVoice={!!signal.sessionId} onClose={() => setRepoRoom(undefined)} />
        ) : xray ? (
          <div className="xray-back">
            <button
              type="button"
              className="secondary"
              ref={viewControl}
              onClick={() => {
                focusViewControl.current = true;
                setSpotlight(undefined);
                setXray(false);
              }}
            >
              <ArrowLeft size={17} /> Back to workspace
            </button>
            {signedIn && <button className="secondary" onClick={() => {setXray(false);setRepoRoom({mode:"history"});}}>
              <History size={16} /> Repository history
            </button>}
          </div>
        ) : (
          <div className="page-heading workspace-heading">
            <div>
              <span className="workspace-eyebrow"><span /> INCIDENT OPERATIONS</span>
              <h1>Incident workspace.</h1>
              <p>
                Investigate checkout failures and carry context into the next
                shift.
              </p>
            </div>
            <div className="workspace-shortcuts">
            <button
              type="button"
              className="xray-launch workspace-xray-launch"
              aria-label="Open Incident X-Ray"
              ref={viewControl}
              onClick={() => {
                focusViewControl.current = true;
                setSpotlight(undefined);
                setXray(true);
              }}
            >
              <span className="workspace-xray-icon" aria-hidden="true">
                <ScanLine size={34} strokeWidth={1.15} />
                <Network size={17} strokeWidth={1.5} />
              </span>
              <span className="workspace-xray-copy">
                <strong>Open Incident X-Ray</strong>
                <small>Trace the evidence behind the failure</small>
              </span>
              <ArrowRight size={20} aria-hidden="true" />
            </button>
            {signedIn && <button className="workspace-repo-launch" onClick={() => setRepoRoom({mode:"briefing"})}>
              <span className="workspace-repo-icon"><GitBranch size={21} /></span>
              <span><strong>Explore repository</strong><small>Briefing, history &amp; planning</small></span>
              <ArrowRight size={18} />
            </button>}
            </div>
          </div>
        )}
        {xray && (
          <IncidentXray
            spotlight={
              spotlight &&
              (!signal.sessionId ||
                !spotlight.agentId ||
                signal.sessionId === spotlight.agentId)
                ? spotlight
                : undefined
            }
            voiceSignal={signal}
            voiceFocus={
              voiceCommand?.kind === "focus" || voiceCommand?.kind === "xray"
                ? voiceCommand
                : undefined
            }
            onStopSpotlight={() => setSpotlight(undefined)}
            repair={repair}
            source={progress ? progress.evidence : data}
            action={
              progress
                ? undefined
                : proposal
                  ? { target: proposal.target, summary: proposal.body }
                  : status
                    ? {
                        state: status,
                        summary: handoverSummary,
                        github: receipt,
                      }
                    : undefined
            }
            phase={
              offline
                ? "offline"
                : progress?.phase === "failed" || error
                  ? "failed"
                  : progress?.phase === "running" || busy
                    ? "running"
                    : "idle"
            }
            onInvestigate={() => void check()}
            onReview={() => setXray(false)}
          />
        )}
        <div className="desk workspace-desk" hidden={xray || (!!repoRoom && signedIn)}>
          {!xray && !(repoRoom && signedIn) && (
            <div className="workspace-voice-slot">
              <div ref={mount} />
              <div
                className="panel workspace-voice-placeholder"
                aria-hidden="true"
              >
                <div className="voice-console">
                  <div className="voice-heading">
                    <AudioLines size={20} />
                    <h2>Voice session</h2>
                  </div>
                  <div className="wave" />
                </div>
                <div className="transcript-heading">
                  <h3>Transcript</h3>
                </div>
              </div>
            </div>
          )}
          <section
            className="incident panel"
            aria-labelledby="incident-heading"
          >
            <div className="panel-heading">
              <div className="heading-icon">
                <Activity size={20} />
              </div>
              <div>
                <h2 id="incident-heading">Checkout deployment</h2>
                <span className="muted">Investigation &amp; handover</span>
              </div>
              <button
                className="secondary refresh"
                disabled={busy}
                onClick={check}
              >
                <RefreshCw size={15} className={busy ? "spin" : ""} />
                {busy ? "Checking…" : "Check latest build"}
              </button>
            </div>
            <div
              className="incident-scroll"
              tabIndex={0}
              role="region"
              aria-label="Investigation details"
            >
              {error && (
                <p className="feedback" role="alert">
                  {error}
                </p>
              )}
              {!data ? (
                <div className="empty">
                  <span className="workspace-empty-icon" aria-hidden="true">
                    <Box size={27} strokeWidth={1.5} />
                  </span>
                  <h3>No investigation loaded</h3>
                  <p>
                    Check the latest build, or ask ShiftRelay to
                    investigate by voice.
                  </p>
                  <button className="workspace-empty-action" onClick={check} disabled={busy}>
                    <RefreshCw size={15} /> {busy ? "Checking…" : "Investigate latest build"}
                  </button>
                </div>
              ) : (
                <div className="incident-content">
                  <RunComparison data={data} repair={repair} />
                  <div className="evidence">
                    <div className="row-title">
                      <h3>Build evidence</h3>
                      <span className="tag">{data.conclusion}</span>
                    </div>
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      className="reference"
                      href={data.url}
                    >
                      <GitBranch size={16} />
                      {data.run}
                      <ExternalLink size={13} />
                    </a>
                    <ul className="steps">
                      {data.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                    {!!data.jobLogEvidence?.some(
                      ({ errors }) => errors.length > 0,
                    ) && (
                      <details open>
                        <summary>Failed job log evidence</summary>
                        {data.jobLogEvidence
                          .filter(({ errors }) => errors.length > 0)
                          .map(({ url, errors }) => (
                            <div key={url}>
                              <ul className="steps">
                                {errors.map((message, index) => (
                                  <li key={index}>{message}</li>
                                ))}
                              </ul>
                              <a
                                target="_blank"
                                rel="noopener noreferrer"
                                href={url}
                              >
                                View GitHub job <ExternalLink size={12} />
                              </a>
                            </div>
                          ))}
                      </details>
                    )}
                    {data.comparison && (
                      <div className="build-comparison">
                        <h3>Compare with last passing build</h3>
                        <dl>
                          <dt>Current Git commit</dt>
                          <dd>
                            <code>{data.comparison.revision.slice(0, 8)}</code>{" "}
                            · {data.comparison.branch}
                          </dd>
                          <dt>Last passing Git commit</dt>
                          <dd>
                            {data.comparison.baseline ? (
                              <a
                                target="_blank"
                                rel="noopener noreferrer"
                                href={data.comparison.baseline.url}
                              >
                                <code>
                                  {data.comparison.baseline.revision.slice(
                                    0,
                                    8,
                                  )}
                                </code>{" "}
                                <ExternalLink size={12} />
                              </a>
                            ) : data.comparison.status === "unavailable" ? (
                              "GitHub comparison unavailable"
                            ) : (
                              "No earlier passing run on this branch"
                            )}
                          </dd>
                        </dl>
                        {data.comparison.manifestChange && (
                          <details open>
                            <summary>Checkout manifest diff</summary>
                            <pre className="manifest-diff">
                              {data.comparison.manifestChange.patch
                                .split("\n")
                                .map((line, index) => (
                                  <span
                                    key={index}
                                    className={
                                      line.startsWith("-")
                                        ? "removed"
                                        : line.startsWith("+")
                                          ? "added"
                                          : undefined
                                    }
                                  >
                                    {line}
                                    {"\n"}
                                  </span>
                                ))}
                            </pre>
                            <a
                              target="_blank"
                              rel="noopener noreferrer"
                              href={data.comparison.manifestChange.url}
                            >
                              Verify diff on GitHub <ExternalLink size={12} />
                            </a>
                          </details>
                        )}
                        <p className="muted">
                          {data.comparison.manifestChange
                            ? "Pair the manifest change with the failed job log to verify the regression."
                            : "The failed step identifies where validation stopped. The cause still needs confirmation."}
                        </p>
                      </div>
                    )}
                    {data.runbook && (
                      <details>
                        <summary>
                          <FileText size={15} />
                          Runbook guidance
                        </summary>
                        <p>
                          {data.runbook.excerpt
                            .replace(/^#.*\r?\n+/, "")
                            .replace(/\*\*/g, "")}
                        </p>
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href={data.runbook.url}
                        >
                          Read source <ExternalLink size={12} />
                        </a>
                      </details>
                    )}
                    <div className="related">
                      <h3>Related issues</h3>
                      {data.candidates.length ? (
                        data.candidates.map((issue) => (
                          <a
                            target="_blank"
                            rel="noopener noreferrer"
                            className="reference"
                            key={issue.number}
                            href={issue.url}
                          >
                            <span>#{issue.number}</span>
                            {issue.title}
                            <ExternalLink size={13} />
                          </a>
                        ))
                      ) : (
                        <p className="muted">No matching open issue.</p>
                      )}
                      {!!data.historicalIssues?.length && (
                        <details>
                          <summary>Closed checkout incidents</summary>
                          {data.historicalIssues.map((issue) => (
                            <a
                              target="_blank"
                              rel="noopener noreferrer"
                              className="reference"
                              key={issue.number}
                              href={issue.url}
                            >
                              #{issue.number} {issue.title}{" "}
                              <ExternalLink size={13} />
                            </a>
                          ))}
                        </details>
                      )}
                    </div>
                  </div>
                  <div
                    className="decision"
                    id="operator-decision"
                    tabIndex={-1}
                  >
                    <div className="row-title">
                      <h3>
                        {status === "succeeded"
                          ? "Shift handover"
                          : "Operator decision"}
                      </h3>
                      <span className="tag">{stateLabel}</span>
                    </div>
                    {!proposal && (
                      <div className="decision-result">
                        <p className="muted">
                          {status === "succeeded"
                            ? "The GitHub update and Discord delivery are recorded in the handover."
                            : status === "declined"
                              ? "The proposal was declined."
                              : "There is no proposal awaiting approval."}
                        </p>
                        {receipt && (
                          <a
                            target="_blank"
                            rel="noopener noreferrer"
                            className="reference"
                            href={receipt}
                          >
                            View the GitHub update <ExternalLink size={13} />
                          </a>
                        )}
                        {status === "succeeded" && (
                          <dl className="handover-proof">
                            <dt>Failure</dt>
                            <dd>{data.steps.join(", ") || data.conclusion}</dd>
                            <dt>GitHub</dt>
                            <dd>Update recorded</dd>
                            <dt>Discord</dt>
                            <dd>Notification delivered</dd>
                            <dt>Next shift</dt>
                            <dd>
                              Review the manifest diff and failed job log before
                              deciding on a fix.
                            </dd>
                          </dl>
                        )}
                        {handoverSummary && (
                          <button
                            className="secondary"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  [
                                    "Checkout deployment handover",
                                    "Build: " + data.url,
                                    ...data.steps.map(
                                      (step) => "Failed step: " + step,
                                    ),
                                    handoverSummary,
                                    "Root cause: unconfirmed.",
                                    "Next check: inspect the workflow annotation and compare the payment schema revision with the last successful run.",
                                    ...(data.runbook
                                      ? ["Runbook: " + data.runbook.url]
                                      : []),
                                  ].join("\n"),
                                );
                                setNotice("Handover copied.");
                              } catch {
                                setNotice(
                                  "Clipboard unavailable in this browser.",
                                );
                              }
                            }}
                          >
                            Copy handover
                          </button>
                        )}
                      </div>
                    )}
                    {proposal && (
                      <div
                        className="proposal"
                        id="approval-proposal"
                        tabIndex={-1}
                      >
                        <strong>{proposal.target}</strong>
                        <pre>{proposal.body}</pre>
                        <p className="muted">
                          Send the same evidence to Discord and save the
                          handover.
                        </p>
                        <div className="button-row">
                          <button
                            disabled={saving}
                            onClick={() =>
                              void perform(() => review(proposal.id, true))
                            }
                          >
                            Approve actions
                          </button>
                          <button
                            className="secondary"
                            disabled={saving}
                            onClick={() =>
                              void perform(() => review(proposal.id, false))
                            }
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    )}
                    {retryId && (
                      <button
                        className="secondary"
                        disabled={saving}
                        onClick={() =>
                          void perform(() => retryDiscord(retryId))
                        }
                      >
                        Retry Discord notification
                      </button>
                    )}
                    {(saving || notice) && (
                      <p className="feedback" role="status">
                        {saving ? "Saving decision…" : notice}
                      </p>
                    )}
                    {signedIn &&
                      (data.comparison?.manifestChange || repair) && (
                        <CheckoutRepair
                          key={repairCommand?.id ?? 0}
                          initialPlan={
                            repairCommand?.kind === "preview"
                              ? repairCommand.plan
                              : undefined
                          }
                          initialResult={
                            repairCommand?.kind === "status"
                              ? repairCommand.result
                              : undefined
                          }
                          onVerification={({ receipt, verification }) =>
                            setRepair({ ...receipt, verification })
                          }
                        />
                      )}
                    {signedIn && (
                      <details className="rehearsal">
                        <summary>Recovery rehearsal · simulated</summary>
                        <p className="muted">
                          Run the real approval and retry logic with test
                          responses in an isolated database.
                        </p>
                        <button
                          className="secondary"
                          disabled={rehearsing}
                          onClick={async () => {
                            setRehearsing(true);
                            setRehearsalError(false);
                            setRehearsal(undefined);
                            try {
                              setRehearsal(await rehearseRecovery());
                            } catch {
                              setRehearsalError(true);
                            } finally {
                              setRehearsing(false);
                            }
                          }}
                        >
                          {rehearsing
                            ? "Running rehearsal…"
                            : "Rehearse Discord rejection and retry"}
                        </button>
                        {rehearsal && (
                          <div className="handover-proof" role="status">
                            <p>
                              GitHub confirmed · {rehearsal.githubWrites} write
                            </p>
                            <p>Discord rejected the first attempt · HTTP 429</p>
                            <p>
                              Discord-only retry succeeded ·{" "}
                              {rehearsal.discordAttempts} attempts total
                            </p>
                          </div>
                        )}
                        {rehearsalError && (
                          <p role="alert">
                            The rehearsal did not finish. Try again.
                          </p>
                        )}
                      </details>
                    )}
                  </div>
                </div>
              )}
              {events.length > 0 && (
                <section className="timeline">
                  <h3>
                    <History size={17} /> Investigation timeline
                  </h3>
                  <ol>
                    {events.map((event) => (
                      <li key={event.id}>
                        <time>{event.time} UTC</time>
                        <p>{event.text}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
