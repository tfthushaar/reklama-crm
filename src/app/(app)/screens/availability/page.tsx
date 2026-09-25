import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { loadAvailability } from "@/lib/availability";
import { addDays, fmtRange, today } from "@/lib/format";
import { ScreensNav } from "@/components/screens-nav";
import { Legend, cellClass, cellTitle } from "@/components/availability-strip";
import { Card, PageHeader, buttonClass, cn } from "@/components/ui";

export const metadata = { title: "Availability" };

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ start?: string; type?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const t = today();
  const start = sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : t;
  const days = 35;
  const end = addDays(start, days - 1);
  const db = await getDb();

  const where = [ne(assets.status, "inactive")];
  if (sp.type === "led" || sp.type === "hoarding") where.push(eq(assets.type, sp.type));
  const rows = await db.select().from(assets).where(and(...where)).orderBy(asc(assets.type), asc(assets.code));
  const avail = await loadAvailability(db, rows.map((r) => r.id), start, end);
  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));
  const q = (s: string, ty = sp.type) => `/screens/availability?start=${s}${ty ? `&type=${ty}` : ""}`;

  return (
    <div>
      <PageHeader title="Screens" subtitle="See every screen's bookings, holds and free days at a glance." />
      <ScreensNav active="availability" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link href={q(addDays(start, -14))} className={buttonClass("secondary", "sm")} aria-label="Earlier">
            <ChevronLeft />
          </Link>
          <Link href={q(t)} className={buttonClass("secondary", "sm")}>
            Today
          </Link>
          <Link href={q(addDays(start, 14))} className={buttonClass("secondary", "sm")} aria-label="Later">
            <ChevronRight />
          </Link>
        </div>
        <p className="text-sm font-medium text-slate-700">{fmtRange(start, end)}</p>
        <div className="ml-auto flex gap-1 rounded-lg bg-slate-100 p-1">
          {[
            ["", "All"],
            ["led", "LED"],
            ["hoarding", "Hoardings"],
          ].map(([k, l]) => (
            <Link
              key={k}
              href={q(start, k || undefined)}
              className={cn("rounded-md px-3 py-1 text-sm font-medium", (sp.type ?? "") === k ? "bg-white shadow-sm" : "text-slate-600")}
            >
              {l}
            </Link>
          ))}
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-56 border-b border-slate-200 bg-white px-4 py-2 text-left font-medium text-slate-500">Screen</th>
                {dayList.map((d) => {
                  const date = new Date(`${d}T00:00:00Z`);
                  const wk = new Intl.DateTimeFormat("en-IN", { weekday: "narrow", timeZone: "UTC" }).format(date);
                  const first = d.endsWith("-01") || d === start;
                  return (
                    <th key={d} className={cn("border-b border-slate-200 px-0 py-1 text-center font-normal", d === t && "bg-accent-500/10")}>
                      <div className="h-3 text-[10px] font-semibold text-slate-600">
                        {first ? new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(date) : ""}
                      </div>
                      <div className={cn("text-[11px]", d === t ? "font-bold text-accent-600" : "text-slate-700")}>{Number(d.slice(8))}</div>
                      <div className="text-[10px] text-slate-400">{wk}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const av = avail.get(a.id)!;
                return (
                  <tr key={a.id} className="group">
                    <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-1.5 group-hover:bg-slate-50">
                      <Link href={`/screens/${a.id}`} className="block text-[13px] font-medium text-slate-800 hover:text-brand-700">
                        {a.name}
                      </Link>
                      <span className="text-[11px] text-slate-500">
                        {a.type === "led" ? `LED · ${av.capacity} slots` : "Hoarding"} · {a.area}
                      </span>
                    </td>
                    {dayList.map((d) => {
                      const v = av.byDay.get(d)!;
                      return (
                        <td key={d} className={cn("border-b border-slate-100 px-[1.5px] py-1.5", d === t && "bg-accent-500/10")}>
                          <div
                            title={cellTitle(d, v.used, v.held, av.capacity)}
                            className={cn("flex h-7 w-6 items-end justify-center rounded-[3px] pb-0.5", cellClass(v.used, v.held, av.capacity, a.status === "maintenance"))}
                          >
                            {av.capacity > 1 && v.used > 0 && v.used < av.capacity && (
                              <span className="text-[8px] leading-none font-semibold text-brand-900">{av.capacity - v.used}</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <Legend slots />
          <p className="text-xs text-slate-500">Numbers show slots still free on LED screens. Hover a day for details.</p>
        </div>
      </Card>
    </div>
  );
}
