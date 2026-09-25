import Link from "next/link";
import { and, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { Download } from "lucide-react";
import { getDb } from "@/db";
import { activities, assets, bookingLines, bookings, clients, invoices, payments, quotes, quoteVersions, tasks, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { capacityOf } from "@/lib/availability";
import { OPEN_STAGES, ROLE_LABEL, STAGES } from "@/lib/constants";
import { addDays, daysBetween, eachDay, fmtRange, fy, inr, inrShort, istDateTime, monthStart, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { outstandingSummary, paidSq } from "@/lib/queries";
import { BarList, Meter } from "@/components/charts";
import { Avatar, Card, CardHeader, Input, PageHeader, Stat, StatRow, Tabs, buttonClass, cn, table } from "@/components/ui";

export const metadata = { title: "Reports" };

const RANGES = [
  { key: "month", label: "This month" },
  { key: "90d", label: "Last 90 days" },
  { key: "fy", label: "This financial year" },
  { key: "all", label: "All time" },
] as const;

function resolveRange(key: string | undefined, from?: string, to?: string) {
  const t = today();
  if (from && to && from <= to) return { key: "custom", from, to };
  switch (key) {
    case "month":
      return { key, from: monthStart(t), to: t };
    case "fy":
      return { key, from: `${fy(t).slice(0, 4)}-04-01`, to: t };
    case "all":
      return { key, from: "2000-01-01", to: t };
    default:
      return { key: "90d", from: addDays(t, -89), to: t };
  }
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; range?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tabs = ["sales", "team", "screens", "money"] as const;
  const tab = tabs.find((x) => x === sp.tab) ?? "sales";
  const r = resolveRange(sp.range, sp.from, sp.to);
  const db = await getDb();
  const fromTs = istDateTime(r.from, "00:00");
  const toTs = istDateTime(addDays(r.to, 1), "00:00");
  const q = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ tab, range: r.key, ...(r.key === "custom" ? { from: r.from, to: r.to } : {}), ...patch });
    if (patch.range) {
      p.delete("from");
      p.delete("to");
    }
    return `/reports?${p}`;
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="How the business is doing — sales, team effort, screen occupancy and money."
        actions={
          <div className="flex flex-wrap gap-2">
            {can(user, "admin") && (
              <a href="/api/export/all" className={buttonClass("secondary")}>
                <Download /> Export all data
              </a>
            )}
          </div>
        }
      />
      <Tabs
        items={[
          { label: "Sales & pipeline", href: q({ tab: "sales" }), active: tab === "sales" },
          { label: "Team activity", href: q({ tab: "team" }), active: tab === "team" },
          { label: "Screens", href: q({ tab: "screens" }), active: tab === "screens" },
          { label: "Money", href: q({ tab: "money" }), active: tab === "money" },
        ]}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full bg-neutral-100 p-1">
          {RANGES.map((x) => (
            <Link key={x.key} href={q({ range: x.key })} className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", r.key === x.key ? "bg-white shadow-sm" : "text-neutral-600")}>
              {x.label}
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2">
          <input type="hidden" name="tab" value={tab} />
          <Input type="date" name="from" defaultValue={r.from === "2000-01-01" ? "" : r.from} className="h-9 w-40" />
          <span className="text-sm text-neutral-500">to</span>
          <Input type="date" name="to" defaultValue={r.to} className="h-9 w-40" />
          <button className={buttonClass("secondary", "sm")}>Apply</button>
        </form>
        <span className="ml-auto text-sm text-neutral-500">{r.key === "all" ? "All time" : fmtRange(r.from, r.to)}</span>
      </div>

      {tab === "sales" && <SalesReport from={r.from} to={r.to} fromTs={fromTs} toTs={toTs} />}
      {tab === "team" && <TeamReport fromTs={fromTs} toTs={toTs} />}
      {tab === "screens" && <ScreensReport from={r.key === "all" ? addDays(today(), -364) : r.from} to={r.to} />}
      {tab === "money" && <MoneyReport from={r.from} to={r.to} />}
    </div>
  );
}

async function SalesReport({ fromTs, toTs }: { from: string; to: string; fromTs: Date; toTs: Date }) {
  const db = await getDb();
  const [booked] = await db
    .select({ value: sql<number>`coalesce(sum(${bookings.total}),0)`, n: sql<number>`count(*)` })
    .from(bookings)
    .where(and(ne(bookings.status, "cancelled"), gte(bookings.createdAt, fromTs), lte(bookings.createdAt, toTs)));
  const [sent] = await db
    .select({ n: sql<number>`count(*)` })
    .from(quotes)
    .where(and(isNotNull(quotes.sentAt), gte(quotes.sentAt, fromTs), lte(quotes.sentAt, toTs)));
  const [decided] = await db
    .select({
      won: sql<number>`count(*) filter (where ${quotes.status} = 'accepted')`,
      lost: sql<number>`count(*) filter (where ${quotes.status} = 'rejected')`,
    })
    .from(quotes)
    .where(and(isNotNull(quotes.respondedAt), gte(quotes.respondedAt, fromTs), lte(quotes.respondedAt, toTs)));
  const winRate = decided!.won + decided!.lost ? Math.round((decided!.won / (decided!.won + decided!.lost)) * 100) : null;
  const [newLeads] = await db.select({ n: sql<number>`count(*)` }).from(clients).where(and(gte(clients.createdAt, fromTs), lte(clients.createdAt, toTs)));

  const stageCounts = await db.select({ stage: clients.stage, n: sql<number>`count(*)` }).from(clients).groupBy(clients.stage);
  const sources = await db
    .select({ source: clients.source, n: sql<number>`count(*)`, won: sql<number>`count(*) filter (where ${clients.stage} = 'won')` })
    .from(clients)
    .where(and(gte(clients.createdAt, fromTs), lte(clients.createdAt, toTs)))
    .groupBy(clients.source);
  const lost = await db
    .select({ reason: clients.lostReason, n: sql<number>`count(*)` })
    .from(clients)
    .where(eq(clients.stage, "lost"))
    .groupBy(clients.lostReason);

  const people = await db.select().from(users).where(inArray(users.role, ["owner", "sales_manager", "sales_exec"]));
  const quoteStats = await db
    .select({
      userId: quotes.createdBy,
      created: sql<number>`count(*)`,
      sent: sql<number>`count(*) filter (where ${quotes.sentAt} is not null)`,
      pipeline: sql<number>`coalesce(sum(${quoteVersions.total}) filter (where ${quotes.status} = 'sent'),0)`,
    })
    .from(quotes)
    .innerJoin(quoteVersions, and(eq(quoteVersions.quoteId, quotes.id), eq(quoteVersions.version, quotes.currentVersion)))
    .where(and(gte(quotes.createdAt, fromTs), lte(quotes.createdAt, toTs)))
    .groupBy(quotes.createdBy);
  const bookStats = await db
    .select({ userId: bookings.createdBy, n: sql<number>`count(*)`, value: sql<number>`coalesce(sum(${bookings.total}),0)` })
    .from(bookings)
    .where(and(ne(bookings.status, "cancelled"), gte(bookings.createdAt, fromTs), lte(bookings.createdAt, toTs)))
    .groupBy(bookings.createdBy);
  const perPerson = people
    .map((p) => {
      const qs = quoteStats.find((x) => x.userId === p.id);
      const bs = bookStats.find((x) => x.userId === p.id);
      return {
        p,
        created: qs?.created ?? 0,
        sent: qs?.sent ?? 0,
        pipeline: Number(qs?.pipeline ?? 0),
        won: bs?.n ?? 0,
        value: Number(bs?.value ?? 0),
      };
    })
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-5">
      <StatRow>
        <Stat label="Business booked" value={inrShort(Number(booked!.value))} hint={`${booked!.n} booking${booked!.n === 1 ? "" : "s"}`} />
        <Stat label="Quotes sent" value={sent!.n} />
        <Stat label="Win rate" value={winRate === null ? "—" : `${winRate}%`} hint={`${decided!.won} won, ${decided!.lost} lost`} />
        <Stat label="New leads" value={newLeads!.n} />
      </StatRow>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pipeline right now" description="Number of companies at each stage" />
          <div className="p-5">
            <BarList
              rows={STAGES.map((s) => ({ label: s.label, value: stageCounts.find((c) => c.stage === s.key)?.n ?? 0 }))}
              format={(n) => `${n}`}
            />
            <p className="mt-3 text-xs text-neutral-500">
              {stageCounts.filter((c) => OPEN_STAGES.includes(c.stage)).reduce((s, c) => s + c.n, 0)} open leads in total.
            </p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Where leads come from" description="Leads added in this period, by source" />
          <div className="p-5">
            <BarList
              rows={sources
                .map((s) => ({ label: s.source ?? "Not recorded", value: s.n, hint: `${s.won} won` }))
                .sort((a, b) => b.value - a.value)}
            />
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Sales by person" description="Quotes created and bookings confirmed in this period" />
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th className={table.th}>Person</th>
                <th className={cn(table.th, "text-right")}>Quotes made</th>
                <th className={cn(table.th, "text-right")}>Sent</th>
                <th className={cn(table.th, "text-right")}>Awaiting reply</th>
                <th className={cn(table.th, "text-right")}>Bookings</th>
                <th className={cn(table.th, "text-right")}>Booked value</th>
              </tr>
            </thead>
            <tbody>
              {perPerson.map(({ p, created, sent: s, pipeline, won, value }) => (
                <tr key={p.id} className={table.tr}>
                  <td className={table.td}>
                    <span className="flex items-center gap-2">
                      <Avatar name={p.name} size="sm" /> <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-neutral-400">{ROLE_LABEL[p.role]}</span>
                    </span>
                  </td>
                  <td className={cn(table.td, "text-right tabular-nums")}>{created}</td>
                  <td className={cn(table.td, "text-right tabular-nums")}>{s}</td>
                  <td className={cn(table.td, "text-right tabular-nums")}>{pipeline ? inr(pipeline) : "—"}</td>
                  <td className={cn(table.td, "text-right tabular-nums")}>{won}</td>
                  <td className={cn(table.td, "text-right font-semibold tabular-nums")}>{value ? inr(value) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title="Why deals are lost" description="All lost leads" />
        <div className="p-5">
          <BarList rows={lost.map((l) => ({ label: l.reason ?? "Not given", value: l.n })).sort((a, b) => b.value - a.value)} empty="No lost deals recorded" />
        </div>
      </Card>
    </div>
  );
}

async function TeamReport({ fromTs, toTs }: { fromTs: Date; toTs: Date }) {
  const db = await getDb();
  const people = await db.select().from(users).where(eq(users.active, true));
  const acts = await db
    .select({ userId: activities.userId, type: activities.type, n: sql<number>`count(*)` })
    .from(activities)
    .where(and(gte(activities.occurredAt, fromTs), lte(activities.occurredAt, toTs), ne(activities.type, "system")))
    .groupBy(activities.userId, activities.type);
  const now = new Date();
  const taskStats = await db
    .select({
      userId: tasks.assignedTo,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done' and ${tasks.completedAt} >= ${fromTs.getTime()} and ${tasks.completedAt} < ${toTs.getTime()})`,
      overdue: sql<number>`count(*) filter (where ${tasks.status} = 'open' and ${tasks.dueAt} < ${now.getTime()})`,
    })
    .from(tasks)
    .groupBy(tasks.assignedTo);
  const rows = people
    .map((p) => {
      const g = (k: string) => acts.find((a) => a.userId === p.id && a.type === k)?.n ?? 0;
      const ts = taskStats.find((x) => x.userId === p.id);
      const row = { p, call: g("call"), whatsapp: g("whatsapp"), email: g("email"), meeting: g("meeting"), note: g("note"), done: ts?.done ?? 0, overdue: ts?.overdue ?? 0 };
      return { ...row, total: row.call + row.whatsapp + row.email + row.meeting };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Client conversations logged" description="Calls, WhatsApp messages, emails and meetings recorded in this period" />
        <div className="p-5">
          <BarList rows={rows.filter((x) => x.total > 0 || x.p.role.startsWith("sales")).map((x) => ({ label: x.p.name, value: x.total }))} format={(n) => `${n} conversations`} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Breakdown by person" />
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th className={table.th}>Person</th>
                {["Calls", "WhatsApp", "Email", "Meetings", "Notes", "Tasks done", "Overdue now"].map((h) => (
                  <th key={h} className={cn(table.th, "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.p.id} className={table.tr}>
                  <td className={table.td}>
                    <span className="flex items-center gap-2">
                      <Avatar name={x.p.name} size="sm" /> <span className="font-medium">{x.p.name}</span>
                      <span className="text-xs text-neutral-400">{ROLE_LABEL[x.p.role]}</span>
                    </span>
                  </td>
                  {[x.call, x.whatsapp, x.email, x.meeting, x.note, x.done].map((n, i) => (
                    <td key={i} className={cn(table.td, "text-right tabular-nums")}>
                      {n}
                    </td>
                  ))}
                  <td className={cn(table.td, "text-right tabular-nums", x.overdue > 0 && "font-semibold text-red-600")}>{x.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

async function ScreensReport({ from, to }: { from: string; to: string }) {
  const db = await getDb();
  const list = await db.select().from(assets).where(ne(assets.status, "inactive"));
  const lines = await db
    .select({ l: bookingLines })
    .from(bookingLines)
    .innerJoin(bookings, eq(bookings.id, bookingLines.bookingId))
    .where(and(eq(bookingLines.kind, "media"), ne(bookings.status, "cancelled"), lte(bookingLines.startDate, to), gte(bookingLines.endDate, from)));
  const days = eachDay(from, to);
  const months = days.length / 30;
  const rows = list
    .map((a) => {
      const cap = capacityOf(a);
      const used = new Map<string, number>();
      let revenue = 0;
      for (const { l } of lines) {
        if (l.assetId !== a.id || !l.startDate || !l.endDate) continue;
        const s = l.startDate > from ? l.startDate : from;
        const e = l.endDate < to ? l.endDate : to;
        revenue += Math.round((l.amount * daysBetween(s, e)) / daysBetween(l.startDate, l.endDate));
        const units = l.mode === "slots" ? Math.min(cap, l.slots ?? 1) : cap;
        for (const d of eachDay(s, e)) used.set(d, Math.min(cap, (used.get(d) ?? 0) + units));
      }
      const occupancy = (100 * [...used.values()].reduce((s2, v) => s2 + v, 0)) / (cap * days.length);
      const cost = Math.round((a.rentMonthly ?? 0) * months);
      return { a, occupancy, revenue, cost, margin: revenue - cost };
    })
    .sort((x, y) => y.revenue - x.revenue);
  const avgOcc = rows.length ? rows.reduce((s, x) => s + x.occupancy, 0) / rows.length : 0;
  const totalRev = rows.reduce((s, x) => s + x.revenue, 0);
  const totalCost = rows.reduce((s, x) => s + x.cost, 0);
  const idle = rows.filter((x) => x.occupancy < 1).length;

  return (
    <div className="space-y-5">
      <StatRow>
        <Stat label="Average occupancy" value={`${Math.round(avgOcc)}%`} hint="Share of sellable screen-time sold" />
        <Stat label="Screen revenue" value={inrShort(totalRev)} hint="Pro-rated to this period, before GST" />
        <Stat label="Site costs" value={inrShort(totalCost)} hint="Rent and buying costs" />
        <Stat label="Idle screens" value={idle} hint="Nothing sold in this period" tone={idle ? "amber" : undefined} />
      </StatRow>
      <Card>
        <CardHeader title="Screen by screen" description={`${fmtRange(from, to)}, for LED screens, occupancy counts slots sold`} />
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th className={table.th}>Screen</th>
                <th className={cn(table.th, "w-56")}>Occupancy</th>
                <th className={cn(table.th, "text-right")}>Revenue</th>
                <th className={cn(table.th, "text-right")}>Site cost</th>
                <th className={cn(table.th, "text-right")}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, occupancy, revenue, cost, margin }) => (
                <tr key={a.id} className={table.tr}>
                  <td className={table.td}>
                    <Link href={`/screens/${a.id}`} className="font-medium text-neutral-900 hover:underline">
                      {a.name}
                    </Link>
                    <p className="text-xs text-neutral-500">
                      {a.type === "led" ? "LED" : "Hoarding"}, {a.area}
                    </p>
                  </td>
                  <td className={table.td}>
                    <div className="flex items-center gap-2">
                      <Meter pct={occupancy} />
                      <span className="w-10 text-right text-xs font-medium tabular-nums">{Math.round(occupancy)}%</span>
                    </div>
                  </td>
                  <td className={cn(table.td, "text-right tabular-nums")}>{inr(revenue)}</td>
                  <td className={cn(table.td, "text-right tabular-nums text-neutral-600")}>{cost ? inr(cost) : "—"}</td>
                  <td className={cn(table.td, "text-right font-medium tabular-nums", margin < 0 && "text-red-600")}>{inr(margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

async function MoneyReport({ from, to }: { from: string; to: string }) {
  const db = await getDb();
  const [inv] = await db
    .select({ total: sql<number>`coalesce(sum(${invoices.total}),0)`, gst: sql<number>`coalesce(sum(${invoices.cgst} + ${invoices.sgst} + ${invoices.igst}),0)` })
    .from(invoices)
    .where(and(eq(invoices.kind, "tax"), inArray(invoices.status, ["issued", "partial", "paid"]), gte(invoices.issueDate, from), lte(invoices.issueDate, to)));
  const [pay] = await db
    .select({ amount: sql<number>`coalesce(sum(${payments.amount}),0)`, tds: sql<number>`coalesce(sum(${payments.tds}),0)` })
    .from(payments)
    .where(and(gte(payments.date, from), lte(payments.date, to)));
  const out = await outstandingSummary(db);
  const p = paidSq(db);
  const byClient = await db
    .select({
      id: clients.id,
      name: clients.name,
      balance: sql<number>`sum(${invoices.total} - coalesce(${p.paid},0))`,
      overdue: sql<number>`sum(case when ${invoices.dueDate} < ${today()} then ${invoices.total} - coalesce(${p.paid},0) else 0 end)`,
      oldest: sql<string>`min(${invoices.dueDate})`,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .leftJoin(p, eq(p.invoiceId, invoices.id))
    .where(inArray(invoices.status, ["issued", "partial"]))
    .groupBy(clients.id, clients.name);
  const monthly = await db
    .select({ m: sql<string>`substr(${payments.date}, 1, 7)`, amount: sql<number>`sum(${payments.amount})` })
    .from(payments)
    .where(and(gte(payments.date, from), lte(payments.date, to)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return (
    <div className="space-y-5">
      <StatRow>
        <Stat label="Invoiced" value={inrShort(Number(inv!.total))} hint={`incl. ${inrShort(Number(inv!.gst))} GST`} />
        <Stat label="Collected" value={inrShort(Number(pay!.amount))} tone="green" />
        <Stat label="TDS deducted by clients" value={inrShort(Number(pay!.tds))} hint="Collect TDS certificates" />
        <Stat label="Outstanding today" value={inrShort(out.outstanding)} hint={`${inrShort(out.overdue)} overdue`} tone={out.overdue ? "red" : undefined} href="/invoices?tab=overdue" />
      </StatRow>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Collections by month" />
          <div className="p-5">
            <BarList
              rows={monthly.map((x) => ({
                label: new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${x.m}-01T00:00:00Z`)),
                value: Number(x.amount),
              }))}
              format={inrShort}
              empty="No payments in this period"
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Who owes what" description="Unpaid invoices by client, largest first" />
          {byClient.length === 0 ? (
            <p className="px-5 py-6 text-sm text-neutral-500">Nothing outstanding.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {byClient
                .sort((a, b) => Number(b.balance) - Number(a.balance))
                .map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <Link href={`/clients/${c.id}?tab=invoices`} className="font-medium text-neutral-900 hover:underline">
                        {c.name}
                      </Link>
                      {Number(c.overdue) > 0 && <p className="text-xs font-medium text-red-600">{inr(Number(c.overdue))} overdue</p>}
                    </div>
                    <span className="font-semibold tabular-nums">{inr(Number(c.balance))}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href="/api/export/invoices" className={buttonClass("secondary")}>
          <Download /> Invoices (Excel)
        </a>
        <a href="/api/export/payments" className={buttonClass("secondary")}>
          <Download /> Payments (Excel)
        </a>
      </div>
    </div>
  );
}
