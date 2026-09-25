import type { AssetAvailability } from "@/lib/availability";
import { fmtDay } from "@/lib/format";
import { cn } from "./ui";

export function cellClass(used: number, held: number, capacity: number, maintenance = false) {
  if (maintenance) return "bg-neutral-200 bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgba(255,255,255,.9)_3px_5px)]";
  if (used >= capacity) return "bg-neutral-900";
  if (used > 0) {
    const f = used / capacity;
    return f > 0.66 ? "bg-neutral-500" : f > 0.33 ? "bg-neutral-400" : "bg-neutral-300";
  }
  if (held > 0) return "bg-white ring-1 ring-inset ring-neutral-300 bg-[repeating-linear-gradient(135deg,#171717_0_1px,transparent_1px_5px)]";
  return "bg-neutral-100";
}

export function cellTitle(day: string, used: number, held: number, capacity: number) {
  const d = fmtDay(day);
  if (capacity === 1) return `${d}: ${used ? "Booked" : held ? "On hold" : "Free"}`;
  return `${d}: ${used}/${capacity} slots sold${held ? `, ${held} on hold` : ""}`;
}

export function Legend({ slots }: { slots?: boolean }) {
  const item = (cls: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", cls)} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
      {item("bg-neutral-100 ring-1 ring-neutral-200", "Free")}
      {slots && item("bg-neutral-400", "Some slots sold")}
      {item("bg-neutral-900", "Fully booked")}
      {item(cellClass(0, 1, 1), "On hold (quote sent)")}
      {item(cellClass(0, 0, 1, true), "Maintenance")}
    </div>
  );
}

export function AvailabilityStrip({ av, maintenance }: { av: AssetAvailability; maintenance?: boolean }) {
  const days = [...av.byDay.entries()];
  const months: { label: string; span: number }[] = [];
  for (const [d] of days) {
    const label = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
    if (months.at(-1)?.label === label) months.at(-1)!.span++;
    else months.push({ label, span: 1 });
  }
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div className="inline-grid gap-y-1" style={{ gridTemplateColumns: `repeat(${days.length}, 14px)`, columnGap: "2px" }}>
        {months.map((m, i) => (
          <span key={i} className="text-[11px] font-medium text-neutral-500" style={{ gridColumn: `span ${m.span}` }}>
            {m.span > 2 ? m.label : ""}
          </span>
        ))}
        {days.map(([d, v]) => (
          <span key={d} title={cellTitle(d, v.used, v.held, av.capacity)} className={cn("h-7 rounded-[3px]", cellClass(v.used, v.held, av.capacity, maintenance))} />
        ))}
        {days.map(([d]) => (
          <span key={`l${d}`} className="text-center text-[9px] text-neutral-400">
            {Number(d.slice(8)) % 5 === 0 || d.endsWith("-01") ? Number(d.slice(8)) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
