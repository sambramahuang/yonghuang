import type { ImpactGraph } from "../lib/legalGraph";
import { STATUS_CONFIG } from "../statusConfig";
import type { ChangeStatus, FirmDocument } from "../types";
import Modal from "./Modal";

interface Props {
  doc: FirmDocument;
  graph: ImpactGraph;
  onClose: () => void;
}

const FILL: Record<ChangeStatus, string> = {
  no_change: "fill-good",
  change: "fill-warn",
  uncertain: "fill-seminal",
};

const STROKE: Record<ChangeStatus, string> = {
  no_change: "stroke-good-line",
  change: "stroke-warn-line",
  uncertain: "stroke-seminal-line",
};

const SIZE = 480;
const CENTER = SIZE / 2;
const RADIUS = 170;

export default function ImpactGraphModal({ doc, graph, onClose }: Props) {
  const ringNodes = graph.nodes.filter((n) => !n.isCenter);
  const positions = new Map<string, { x: number; y: number }>();
  positions.set(doc.id, { x: CENTER, y: CENTER });

  ringNodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(ringNodes.length, 1) - Math.PI / 2;
    positions.set(node.id, {
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle),
    });
  });

  return (
    <Modal
      title="Blast radius graph"
      subtitle={`${doc.title} — propagation across the firm's document graph`}
      onClose={onClose}
      wide
    >
      {ringNodes.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No other document shares an authority with this one — nothing is currently affected.
        </p>
      ) : (
        <>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto w-full max-w-lg">
            {graph.edges.map((edge) => {
              const from = positions.get(edge.source)!;
              const to = positions.get(edge.target)!;
              const targetNode = graph.nodes.find((n) => n.id === edge.target)!;
              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={STROKE[targetNode.status]}
                  strokeWidth={2}
                />
              );
            })}

            {graph.nodes.map((node) => {
              const pos = positions.get(node.id)!;
              const r = node.isCenter ? 34 : 24;
              return (
                <g key={node.id}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={r}
                    className={`${FILL[node.status]} ${node.isCenter ? "opacity-100" : "opacity-90"}`}
                    stroke="var(--color-surface)"
                    strokeWidth={3}
                  />
                  <text
                    x={pos.x}
                    y={pos.y + r + 14}
                    textAnchor="middle"
                    className="fill-ink text-[10px] font-medium"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {node.title.length > 26 ? `${node.title.slice(0, 24)}…` : node.title}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-ink-soft">
            {(Object.keys(STATUS_CONFIG) as ChangeStatus[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_CONFIG[s].dot}`} />
                {STATUS_CONFIG[s].short}
              </span>
            ))}
          </div>

          <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
            {graph.edges.map((edge) => {
              const targetNode = graph.nodes.find((n) => n.id === edge.target)!;
              return (
                <li key={`${edge.source}-${edge.target}`} className="text-xs text-ink-soft">
                  <span className="font-medium text-ink">{targetNode.title}</span>
                  {" — "}
                  {edge.relationship}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        This view queries the same document graph the backend maintains — as new changes are
        ingested, propagation here updates automatically instead of relying on someone
        remembering to re-check every document that cites the same authority.
      </p>
    </Modal>
  );
}
