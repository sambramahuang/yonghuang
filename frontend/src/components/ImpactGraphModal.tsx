import { useState } from "react";
import type { ImpactGraph, ImpactGraphNode } from "../lib/legalGraph";
import {
  AUTHORITY_ICON,
  AUTHORITY_TYPE_LABEL,
  DOC_TYPE_GROUP,
  DOC_TYPE_GROUP_CONFIG,
  DOC_TYPE_ICON,
  STATUS_CONFIG,
} from "../statusConfig";
import type { DocTypeGroup } from "../statusConfig";
import type { FirmDocType } from "../types";
import Modal from "./Modal";

interface Props {
  graphs: ImpactGraph[];
  onClose: () => void;
}

const SIZE = 520;
const CENTER = SIZE / 2;
const RADIUS = 190;
const NODE_R = 34;
const CENTER_R = 62;

interface CategoryNode {
  type: FirmDocType;
  documents: ImpactGraphNode[];
}

function groupByType(nodes: ImpactGraphNode[]): CategoryNode[] {
  const byType = new Map<FirmDocType, ImpactGraphNode[]>();
  for (const node of nodes) {
    if (!byType.has(node.type)) byType.set(node.type, []);
    byType.get(node.type)!.push(node);
  }
  return [...byType.entries()]
    .map(([type, documents]) => ({ type, documents }))
    .sort((a, b) => b.documents.length - a.documents.length);
}

function AuthorityGraph({ graph }: { graph: ImpactGraph }) {
  const AuthorityIcon = AUTHORITY_ICON[graph.authorityType];
  const [selectedType, setSelectedType] = useState<FirmDocType | null>(null);
  const hasOthers = graph.nodes.some((n) => !n.isOrigin);
  const categories = groupByType(graph.nodes);
  const selected = categories.find((c) => c.type === selectedType) ?? null;

  const positioned = categories.map((cat, i) => {
    const angle = (2 * Math.PI * i) / Math.max(categories.length, 1) - Math.PI / 2;
    return { cat, x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <AuthorityIcon size={15} className="mt-0.5 shrink-0 text-brand" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{graph.authority}</p>
          <p className="text-xs text-ink-faint">
            {AUTHORITY_TYPE_LABEL[graph.authorityType]} · affects {graph.nodes.length} document
            {graph.nodes.length !== 1 ? "s" : ""} across {categories.length} document type
            {categories.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {!hasOthers ? (
        <p className="text-sm text-ink-soft">No other document currently cites this authority.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto w-full max-w-lg">
            {positioned.map(({ cat, x, y }) => (
              <line key={cat.type} x1={CENTER} y1={CENTER} x2={x} y2={y} className="stroke-line-soft" strokeWidth={2} />
            ))}

            <circle cx={CENTER} cy={CENTER} r={CENTER_R} className="fill-ink" stroke="var(--color-surface)" strokeWidth={3} />
            <foreignObject x={CENTER - CENTER_R + 6} y={CENTER - CENTER_R + 6} width={(CENTER_R - 6) * 2} height={(CENTER_R - 6) * 2}>
              <div className="flex h-full w-full items-center justify-center px-1 text-center">
                <p className="line-clamp-4 text-[9px] font-semibold leading-tight text-paper">{graph.authority}</p>
              </div>
            </foreignObject>

            {positioned.map(({ cat, x, y }) => {
              const Icon = DOC_TYPE_ICON[cat.type];
              const group = DOC_TYPE_GROUP_CONFIG[DOC_TYPE_GROUP[cat.type]];
              const isSelected = selectedType === cat.type;
              return (
                <g
                  key={cat.type}
                  className="cursor-pointer"
                  onClick={() => setSelectedType(isSelected ? null : cat.type)}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={NODE_R}
                    className={`${group.bg} transition-opacity hover:opacity-80`}
                    stroke={isSelected ? "var(--color-ink)" : "var(--color-surface)"}
                    strokeWidth={isSelected ? 3.5 : 3}
                  />
                  <foreignObject x={x - NODE_R} y={y - NODE_R} width={NODE_R * 2} height={NODE_R * 2}>
                    <div className="flex h-full w-full items-center justify-center">
                      <Icon size={16} className={group.text} />
                    </div>
                  </foreignObject>
                  <text
                    x={x}
                    y={y + NODE_R + 14}
                    textAnchor="middle"
                    className="fill-ink text-[10px] font-semibold"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {cat.type}
                  </text>
                  <text
                    x={x}
                    y={y + NODE_R + 27}
                    textAnchor="middle"
                    className="fill-ink-faint text-[9px]"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {cat.documents.length} document{cat.documents.length !== 1 ? "s" : ""}
                  </text>
                </g>
              );
            })}
          </svg>

          {selected && (
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  {selected.type} · {selected.documents.length} document{selected.documents.length !== 1 ? "s" : ""}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedType(null)}
                  className="text-xs font-medium text-ink-faint hover:text-ink-soft"
                >
                  Close
                </button>
              </div>
              <ul className="space-y-1.5">
                {selected.documents.map((node) => (
                  <li key={node.documentId} className="flex items-center justify-between gap-3 text-xs text-ink-soft">
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-ink">{node.title}</span>
                      {node.isOrigin && <span className="text-ink-faint"> (this document)</span>}
                      {" — "}
                      <span className="font-mono">{node.citation}</span>
                    </span>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CONFIG[node.status].bg} ${STATUS_CONFIG[node.status].text} ${STATUS_CONFIG[node.status].border}`}
                    >
                      {STATUS_CONFIG[node.status].short}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ImpactGraphModal({ graphs, onClose }: Props) {
  return (
    <Modal
      title="Blast radius graph"
      subtitle="Propagation across the firm's document graph, centered on the authority behind each change. Click a document type to see which documents it affects."
      onClose={onClose}
      wide
    >
      {graphs.length === 0 ? (
        <p className="text-sm text-ink-soft">This document has no logged changes to trace.</p>
      ) : (
        <div className="space-y-8">
          {graphs.map((graph, i) => (
            <div key={graph.authority}>
              {i > 0 && <div className="mb-8 border-t border-line" />}
              <AuthorityGraph graph={graph} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-line pt-4 text-xs text-ink-soft">
        {(Object.keys(DOC_TYPE_GROUP_CONFIG) as DocTypeGroup[]).map((g) => (
          <span key={g} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${DOC_TYPE_GROUP_CONFIG[g].bg}`} />
            {DOC_TYPE_GROUP_CONFIG[g].label}
          </span>
        ))}
        <span className="h-3 w-px bg-line" />
        {Object.keys(STATUS_CONFIG).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].dot}`} />
            {STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].short}
          </span>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        This view queries the same document graph the backend maintains — as new changes are
        ingested, propagation here updates automatically instead of relying on someone
        remembering to re-check every document that cites the same authority.
      </p>
    </Modal>
  );
}
