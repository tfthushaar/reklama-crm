import Link from "next/link";
import { and, asc, eq, like, ne, or, sql } from "drizzle-orm";
import { MonitorPlay, Upload } from "lucide-react";
import { getDb } from "@/db";
import { assetPhotos, assets, maintenanceTickets } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { loadAvailability } from "@/lib/availability";
import { ASSET_STATUS, ASSET_TYPE_LABEL } from "@/lib/constants";
import { fmtDay, fmtRange, inr, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ScreensNav } from "@/components/screens-nav";
import { Card, EmptyState, Input, LinkButton, PageHeader, Select, StatusDot, buttonClass, cn } from "@/components/ui";

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
  if (sp.q) where.push(or(like(assets.name, `%${sp.q}%`), like(assets.code, `%${sp.q}%`), like(assets.area, `%${sp.q}%`))!);
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
    .select({ maint: sql<number>`count(*)` })
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
      label = b ? `Booked until ${fmtDay(b.endDate, { year: false })}` : "Booked";
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

      <form className="mb-8 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Search screens" className="h-9 w-full rounded-full sm:w-56" />
        <Select name="type" defaultValue={sp.type ?? ""} className="h-9 w-auto rounded-full">
          <option value="">All types</option>
          <option value="led">LED screens</option>
          <option value="hoarding">Hoardings</option>
        </Select>
        <Select name="area" defaultValue={sp.area ?? ""} className="h-9 w-auto rounded-full">
          <option value="">All areas</option>
          {areas.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
        <span className="ml-auto flex flex-wrap items-center gap-2 text-[13px] text-neutral-500">
          Free between
          <Input type="date" name="from" defaultValue={sp.from ?? ""} className="h-9 w-auto rounded-full" aria-label="From" />
          and
          <Input type="date" name="to" defaultValue={sp.to ?? ""} className="h-9 w-auto rounded-full" aria-label="To" />
          <button className={buttonClass("primary")}>Check</button>
        </span>
      </form>
      {checking && (
        <p className="-mt-4 mb-6 text-sm text-neutral-600">
          {freeCount} of {cards.length} screens have space {fmtRange(from, to)}.{" "}
          <Link href="/screens" className="text-neutral-900 underline underline-offset-2">
            Clear dates
          </Link>
        </p>
      )}

      {cards.length === 0 ? (
        <Card>
          <EmptyState icon={<MonitorPlay />} title="No screens match" text="Try another area or clear the filters." />
        </Card>
      ) : (
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ a, label, tone }) => (
            <Link key={a.id} href={`/screens/${a.id}`} className="group">
              <div className="aspect-[16/10] overflow-hidden rounded-2xl bg-neutral-100">
                {photoOf.get(a.id) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoOf.get(a.id)} alt={a.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" loading="lazy" />
                )}
              </div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-neutral-900">{a.name}</p>
                  <p className="text-[13px] text-neutral-500">
                    {ASSET_TYPE_LABEL[a.type]}, {a.area}
                  </p>
                </div>
                <p className="shrink-0 text-right text-[13px] text-neutral-900">
                  {a.type === "led" && a.saleMode !== "exclusive" && a.slotRate ? (
                    <>
                      {inr(a.slotRate)}
                      <span className="block text-neutral-500">per slot, month</span>
                    </>
                  ) : (
                    <>
                      {inr(a.monthlyRate)}
                      <span className="block text-neutral-500">per month</span>
                    </>
                  )}
                </p>
              </div>
              <p className={cn("mt-2 inline-flex items-center gap-2 text-[13px]", tone === "red" ? "text-neutral-500" : "text-neutral-700")}>
                <StatusDot state={tone === "green" ? "on" : tone === "red" ? "off" : tone === "gray" ? "problem" : "pending"} />
                {label}
              </p>
            </Link>
          ))}
        </div>
      )}
      {checking && can(user, "sales") && (
        <p className="mt-6 text-center text-sm text-neutral-500">
          Found what you need?{" "}
          <Link href={`/quotes/new?from=${from}&to=${to}`} className="font-medium text-neutral-900 underline underline-offset-2">
            Start a quote for {fmtRange(from, to)}
          </Link>
        </p>
      )}
    </div>
  );
}
