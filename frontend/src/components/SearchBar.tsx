import { Search } from "lucide-react";
import type { ReactNode } from "react";
import type { SortKey } from "../types";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  sortKey: SortKey;
  onSortChange: (s: SortKey) => void;
  rightSlot?: ReactNode;
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "lastUpdated", label: "Last updated" },
  { value: "blastRadius", label: "Blast radius" },
  { value: "severity", label: "Status severity" },
];

export default function SearchBar({
  query,
  onQueryChange,
  sortKey,
  onSortChange,
  rightSlot,
}: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search Acts, cases, guidelines, playbooks, templates, advisories…"
          className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-ink-faint/20"
        />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="sort" className="whitespace-nowrap text-sm text-ink-soft">
          Sort by
        </label>
        <select
          id="sort"
          value={sortKey}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-ink-faint/20"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {rightSlot}
    </div>
  );
}
