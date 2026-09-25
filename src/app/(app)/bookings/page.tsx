import Link from "next/link";
import { and, asc, desc, eq, like, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { CalendarCheck } from "lucide-react";
import { getDb } from "@/db";
import { assets, bookingLines, bookings, clients, invoices } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { BOOKING_STATUS } from "@/lib/constants";
import { daysBetween, fmtRange, inr, today } from "@/lib/format";
import { paidSq } from "@/lib/queries";
import { Badge, Card, EmptyState, PageHeader, Tabs, cn, table } from "@/components/ui";

export const metadata = { title: "Bookings" };

const TABS = [
  { key: "upcoming", label: "Upcoming", statuses: ["confirmed", "creative_received", "creative_approved"] },
  { key: "live", label: "Live now", statuses: ["live"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
  { key: "all", label: "All", statuses: null },
] as const;
type BStatus = (typeof bookings.$inferSelect)["status"];

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const tab = TABS.find((x) => x.key === sp.tab) ?? TABS[0];
  const db = await getDb();
  const t = today();

  const where: SQL[] = [];
  if (tab.statuses) where.push(inArray(bookings.status, tab.statuses as unknown as BStatus[]));
  if (sp.q) where.push(or(like(bookings.title, `%${sp.q}%`), like(bookings.number, `%${sp.q}%`), like(clients.name, `%${sp.q}%`))!);

  const p = paidSq(db);
  const billing = db
    .select({
      bookingId: invoices.bookingId,
      billed: sql<number>`sum(${invoices.total})`.as("billed"),
      paid: sql<number>`coalesce(sum(${p.paid}),0)`.as("paidsum"),
    })
    .from(invoices)
    .leftJoin(p, eq(p.invoiceId, invoices.id))
    .where(and(ne(invoices.status, "cancelled"), ne(invoices.status, "draft")))
    .groupBy(invoices.bookingId)
    .as("bill");

  const rows = await db
    .select({ b: bookings, client: clients.name, billed: billing.billed, paid: billing.paid })
    .from(bookings)
    .innerJoin(clients, eq(clients.id, bookings.clientId))
    .leftJoin(billing, eq(billing.bookingId, bookings.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(tab.key === "completed" || tab.key === "cancelled" || tab.key === "all" ? desc(bookings.startDate) : asc(bookings.startDate));

  const screenRows = rows.length
    ? await db
        .select({ bookingId: bookingLines.bookingId, name: assets.name })
        .from(bookingLines)
        .innerJoin(assets, eq(assets.id, bookingLines.assetId))
        .where(inArray(bookingLines.bookingId, rows.map((r) => r.b.id)))
    : [];
  const counts = await db.select({ status: bookings.status, n: sql<number>`count(*)` }).from(bookings).groupBy(bookings.status);
  const countFor = (st: readonly string[] | null) => counts.filter((c) => !st || st.includes(c.status)).reduce((s, c) => s + c.n, 0);

  return (
    <div>
      <PageHeader title="Bookings" subtitle="Confirmed campaigns — from creative to live to proof of display." />
      <Tabs items={TABS.map((x) => ({ label: x.label, href: `/bookings?tab=${x.key}`, active: tab.key === x.key, count: countFor(x.statuses) }))} />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<CalendarCheck />} title="No bookings here" text="Bookings are created when a client accepts a quote." />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>Campaign</th>
                  <th className={table.th}>Screens</th>
                  <th className={table.th}>Dates</th>
                  <th className={table.th}>Status</th>
                  <th className={table.th}>Billing</th>
                  <th className={cn(table.th, "text-right")}>Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ b, client, billed, paid }) => {
                  const screens = screenRows.filter((s) => s.bookingId === b.id).map((s) => s.name);
                  const startsIn = b.startDate > t ? daysBetween(t, b.startDate) - 1 : null;
                  const endsIn = b.endDate >= t && b.startDate <= t ? daysBetween(t, b.endDate) - 1 : null;
                  const billedN = Number(billed ?? 0);
                  const paidN = Number(paid ?? 0);
                  return (
                    <tr key={b.id} className={table.tr}>
                      <td className={table.td}>
                        <Link href={`/bookings/${b.id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">
                          {b.title}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {client} · {b.number}
                        </p>
                      </td>
                      <td className={cn(table.td, "max-w-56 text-slate-600")}>
                        <p className="truncate" title={screens.join(", ")}>
                          {screens.join(", ")}
                        </p>
                      </td>
                      <td className={cn(table.td, "whitespace-nowrap")}>
                        {fmtRange(b.startDate, b.endDate)}
                        <p className="text-xs text-slate-500">
                          {b.status === "cancelled"
                            ? ""
                            : startsIn !== null
                              ? startsIn === 1
                                ? "starts tomorrow"
                                : `starts in ${startsIn} days`
                              : endsIn !== null
                                ? endsIn === 0
                                  ? "ends today"
                                  : `${endsIn} days left`
                                : "ended"}
                        </p>
                      </td>
                      <td className={table.td}>
                        <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
                      </td>
                      <td className={table.td}>
                        {b.status === "cancelled" ? (
                          "—"
                        ) : billedN === 0 ? (
                          <span className="text-xs font-medium text-amber-700">Not billed</span>
                        ) : paidN >= billedN - 100 ? (
                          <span className="text-xs font-medium text-emerald-700">Paid</span>
                        ) : (
                          <span className="text-xs text-slate-600">
                            {inr(billedN - paidN)} <span className="text-slate-400">due</span>
                          </span>
                        )}
                      </td>
                      <td className={cn(table.td, "text-right font-medium tabular-nums")}>{inr(b.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
