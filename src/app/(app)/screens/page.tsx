import Link from "next/link";
import { and, asc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { CalendarSearch, MonitorPlay, Upload } from "lucide-react";
import { getDb } from "@/db";
import { assetPhotos, assets, maintenanceTickets } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { loadAvailability } from "@/lib/availability";
import { ASSET_STATUS, ASSET_TYPE_LABEL } from "@/lib/constants";
import { fmtDay, fmtRange, num, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ScreensNav, priceSummary, saleSummary, sizeSummary } from "@/components/screens-nav";
import { Badge, Card, EmptyState, Input, LinkButton, PageHeader, Select, buttonClass, cn } from "@/components/ui";

export const metadata = { title: "Screens" };

export default async function ScreensPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string; from?: string; to?: string; area?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const t = today();
  const checking = !!(sp.from && sp.to && sp.to >= sp.from);
  const from = checking ? sp.from! : t;
  const to = checking ? sp.to! : t;

  const where = [];
  if (sp.q) where.push(or(ilike(assets.name, `%${sp.q}%`), ilike(assets.code, `%${sp.q}%`), ilike(assets.area, `%${sp.q}%`))!);
  if (sp.type === "led" || sp.type === "hoarding") where.push(eq(assets.type, sp.type));
  if (sp.status && sp.status in ASSET_STATUS) where.push(eq(assets.status, sp.status as "active"));
  else where.push(ne(assets.status, "inactive"));
  if (sp.area) where.push(eq(assets.area, sp.area));

  const rows = await db.select().from(assets).where(and(...where)).orderBy(asc(assets.code));
  const photos = await db
    .select({ assetId: assetPhotos.assetId, url: sql<string>`min(${assetPhotos.url})` })
    .from(assetPhotos)
    .where(eq(assetPhotos.kind, "day"))
    .groupBy(assetPhotos.assetId);
  const photoOf = new Map(photos.map((p) => [p.assetId, p.url]));
  const avail = await loadAvailability(db, rows.map((r) => r.id), from, to);
  const areas = (await db.selectDistinct({ area: assets.area }).from(assets).orderBy(asc(assets.area))).map((a) => a.area).filter(Boolean) as string[];
  const [{ maint }] = await db
    .select({ maint: sql<number>`count(*)::int` })
    .from(maintenanceTickets)
    .where(ne(maintenanceTickets.status, "resolved"));

  const cards = rows.map((a) => {
    const av = avail.get(a.id)!;
    let label: string;
    let tone: "green" | "amber" | "red" | "blue" | "gray";
    if (a.status === "maintenance") {
      label = "Under maintenance";
      tone = "gray";
    } else if (av.freeMin === av.capacity && av.freeMinWithHolds === av.capacity) {
      label = checking ? "Free for these dates" : "Free today";
      tone = "green";
    } else if (av.freeMin === 0) {
      const b = av.bookings[0];
      label = b ? `Booked · ${b.clientName} till ${fmtDay(b.endDate, { year: false })}` : "Booked";
      tone = "red";
    } else if (av.freeMin < av.capacity) {
      label = `${av.freeMin} of ${av.capacity} slots free`;
      tone = "blue";
    } else {
      const h = av.holds[0];
      label = `On hold${h ? ` for ${h.clientName}` : ""}`;
      tone = "amber";
    }
    return { a, label, tone, freeCount: av.freeMin };
  });
  const freeCount = cards.filter((c) => c.tone === "green" || c.tone === "blue" || c.tone === "amber").length;

  return (
    <div>
      <PageHeader
        title="Screens"
        subtitle="All LED screens and hoardings, with live availability."
        actions={
          can(user, "inventory") && (
            <>
              <LinkButton href="/screens/import" variant="secondary">
                <Upload /> Import
              </LinkButton>
              <LinkButton href="/screens/new">Add screen</LinkButton>
            </>
          )
        }
      />
      <ScreensNav active="list" counts={{ maintenance: maint }} />

      <Card className="mb-5 p-4">
        <form className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto_auto] md:items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Search</label>
            <Input name="q" defaultValue={sp.q} placeholder="Name, code or area" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
            <Select name="type" defaultValue={sp.type ?? ""}>
              <option value="">All types</option>
              <option value="led">LED screens</option>
              <option value="hoarding">Hoardings</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Area</label>
            <Select name="area" defaultValue={sp.area ?? ""}>
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Free from</label>
            <Input type="date" name="from" defaultValue={sp.from ?? ""} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">to</label>
            <Input type="date" name="to" defaultValue={sp.to ?? ""} />
          </div>
          <button className={buttonClass("primary")}>
            <CalendarSearch /> Check
          </button>
        </form>
        <p className="mt-3 text-sm text-slate-500">
          {checking ? (
            <>
              <b className="text-slate-800">{freeCount}</b> of {cards.length} screens have space {fmtRange(from, to)}.{" "}
              <Link href="/screens" className="text-brand-700 hover:underline">
                Clear dates
              </Link>
            </>
          ) : (
            <>Pick dates to see which screens are free for a campaign.</>
          )}
        </p>
      </Card>

      {cards.length === 0 ? (
        <Card>
          <EmptyState icon={<MonitorPlay />} title="No screens match" />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {cards.map(({ a, label, tone }) => (
            <Link key={a.id} href={`/screens/${a.id}`} className="group">
              <Card className="h-full overflow-hidden transition hover:border-brand-300 hover:shadow-md">
                <div className="relative aspect-[16/10] bg-slate-100">
                  {photoOf.get(a.id) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoOf.get(a.id)} alt={a.name} className="h-full w-full object-cover" loading="lazy" />
                  )}
                  <span className="absolute top-2 left-2">
                    <Badge tone={a.type === "led" ? "purple" : "teal"} className="bg-white/95">
                      {ASSET_TYPE_LABEL[a.type]}
                    </Badge>
                  </span>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-slate-900 group-hover:text-brand-700">{a.name}</p>
                  <p className="text-xs text-slate-500">
                    {a.code} · {a.area}, {a.city}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">{[sizeSummary(a), saleSummary(a)].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">{priceSummary(a)}</p>
                  {a.dailyTraffic && <p className="text-xs text-slate-500">~{num(a.dailyTraffic)} people pass daily</p>}
                  <div className="mt-3">
                    <Badge tone={tone} dot>
                      {label}
                    </Badge>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {checking && can(user, "sales") && (
        <p className="mt-6 text-center text-sm text-slate-500">
          Found what you need?{" "}
          <Link href={`/quotes/new?from=${from}&to=${to}`} className={cn("font-medium text-brand-700 hover:underline")}>
            Start a quote for {fmtRange(from, to)} →
          </Link>
        </p>
      )}
    </div>
  );
}
