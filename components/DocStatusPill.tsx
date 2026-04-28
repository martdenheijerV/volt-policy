import type { DocStatus } from "@/lib/types";

/**
 * Small status indicator for the document header.
 *
 * Replaces the previous full-width banner pattern. Colour-coded but not
 * the only signal (also has icon + label) so it stays legible for
 * colour-blind users (WCAG 2.2 AA — never colour alone).
 */
export default function DocStatusPill({
  status,
  label,
}: {
  status: DocStatus;
  label: string;
}) {
  const styles: Record<DocStatus, { dot: string; bg: string; text: string; icon: string }> =
    {
      draft: {
        dot: "bg-slate-400",
        bg: "bg-slate-50 border-slate-200",
        text: "text-slate-700",
        icon: "✏️",
      },
      review: {
        dot: "bg-amber-500",
        bg: "bg-amber-50 border-amber-200",
        text: "text-amber-800",
        icon: "🔒",
      },
      approved: {
        dot: "bg-emerald-500",
        bg: "bg-emerald-50 border-emerald-200",
        text: "text-emerald-800",
        icon: "✅",
      },
      archived: {
        dot: "bg-slate-300",
        bg: "bg-slate-50 border-slate-200",
        text: "text-slate-500",
        icon: "📦",
      },
    };
  const s = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span aria-hidden>{s.icon}</span>
      <span>{label}</span>
    </span>
  );
}
