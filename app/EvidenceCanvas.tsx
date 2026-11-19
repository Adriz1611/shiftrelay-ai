"use client";

import { useId, useRef, type PointerEvent, type ReactNode } from "react";
import type { XrayNode } from "../lib/xray";

export type CanvasViewport = { x: number; y: number; zoom: number };
export type CanvasBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type CanvasEdge = { id: string; source: string; target: string; label: string };
const cardWidth = 216;
const cardHeight = 104;

export function EvidenceCanvas({
  nodes,
  edges,
  viewport,
  onPan,
  locked,
  selected,
  spotlit,
  renderNode,
}: {
  nodes: XrayNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
  onPan: (offset: { x: number; y: number }) => void;
  locked: boolean;
  selected: string;
  spotlit: string[];
  renderNode: (node: XrayNode) => ReactNode;
}) {
  const arrow = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const drag = useRef<{ x: number; y: number } | null>(null);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const px = (x: number) => viewport.x + x * viewport.zoom;
  const py = (y: number) => viewport.y + y * viewport.zoom;
  function pan(event: PointerEvent<HTMLDivElement>) {
    if (
      locked ||
      event.button !== 0 ||
      (event.target as Element).closest("button")
    )
      return;
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  return (
    <div
      className="xr-stage"
      aria-label="Evidence map"
      data-testid="evidence-canvas"
      data-viewport={JSON.stringify(viewport)}
      onPointerDown={pan}
      onPointerMove={(event) => {
        if (!drag.current || locked) return;
        onPan({
          x: event.clientX - drag.current.x,
          y: event.clientY - drag.current.y,
        });
        drag.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <svg className="xr-native-edges" aria-hidden="true">
        <defs>
          <marker
            id={arrow}
            viewBox="0 0 10 10"
            markerWidth="7"
            markerHeight="7"
            refX="9"
            refY="5"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--xr-wire)" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const a = byId.get(edge.source),
            b = byId.get(edge.target);
          if (!a || !b) return null;
          const ax = a.position.x,
            ay = a.position.y,
            bx = b.position.x,
            by = b.position.y;
          let path: string;
          if (edge.label === "Repair PR") {
            path = `M ${px(ax + cardWidth / 2)} ${py(ay)} V ${py(by + cardHeight)}`;
          } else if (
            edge.source === "checkout-incident" &&
            edge.label !== "Latest run"
          ) {
            path = `M ${px(ax + cardWidth / 2)} ${py(ay + cardHeight)} V ${py(by - 25)} H ${px(bx + cardWidth / 2)} V ${py(by)}`;
          } else {
            const from = px(ax + cardWidth),
              to = px(bx),
              start = py(ay + cardHeight / 2),
              end = py(by + cardHeight / 2);
            const bend = (from + to) / 2;
            path = `M ${from} ${start} C ${bend} ${start}, ${bend} ${end}, ${to} ${end}`;
          }
          const active = spotlit.length
            ? spotlit.includes(edge.target)
            : edge.source === selected || edge.target === selected;
          return (
            <path
              key={edge.id}
              d={path}
              markerEnd={`url(#${arrow})`}
              className={active ? "xr-native-edge active" : "xr-native-edge"}
            />
          );
        })}
      </svg>
      {nodes.map((node) => (
        <div
          key={node.id}
          className="xr-native-node"
          style={
            {
              left: px(node.position.x),
              top: py(node.position.y),
              width: cardWidth * viewport.zoom,
              height: cardHeight * viewport.zoom,
              "--node-scale": viewport.zoom,
            } as React.CSSProperties
          }
        >
          {renderNode(node)}
        </div>
      ))}
    </div>
  );
}
