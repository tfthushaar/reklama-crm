import Link from "next/link";
import { and, asc, eq, gt, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { getDb } from "@/db";
import { assets, bookings, clients, holds, quoteVersions, quotes, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { BOOKING_STATUS, OPEN_STAGES } from "@/lib/constants";
import { addDays, fmtDay, inr, inrShort, istDateTime, monthStart, relTime, today, TZ } from "@/lib/format";
import { can } from "@/lib/permissions";
import { collectedBetween, occupancyOn, outstandingSummary } from "@/lib/queries";
import { Badge, Card, CardHeader, EmptyState, LinkButton, Stat, StatRow, StatusDot } from "@/components/ui";
import { NewTaskButton, TaskRow, type TaskView } from "@/components/tasks";

export const metadata = { title: "Home" };

type Attention = { text: React.ReactNode; href: string; state: "problem" | "on" | "pending" };

export default async function HomePage() {
  const user = await requireUser();
  const db = await getDb();
  const t = today();
  const isManager = can(user, "team");
  const isSales = can(user, "sales");
  const isFinance = can(user, "finance");
  const isOps = user.role === "operations" || user.role === "owner";

  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: TZ }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateLine = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date());

  // ---------- today's tasks ----------
  const endOfToday = istDateTime(addDays(t, 1), "00:00");
  const myTasks: TaskView[] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      priority: tasks.priority,
      status: tasks.status,
      outcome: tasks.outcome,
      clientId: tasks.clientId,
      clientName: clients.name,
      refType: tasks.refType,
      refId: tasks.refId,
    })
    .from(tasks)
    .leftJoin(clients, eq(clients.id, tasks.clientId))
    .where(and(eq(tasks.assignedTo, user.id), eq(tasks.status, "open"), lte(tasks.dueAt, endOfToday)))
    .orderBy(asc(tasks.dueAt))
    .limit(6);

  // ---------- headline figures ----------
  let stats: React.ReactNode;
  if (isFinance || isManager) {
    const [collected, out, occ] = await Promise.all([collectedBetween(db, monthStart(t), t), outstandingSummary(db), occupancyOn(db)]);
    const [{ pipeline, openQuotes }] = await db
      .select({ pipeline: sql<number>`coalesce(sum(${quoteVersions.total}),0)`, openQuotes: sql<number>`count(*)` })
      .from(quotes)
      .innerJoin(quoteVersions, and(eq(quoteVersions.quoteId, quotes.id), eq(quoteVersions.version, quotes.currentVersion)))
      .where(eq(quotes.status, "sent"));
    stats = (
      <StatRow>
        <Stat label="Collected this month" value={inrShort(collected)} href="/invoices?tab=paid" />
        <Stat
          label="Outstanding"
          value={inrShort(out.outstanding)}
          hint={out.overdue ? <span className="text-red-600">{inrShort(out.overdue)} overdue</span> : "Nothing overdue"}
          href="/invoices?tab=unpaid"
        />
        <Stat label="Screens running today" value={`${occ.busy} of ${occ.total}`} hint={`${occ.pct}% occupied`} href="/screens/availability" />
        <Stat label="Awaiting client reply" value={inrShort(Number(pipeline))} hint={`${openQuotes} ${openQuotes === 1 ? "quote" : "quotes"}`} href="/quotes?tab=sent" />
      </StatRow>
    );
  } else if (isSales) {
    const [{ openLeads }] = await db
      .select({ openLeads: sql<number>`count(*)` })
      .from(clients)
      .where(and(eq(clients.ownerId, user.id), inArray(clients.stage, OPEN_STAGES)));
    const [{ sent, sentValue }] = await db
      .select({ sent: sql<number>`count(*)`, sentValue: sql<number>`coalesce(sum(${quoteVersions.total}),0)` })
      .from(quotes)
      .innerJoin(quoteVersions, and(eq(quoteVersions.quoteId, quotes.id), eq(quoteVersions.version, quotes.currentVersion)))
      .where(and(eq(quotes.createdBy, user.id), eq(quotes.status, "sent")));
    const [{ won }] = await db
      .select({ won: sql<number>`coalesce(sum(${bookings.total}),0)` })
      .from(bookings)
      .where(and(eq(bookings.createdBy, user.id), ne(bookings.status, "cancelled"), gte(bookings.createdAt, istDateTime(monthStart(t), "00:00"))));
    stats = (
      <StatRow>
        <Stat label="Due today" value={myTasks.length} hint={myTasks.length === 1 ? "task" : "tasks"} href="/tasks" />
        <Stat label="Open leads" value={openLeads} href="/leads?owner=me" />
        <Stat label="Awaiting client reply" value={sent} hint={inrShort(Number(sentValue))} href="/quotes?tab=sent" />
        <Stat label="Booked this month" value={inrShort(Number(won))} href="/bookings" />
      </StatRow>
    );
  } else {
    const occ = await occupancyOn(db);
    const [{ live }] = await db.select({ live: sql<number>`count(*)` }).from(bookings).where(eq(bookings.status, "live"));
    const [{ starting }] = await db
      .select({ starting: sql<number>`count(*)` })
      .from(bookings)
      .where(and(inArray(bookings.status, ["confirmed", "creative_received", "creative_approved"]), lte(bookings.startDate, addDays(t, 7))));
    const [{ maint }] = await db.select({ maint: sql<number>`count(*)` }).from(assets).where(eq(assets.status, "maintenance"));
    stats = (
      <StatRow>
        <Stat label="Campaigns live" value={live} href="/bookings?tab=live" />
        <Stat label="Starting within a week" value={starting} href="/bookings?tab=upcoming" />
        <Stat label="Screens running today" value={`${occ.busy} of ${occ.total}`} href="/screens/availability" />
        <Stat label="Under maintenance" value={maint} tone={maint ? "red" : undefined} href="/screens/maintenance" />
      </StatRow>
    );
  }

  // ---------- needs attention ----------
  const attention: Attention[] = [];
  if (can(user, "approve")) {
    const pending = await db
      .select({ id: quotes.id, client: clients.name, pct: quoteVersions.maxDiscountPct })
      .from(quotes)
      .innerJoin(clients, eq(clients.id, quotes.clientId))
      .innerJoin(quoteVersions, and(eq(quoteVersions.quoteId, quotes.id), eq(quoteVersions.version, quotes.currentVersion)))
      .where(eq(quotes.status, "pending_approval"));
    for (const p of pending)
      attention.push({ state: "on", href: `/quotes/${p.id}`, text: <>Approve a {p.pct}% discount for <Strong>{p.client}</Strong></> });
  }
  if (isSales) {
    const expiring = await db
      .select({ quoteId: quotes.id, client: clients.name, expiresAt: sql<number>`min(${holds.expiresAt})` })
      .from(holds)
      .innerJoin(quotes, eq(quotes.id, holds.quoteId))
      .innerJoin(clients, eq(clients.id, holds.clientId))
      .where(
        and(
          eq(holds.status, "active"),
          lte(holds.expiresAt, new Date(Date.now() + 24 * 3600_000)),
          gt(holds.expiresAt, new Date()),
          isManager ? undefined : eq(quotes.createdBy, user.id),
        ),
      )
      .groupBy(quotes.id, clients.name);
    for (const h of expiring)
      attention.push({ state: "on", href: `/quotes/${h.quoteId}`, text: <>Screens held for <Strong>{h.client}</Strong> are released {relTime(new Date(Number(h.expiresAt)))}</> });

    const stale = await db
      .select({ id: clients.id, name: clients.name, last: clients.lastActivityAt })
      .from(clients)
      .where(
        and(
          inArray(clients.stage, ["qualified", "meeting", "proposal", "negotiation"]),
          or(isNull(clients.lastActivityAt), lte(clients.lastActivityAt, new Date(Date.now() - 7 * 86400_000))),
          isManager ? undefined : eq(clients.ownerId, user.id),
        ),
      )
      .limit(5);
    for (const c of stale)
      attention.push({ state: "pending", href: `/clients/${c.id}`, text: <>No contact with <Strong>{c.name}</Strong> for {c.last ? relTime(c.last).replace(" ago", "") : "a while"}</> });
  }
  if (isManager) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(clients)
      .where(and(isNull(clients.ownerId), inArray(clients.stage, OPEN_STAGES)));
    if (n) attention.push({ state: "pending", href: "/leads?owner=none", text: <><Strong>{n} new {n === 1 ? "lead" : "leads"}</Strong> waiting to be assigned</> });
  }
  if (isFinance || isManager) {
    const out = await outstandingSummary(db);
    if (out.overdueCount)
      attention.push({ state: "problem", href: "/invoices?tab=overdue", text: <><Strong>{inr(out.overdue)}</Strong> overdue across {out.overdueCount} {out.overdueCount === 1 ? "invoice" : "invoices"}</> });
  }
  if (isOps || isManager) {
    const noCreative = await db
      .select({ id: bookings.id, title: bookings.title, start: bookings.startDate })
      .from(bookings)
      .where(and(eq(bookings.status, "confirmed"), lte(bookings.startDate, addDays(t, 7))));
    for (const b of noCreative)
      attention.push({ state: "problem", href: `/bookings/${b.id}`, text: <><Strong>{b.title}</Strong> starts {fmtDay(b.start, { year: false })} without a creative</> });
    const permits = await db
      .select({ id: assets.id, name: assets.name, expiry: assets.permitExpiry })
      .from(assets)
      .where(and(ne(assets.status, "inactive"), lte(assets.permitExpiry, addDays(t, 30))));
    for (const a of permits)
      attention.push({ state: "pending", href: `/screens/${a.id}`, text: <>Permit for <Strong>{a.name}</Strong> expires {fmtDay(a.expiry)}</> });
  }

  // ---------- this week ----------
  const weekEnd = addDays(t, 7);
  const campaigns = await db
    .select({ b: bookings, client: clients.name })
    .from(bookings)
    .innerJoin(clients, eq(clients.id, bookings.clientId))
    .where(
      and(
        ne(bookings.status, "cancelled"),
        or(and(gte(bookings.startDate, t), lte(bookings.startDate, weekEnd)), and(gte(bookings.endDate, t), lte(bookings.endDate, weekEnd))),
      ),
    )
    .orderBy(asc(bookings.startDate))
    .limit(6);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-neutral-500">{dateLine}</p>
          <h1 className="mt-1 text-[32px] leading-tight font-semibold tracking-[-0.025em] text-neutral-900">
            {greeting}, {user.name.split(" ")[0]}
          </h1>
        </div>
        {isSales && (
          <div className="flex gap-2">
            <LinkButton href="/clients/new" variant="secondary">
              Add lead
            </LinkButton>
            <LinkButton href="/quotes/new">New quote</LinkButton>
          </div>
        )}
      </div>

      {stats}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Needs attention" description={attention.length ? undefined : "Nothing urgent right now"} />
          {attention.length > 0 && (
            <ul className="px-3 pb-3">
              {attention.map((a, i) => (
                <li key={i}>
                  <Link href={a.href} className="group flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-neutral-600 transition-colors hover:bg-neutral-50">
                    <StatusDot state={a.state} />
                    <span className="flex-1">{a.text}</span>
                    <ChevronRight className="size-4 stroke-[1.75] text-neutral-300 transition-colors group-hover:text-neutral-500" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Today"
            description={myTasks.length ? undefined : "No tasks due"}
            action={
              <>
                <LinkButton href="/tasks" variant="ghost" size="sm">
                  All tasks
                </LinkButton>
                <NewTaskButton variant="secondary" size="sm" label="Add" />
              </>
            }
          />
          {myTasks.length > 0 && (
            <ul className="divide-y divide-neutral-100 pb-2">
              {myTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="This week" description="Campaigns starting or ending in the next seven days" action={<LinkButton href="/bookings" variant="ghost" size="sm">All bookings</LinkButton>} />
        {campaigns.length === 0 ? (
          <EmptyState title="A quiet week" text="No campaigns start or end in the next seven days." />
        ) : (
          <ul className="px-3 pb-3">
            {campaigns.map(({ b, client }) => {
              const starting = b.startDate >= t;
              return (
                <li key={b.id}>
                  <Link href={`/bookings/${b.id}`} className="flex items-center gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-neutral-50">
                    <div className="w-16 shrink-0 text-center">
                      <p className="text-[11px] text-neutral-500">{starting ? "Starts" : "Ends"}</p>
                      <p className="text-[15px] font-semibold text-neutral-900">{fmtDay(starting ? b.startDate : b.endDate, { year: false })}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900">{b.title}</p>
                      <p className="truncate text-[13px] text-neutral-500">{client}</p>
                    </div>
                    <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-neutral-900">{children}</span>;
}
