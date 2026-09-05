import type { TextSegment } from "../types";

interface Props {
  segments: TextSegment[];
  approved: boolean;
}

// Renders a clause as a Word-track-changes-style redline: struck-through
// deletions, underlined insertions — colored green once approved, red
// while still an open suggestion.
export default function Redline({ segments, approved }: Props) {
  const insertClass = approved ? "text-good bg-good-bg" : "text-bad bg-bad-bg";
  const deleteClass = approved ? "text-ink-faint" : "text-bad/70";

  return (
    <span>
      {segments.map((seg, i) => {
        if (seg.kind === "same") return <span key={i}>{seg.text}</span>;
        if (seg.kind === "deleted") {
          return (
            <span key={i} className={`line-through decoration-2 ${deleteClass}`}>
              {seg.text}
            </span>
          );
        }
        return (
          <span key={i} className={`underline decoration-2 underline-offset-2 rounded-sm px-0.5 font-medium ${insertClass}`}>
            {seg.text}
          </span>
        );
      })}
    </span>
  );
}
