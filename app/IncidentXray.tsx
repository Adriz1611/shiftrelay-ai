"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getViewportForBounds } from "@xyflow/react";
import {
  EvidenceCanvas,
  type CanvasViewport,
  type CanvasBounds,
} from "./EvidenceCanvas";
import {
  Activity,
  ArrowDownRight,
  CircleHelp,
  Crosshair,
  ExternalLink,
  FileDiff,
  GitBranch,
  GitPullRequest,
  List,
  LocateFixed,
  ScanLine,
  Workflow,
} from "lucide-react";
import { buildXray } from "../lib/xray";
import { spotlightIndex, type SpotlightStep } from "../lib/spotlight";
import type { VoiceSignal } from "./VoiceProvider";

const icons = {
  incident: Crosshair,
  workflow: Workflow,
  evidence: FileDiff,
  history: GitPullRequest,
  runbook: List,
  hypothesis: ScanLine,
  unknown: CircleHelp,
  action: Activity,
};
const names = {
  incident: "Incident",
  workflow: "Workflow",
  evidence: "Evidence",
  history: "GitHub issue",
  runbook: "Runbook",
  hypothesis: "Hypothesis",
  unknown: "Unknown",
  action: "Action",
};
export default function IncidentXray({
  source,
  repair,
  action,
  phase,
  onInvestigate,
  onReview,
  spotlight,
  voiceSignal,
  voiceFocus,
  onStopSpotlight,
}: {
  source: unknown;
  repair?: Parameters<typeof buildXray>[3];
  action: Parameters<typeof buildXray>[1];
  phase: "idle" | "running" | "failed" | "offline";
  onInvestigate: () => void;
  onReview: () => void;
  spotlight?: { id: number; createdAt: number; steps: SpotlightStep[] };
  voiceSignal: VoiceSignal;
  voiceFocus?: { id: number; nodeId?: string };
  onStopSpotlight: () => void;
}) {
  const graph = useMemo(
    () => buildXray(source, action, phase !== "running", repair),
    [source, action, phase, repair],
  );
  const [selectedId, setSelectedId] = useState("checkout-incident");
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<"canvas" | "list">();
  const [narrow, setNarrow] = useState(false);
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const listView = view ? view === "list" : narrow;
  useEffect(() => {
    const media = window.matchMedia("(max-width:840px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!canvasElement) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCanvasSize({ width, height });
    });
    observer.observe(canvasElement);
    return () => observer.disconnect();
  }, [canvasElement]);
  const [follow, setFollow] = useState<{
    command: number;
    index: number;
    turn?: number;
    manual?: boolean;
  }>();
  const seenSession = useRef(voiceSignal.sessionId);
  const interrupted =
    !!spotlight && (voiceSignal.interruption ?? 0) > spotlight.createdAt;
  const guide = interrupted ? undefined : spotlight;
  const followIndex =
    follow?.command === guide?.id ? (follow?.index ?? -1) : -1;
  const caption = voiceSignal.caption;
  useEffect(() => {
    if (seenSession.current && !voiceSignal.sessionId && spotlight)
      onStopSpotlight();
    seenSession.current = voiceSignal.sessionId;
  }, [voiceSignal.sessionId, spotlight, onStopSpotlight]);
  useEffect(() => {
    if (!guide || !caption || caption.receivedAt < guide.createdAt) return;
    const index = spotlightIndex(caption.text, guide.steps);
    if (index < 0) return;
    setFollow((previous) => {
      if (
        previous?.command === guide.id &&
        (previous.manual ||
          (previous.turn !== undefined && previous.turn !== caption.turnId) ||
          previous.index >= index)
      )
        return previous;
      return { command: guide.id, index, turn: caption.turnId };
    });
  }, [guide, caption]);
  const visible = useMemo(
    () =>
      graph.nodes.filter(
        (node) => expanded || !node.extra || node.id === voiceFocus?.nodeId,
      ),
    [expanded, graph, voiceFocus?.nodeId],
  );
  const spotlightIds = guide?.steps.map((step) => step.id) ?? [];
  const activeStep = guide?.steps[Math.max(0, followIndex)];
  const selected =
    visible.find((node) => node.id === (activeStep?.id ?? selectedId)) ??
    visible[0];
  const framed = guide
    ? visible.filter((node) => spotlightIds.includes(node.id))
    : [];
  const framedKey = framed
    .map((node) => node.position.x + ":" + node.position.y)
    .join(",");
  const focusedNode = voiceFocus?.nodeId
    ? visible.find((node) => node.id === voiceFocus.nodeId)
    : undefined;
  const focusedX = focusedNode?.position.x;
  const focusedY = focusedNode?.position.y;
  const guideId = guide?.id;
  const overviewBounds = {
    x: -28,
    y: -35,
    width: expanded ? 1430 : 1190,
    height: 650,
  };
  let bounds: CanvasBounds = overviewBounds;
  if (guideId !== undefined && framedKey) {
    const points = framedKey
      .split(",")
      .map((point) => point.split(":").map(Number));
    const xs = points.map((point) => point[0]),
      ys = points.map((point) => point[1]);
    const left = Math.min(...xs),
      top = Math.min(...ys);
    bounds = {
      x: left - 36,
      y: top - 36,
      width: Math.max(...xs) - left + 288,
      height: Math.max(...ys) - top + 196,
    };
  } else if (focusedX !== undefined && focusedY !== undefined) {
    bounds = { x: focusedX - 55, y: focusedY - 60, width: 326, height: 210 };
  }
  const camera = getViewportForBounds(
    bounds,
    canvasSize.width || 800,
    canvasSize.height || 500,
    0.25,
    1.65,
    0.12,
  );
  const cameraKey = [
    guideId,
    voiceFocus?.id,
    camera.x,
    camera.y,
    camera.zoom,
  ].join(":");
  const [manualCamera, setManualCamera] = useState<{
    key: string;
    value: CanvasViewport;
  }>();
  const viewport =
    manualCamera?.key === cameraKey && !guide ? manualCamera.value : camera;
  function pan(offset: { x: number; y: number }) {
    setManualCamera((previous) => {
      const base = previous?.key === cameraKey ? previous.value : camera;
      return {
        key: cameraKey,
        value: { ...base, x: base.x + offset.x, y: base.y + offset.y },
      };
    });
  }
  function zoom(multiplier: number) {
    const next = Math.min(1.65, Math.max(0.25, viewport.zoom * multiplier));
    const cx = canvasSize.width / 2,
      cy = canvasSize.height / 2,
      ratio = next / viewport.zoom;
    setManualCamera({
      key: cameraKey,
      value: {
        x: cx - (cx - viewport.x) * ratio,
        y: cy - (cy - viewport.y) * ratio,
        zoom: next,
      },
    });
  }
  const appliedFocus = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!voiceFocus || voiceFocus.id === appliedFocus.current) return;
    if (voiceFocus.nodeId && !focusedNode) return;
    appliedFocus.current = voiceFocus.id;
    setSelectedId(focusedNode?.id ?? "checkout-incident");
  }, [focusedNode, voiceFocus]);

  const links = graph.edges.filter(
    (edge) => edge.source === selected.id || edge.target === selected.id,
  );
  function showIncident() {
    onStopSpotlight();
    setSelectedId("checkout-incident");
    fitMap();
  }
  function fitMap() {
    onStopSpotlight();
    setManualCamera(
      guide
        ? undefined
        : {
            key: cameraKey,
            value: getViewportForBounds(
              overviewBounds,
              canvasSize.width || 800,
              canvasSize.height || 500,
              0.25,
              1.65,
              0.12,
            ),
          },
    );
  }
  function selectFinding(id: string) {
    onStopSpotlight();
    setSelectedId(id);
  }

  return (
    <section className="xr-shell" aria-label="Incident X-Ray">
      <header className="xr-header">
        <div>
          <h2>
            <ScanLine size={27} /> Incident X-Ray
          </h2>
          <p>
            Checkout deployment <span aria-hidden="true">/</span> Investigation
            map
          </p>
        </div>
        <div className="xr-toolbar">
          <button
            type="button"
            className="secondary xr-list-toggle"
            aria-pressed={listView}
            onClick={() => setView(listView ? "canvas" : "list")}
          >
            <List size={16} />
            {listView ? "Show canvas" : "Show evidence list"}
          </button>
          {!!graph.nodes.some((node) => node.extra) && (
            <button
              type="button"
              className="secondary"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show key findings" : "Show more issues"}
            </button>
          )}
          <button
            type="button"
            onClick={onInvestigate}
            disabled={phase === "running"}
          >
            <GitBranch size={16} />
            {phase === "running" ? "Reading GitHub…" : "Investigate"}
          </button>
        </div>
      </header>
      <p className="xr-status" role="status">
        {phase === "running"
          ? "Investigation in progress. Findings appear as sources respond."
          : phase === "failed"
            ? "GitHub could not complete this investigation. Available evidence is shown."
            : phase === "offline"
              ? "Workspace disconnected. Showing the last available findings."
              : graph.invalidSource
                ? "The stored evidence could not be validated."
                : visible.length === 1
                  ? "Investigate checkout to load real findings."
                  : visible.length + " connected findings"}
      </p>
      {guide && (
        <div
          className="xr-spotlight-bar"
          aria-label="Evidence spotlight"
          data-timing={
            followIndex < 0 || follow?.manual
              ? "overview"
              : caption?.playbackAligned
                ? "word"
                : "caption"
          }
        >
          <ScanLine size={19} />
          <div>
            <strong>Evidence spotlight</strong>
            <p>{activeStep?.line}</p>
          </div>
          {guide.steps.length > 1 && (
            <button
              className="secondary"
              onClick={() =>
                setFollow({
                  command: guide.id,
                  index: (followIndex + 1) % guide.steps.length,
                  manual: true,
                })
              }
            >
              Next finding
            </button>
          )}
          <button className="secondary" onClick={onStopSpotlight}>
            Exit spotlight
          </button>
        </div>
      )}
      <div className="xr-layout">
        {!listView && (
          <div className="xr-canvas" ref={setCanvasElement}>
            <div className="xr-controls" aria-label="Canvas controls">
              <button onClick={showIncident}>
                <LocateFixed size={15} /> Incident
              </button>
              <button
                aria-label="Zoom out"
                disabled={!!guide}
                onClick={() => zoom(0.82)}
              >
                −
              </button>
              <button
                aria-label="Zoom in"
                disabled={!!guide}
                onClick={() => zoom(1.22)}
              >
                +
              </button>
              <button onClick={fitMap}>Fit</button>
            </div>
            <EvidenceCanvas
              nodes={visible}
              edges={graph.edges}
              viewport={viewport}
              onPan={pan}
              locked={!!guide}
              selected={selected.id}
              spotlit={spotlightIds}
              renderNode={(node) => {
                const Icon = icons[node.kind];
                const spotlightClass = guide
                  ? spotlightIds.includes(node.id)
                    ? " xr-spotlit" +
                      (followIndex >= 0 && activeStep?.id === node.id
                        ? " xr-spotlight-current"
                        : "")
                    : " xr-spotlight-muted"
                  : "";
                return (
                  <div className={spotlightClass}>
                    <button
                      type="button"
                      className={`xr-node xr-${node.kind}${node.id === selected.id ? " is-selected" : ""}`}
                      aria-pressed={node.id === selected.id}
                      onClick={() => selectFinding(node.id)}
                    >
                      <span className="xr-node-label">
                        <Icon size={14} />
                        {names[node.kind]}
                      </span>
                      <strong>{node.title}</strong>
                      <small>{node.summary}</small>
                    </button>
                  </div>
                );
              }}
            />
          </div>
        )}
        <div
          className={
            listView ? "xr-finding-list force-list" : "xr-finding-list"
          }
        >
          {visible.map((node) => (
            <button
              key={node.id}
              aria-pressed={node.id === selected.id}
              onClick={() => selectFinding(node.id)}
            >
              <span>{names[node.kind]}</span>
              <strong>{node.title}</strong>
              <ArrowDownRight size={15} />
            </button>
          ))}
        </div>
        <aside className="xr-inspector" aria-label="Evidence inspector">
          <span
            className={`xr-classification xr-${selected.classification.toLowerCase()}`}
          >
            {selected.classification}
          </span>
          <h3>{selected.title}</h3>
          <p className="xr-inspector-summary">{selected.summary}</p>
          {selected.relation && (
            <p className="xr-relation">
              <ArrowDownRight size={15} />
              {selected.relation}
            </p>
          )}
          <pre>{selected.detail}</pre>
          {selected.timestamp && (
            <time dateTime={selected.timestamp}>
              {new Date(selected.timestamp).toLocaleString()}
            </time>
          )}
          {selected.url && (
            <a href={selected.url} target="_blank" rel="noreferrer">
              Open source <ExternalLink size={14} />
            </a>
          )}
          {selected.relatedUrl && (
            <a href={selected.relatedUrl} target="_blank" rel="noreferrer">
              {selected.relation === "Repair PR"
                ? "Open validation run"
                : "Earlier workflow cited by the issue"}{" "}
              <ExternalLink size={14} />
            </a>
          )}
          {selected.kind === "action" && action?.target && (
            <button className="xr-review" onClick={onReview}>
              Review in workspace
            </button>
          )}
          <div className="xr-connections">
            {!!links.length && <h4>Connected evidence</h4>}
            {links.map((edge) => {
              const node = visible.find(
                (item) =>
                  item.id ===
                  (edge.source === selected.id ? edge.target : edge.source),
              );
              return (
                node && (
                  <button
                    className="secondary"
                    key={edge.id}
                    onClick={() => selectFinding(node.id)}
                  >
                    <span>
                      <small>{edge.label}</small>
                      {node.title}
                    </span>
                    <ArrowDownRight size={14} />
                  </button>
                )
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}
