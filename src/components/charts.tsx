import { cn } from "./ui";

/** Single-series horizontal bars: one hue, value at the tip, native hover tooltip. */
export function BarList({
  rows,
  format = (n) => String(n),
  empty = "No data for this period",
}: {
  rows: { label: string; value: number; hint?: string }[];
  format?: (n: number) => string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0 || rows.every((r) => r.value === 0)) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm" title={`${r.label}: ${format(r.value)}${r.hint ? ` · ${r.hint}` : ""}`}>
          <span className="truncate text-slate-600">{r.label}</span>
          <span className="flex items-center gap-2">
            <span className="h-3 rounded-r-[4px] bg-brand-600 transition-[width]" style={{ width: `${Math.max(r.value > 0 ? 1.5 : 0, (r.value / max) * 85)}%` }} />
            <span className="text-xs font-medium whitespace-nowrap text-slate-700 tabular-nums">{format(r.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A ratio against 100%: filled part in the accent, the track a lighter step of the same hue. */
export function Meter({ pct, className }: { pct: number; className?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <span className={cn("block h-2 w-full overflow-hidden rounded-full bg-brand-100", className)} title={`${Math.round(p)}%`}>
      <span className="block h-full rounded-full bg-brand-600" style={{ width: `${p}%` }} />
    </span>
  );
}
