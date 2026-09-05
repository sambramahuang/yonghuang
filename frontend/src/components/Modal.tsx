import { X } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  title?: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

// `title` is optional so content with its own heading (e.g. UploadChangePanel)
// can be dropped in without a duplicate title bar — the close button then
// floats over the content instead of sitting in a header row.
export default function Modal({ title, subtitle, onClose, children, wide }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
      onClick={onClose}
    >
      <div
        className={`relative max-h-[85vh] w-full ${wide ? "max-w-3xl" : "max-w-xl"} overflow-y-auto rounded-2xl bg-surface shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-md p-1 text-ink-faint hover:bg-surface-2 hover:text-ink-soft"
        >
          <X size={18} />
        </button>
        {title && (
          <div className="sticky top-0 border-b border-line bg-surface p-6 pr-14">
            <h2 className="font-serif text-xl font-medium text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          </div>
        )}
        <div className={title ? "p-6" : "p-8"}>{children}</div>
      </div>
    </div>
  );
}
