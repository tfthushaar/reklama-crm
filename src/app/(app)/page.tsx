import Link from "next/link";
import { and, asc, desc, eq, gte, gt, inArray, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  Hourglass,
  IndianRupee,
  MonitorPlay,
  ShieldAlert,
  Target,
  UserX,
  Wrench,
} from "lucide-react";
import { getDb } from "@/db";
import { activities, assets, bookings, clients, holds, invoices, quoteVersions, quotes, tasks, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ACTIVITY_TYPES, BOOKING_STATUS, OPEN_STAGES, ROLE_LABEL } from "@/lib/constants";
import { addDays, fmtDay, fmtRange, inr, inrShort, istDateTime, monthStart, relTime, today, TZ } from "@/lib/format";
import { can } from "@/lib/permissions";
import { collectedBetween, occupancyOn, outstandingSummary } from "@/lib/queries";
import { Avatar, Badge, Card, CardHeader, EmptyState, LinkButton, Stat, cn } from "@/components/ui";
import { NewTaskButton, TaskRow, type TaskView } from "@/components/tasks";

export const metadata = { title: "Home" };

type Attention = { icon: React.ReactNode; text: React.ReactNode; href: string; tone: "red" | "amber" | "blue" };

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

  // ---------- tasks due ----------
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
    .limit(8);

  // ---------- stats ----------
  const stats: React.ReactNode[] = [];
  if (isFinance || isManager) {
    const [collected, out, occ] = await Promise.all([collectedBetween(db, monthStart(t), t), outstandingSummary(db), occupancyOn(db)]);
    const [{ pipeline, openQuotes }] = await db
      .select({ pipeline: sql<number>`coalesce(sum(${quoteVersions.total}),0)::bigint`, openQuotes: sql<number>`count(*)::int` })
      .from(quotes)
      .innerJoin(quoteVersions, and(eq(quoteVersions.quoteId, quotes.id), eq(quoteVersions.version, quotes.currentVersion)))
      .where(eq(quotes.status, "sent"));
    stats.push(
      <Stat key="c" label="Collected this month" value={inrShort(collected)} icon={<IndianRupee />} href="/invoices?tab=paid" tone="green" />,
      <Stat
        key="o"
        label="Outstanding"
        value={inrShort(out.outstanding)}
        hint={out.overdue ? `${inrShort(out.overdue)} overdue (${out.overdueCount} invoices)` : "Nothing overdue"}
        icon={<Hourglass />}
        href="/invoices?tab=unpaid"
        tone={out.overdue ? "red" : undefined}
      />,
      <Stat key="s" label="Screens running today" value={`${occ.busy} of ${occ.total}`} hint={`${occ.pct}% occupancy`} icon={<MonitorPlay />} href="/screens/availability" />,
      <Stat key="p" label="Quotes awaiting reply" value={inrShort(Number(pipeline))} hint={`${openQuotes} quotes sent`} icon={<Target />} href="/quotes?tab=sent" />,
    );
  } else if (isSales) {
    const [{ openLeads }] = await db
      .select({ openLeads: sql<number>`count(*)::int` })
      .from(clients)
      .where(and(eq(clients.ownerId, user.id), inArray(clients.stage, OPEN_STAGES)));
    const [{ sent, sentValue }] = await db
      .select({ sent: sql<number>`count(*)::int`, sentValue: sql<number>`coalesce(sum(${quoteVersions.total}),0)::bigint` })
      .from(quotes)
      .innerJoin(quoteVersions, and(eq(quoteVersions.quoteId, quotes.id), eq(quoteVersions.version, quotes.currentVersion)))
      .where(and(eq(quotes.createdBy, user.id), eq(quotes.status, "sent")));
    const [{ won }] = await db
      .select({ won: sql<number>`coalesce(sum(${bookings.total}),0)::bigint` })
      .from(bookings)
      .where(and(eq(bookings.createdBy, user.id), ne(bookings.status, "cancelled"), gte(bookings.createdAt, istDateTime(monthStart(t), "00:00"))));
    stats.push(
      <Stat key="t" label="Tasks due today" value={myTasks.length} icon={<CheckCircle2 />} href="/tasks" tone={myTasks.length ? "amber" : undefined} />,
      <Stat key="l" label="My open leads" value={openLeads} icon={<Target />} href="/leads?owner=me" />,
      <Stat key="q" label="Quotes awaiting reply" value={sent} hint={inrShort(Number(sentValue))} href="/quotes?tab=sent" />,
      <Stat key="w" label="Booked this month" value={inrShort(Number(won))} icon={<IndianRupee />} tone="green" href="/bookings" />,
    );
  } else {
    const occ = await occupancyOn(db);
    const [{ live }] = await db.select({ live: sql<number>`count(*)::int` }).from(bookings).where(eq(bookings.status, "live"));
    const [{ starting }] = await db
      .select({ starting: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(inArray(bookings.status, ["confirmed", "creative_received", "creative_approved"]), lte(bookings.startDate, addDays(t, 7))));
    const [{ maint }] = await db.select({ maint: sql<number>`count(*)::int` }).from(assets).where(eq(assets.status, "maintenance"));
    stats.push(
      <Stat key="l" label="Campaigns live" value={live} icon={<MonitorPlay />} href="/bookings?tab=live" tone="green" />,
      <Stat key="s" label="Starting within 7 days" value={starting} icon={<CalendarClock />} href="/bookings?tab=upcoming" tone={starting ? "amber" : undefined} />,
      <Stat key="o" label="Screens running today" value={`${occ.busy} of ${occ.total}`} hint={`${occ.pct}% occupancy`} href="/screens/availability" />,
      <Stat key="m" label="Under maintenance" value={maint} icon={<Wrench />} href="/screens?status=maintenance" tone={maint ? "red" : undefined} />,
    );
  }

  // ---------- needs attention ----------
  const attention: Attention[] = [];
  if (can(user, "approve")) {
    const pending = await db
      .select({ id: quotes.id, number: quotes.number, client: clients.name, pct: quoteVersions.maxDiscountPct })
      .from(quotes)
      .innerJoin(clients, eq(clients.id, quotes.clientId))
      .innerJoin(quoteVersions, and(eq(quoteVersions.quoteId, quotes.id), eq(quoteVersions.version, quotes.currentVersion)))
      .where(eq(quotes.status, "pending_approval"));
    for (const p of pending)
      attention.push({
        icon: <ShieldAlert />,
        tone: "amber",
        href: `/quotes/${p.id}`,
        text: (
          <>
            Approve <b>{p.pct}% discount</b> on {p.number} for {p.client}
          </>
        ),
      });
  }
  if (isSales) {
    const expiring = await db
      .select({ quoteId: quotes.id, number: quotes.number, client: clients.name, expiresAt: sql<Date>`min(${holds.expiresAt})` })
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
      attention.push({
        icon: <Hourglass />,
        tone: "amber",
        href: `/quotes/${h.quoteId}`,
        text: (
          <>
            Screens held for <b>{h.client}</b> ({h.number}) are released {relTime(h.expiresAt)}
          </>
        ),
      });

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
      attention.push({
        icon: <AlertTriangle />,
        tone: "blue",
        href: `/clients/${c.id}`,
        text: (
          <>
            No contact with <b>{c.name}</b> for {c.last ? relTime(c.last).replace(" ago", "") : "a while"} — they are in an active deal
          </>
        ),
      });
  }
  if (isManager) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(clients)
      .where(and(isNull(clients.ownerId), inArray(clients.stage, OPEN_STAGES)));
    if (n)
      attention.push({
        icon: <UserX />,
        tone: "blue",
        href: "/leads?owner=none",
        text: (
          <>
            <b>{n} new lead{n > 1 ? "s" : ""}</b> not assigned to anyone yet
          </>
        ),
      });
  }
  if (isFinance || isManager) {
    const out = await outstandingSummary(db);
    if (out.overdueCount)
      attention.push({
        icon: <FileWarning />,
        tone: "red",
        href: "/invoices?tab=overdue",
        text: (
          <>
            <b>{out.overdueCount} invoices overdue</b> — {inr(out.overdue)} to collect
          </>
        ),
      });
  }
  if (isOps || isManager) {
    const noCreative = await db
      .select({ id: bookings.id, number: bookings.number, title: bookings.title, start: bookings.startDate })
      .from(bookings)
      .where(and(eq(bookings.status, "confirmed"), lte(bookings.startDate, addDays(t, 7))));
    for (const b of noCreative)
      attention.push({
        icon: <CalendarClock />,
        tone: "red",
        href: `/bookings/${b.id}`,
        text: (
          <>
            <b>{b.title}</b> starts {fmtDay(b.start, { year: false })} — creative not received yet
          </>
        ),
      });
    const permits = await db
      .select({ id: assets.id, name: assets.name, expiry: assets.permitExpiry })
      .from(assets)
      .where(and(ne(assets.status, "inactive"), lte(assets.permitExpiry, addDays(t, 30))));
    for (const a of permits)
      attention.push({
        icon: <ShieldAlert />,
        tone: "amber",
        href: `/screens/${a.id}`,
        text: (
          <>
            Permit for <b>{a.name}</b> expires {fmtDay(a.expiry)}
          </>
        ),
      });
  }

  // ---------- campaigns this week ----------
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

  // ---------- team activity ----------
  let team: { id: number; name: string; role: string; call: number; whatsapp: number; email: number; meeting: number; total: number }[] = [];
  if (isManager) {
    const since = istDateTime(addDays(t, -6), "00:00");
    const rows = await db
      .select({ userId: activities.userId, type: activities.type, n: sql<number>`count(*)::int` })
      .from(activities)
      .where(and(gte(activities.occurredAt, since), inArray(activities.type, ["call", "whatsapp", "email", "meeting"])))
      .groupBy(activities.userId, activities.type);
    const people = await db
      .select()
      .from(users)
      .where(and(eq(users.active, true), inArray(users.role, ["sales_manager", "sales_exec", "owner", "accounts"])));
    team = people
      .map((p) => {
        const get = (k: string) => rows.find((r) => r.userId === p.id && r.type === k)?.n ?? 0;
        const row = { id: p.id, name: p.name, role: ROLE_LABEL[p.role], call: get("call"), whatsapp: get("whatsapp"), email: get("email"), meeting: get("meeting"), total: 0 };
        row.total = row.call + row.whatsapp + row.email + row.meeting;
        return row;
      })
      .sort((a, b) => b.total - a.total);
  }

  // ---------- recent activity ----------
  const recent = await db
    .select({ a: activities, client: clients.name, who: users.name })
    .from(activities)
    .innerJoin(clients, eq(clients.id, activities.clientId))
    .leftJoin(users, eq(users.id, activities.userId))
    .where(isManager || isFinance ? undefined : or(eq(activities.userId, user.id), eq(clients.ownerId, user.id)))
    .orderBy(desc(activities.occurredAt))
    .limit(8);

  const toneCls = { red: "bg-red-50 text-red-600", amber: "bg-amber-50 text-amber-600", blue: "bg-blue-50 text-blue-600" };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {greeting}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date())} · here&apos;s what
            needs you today
          </p>
        </div>
        <div className="flex gap-2">
          {isSales && (
            <LinkButton href="/clients/new" variant="secondary">
              Add lead
            </LinkButton>
          )}
          {isSales && <LinkButton href="/quotes/new">New quote</LinkButton>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats}</div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Needs your attention" description={attention.length ? `${attention.length} item${attention.length > 1 ? "s" : ""}` : undefined} />
            {attention.length === 0 ? (
              <EmptyState icon={<CheckCircle2 />} title="All clear" text="Nothing urgent right now." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {attention.map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} className="flex items-center gap-3 px-5 py-3 text-sm text-slate-700 hover:bg-slate-50">
                      <span className={cn("rounded-lg p-2 [&_svg]:size-4", toneCls[a.tone])}>{a.icon}</span>
                      <span className="flex-1">{a.text}</span>
                      <span className="text-slate-400">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="My tasks for today"
              description="Including anything overdue"
              action={
                <>
                  <LinkButton href="/tasks" variant="ghost" size="sm">
                    See all
                  </LinkButton>
                  <NewTaskButton variant="secondary" label="Reminder" />
                </>
              }
            />
            {myTasks.length === 0 ? (
              <EmptyState icon={<CheckCircle2 />} title="You're all caught up" text="No tasks due today." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {myTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </ul>
            )}
          </Card>

          {isManager && team.length > 0 && (
            <Card>
              <CardHeader title="Team activity" description="Client conversations logged in the last 7 days" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 uppercase">
                      <th className="px-5 py-2 font-medium">Person</th>
                      <th className="px-3 py-2 text-right font-medium">Calls</th>
                      <th className="px-3 py-2 text-right font-medium">WhatsApp</th>
                      <th className="px-3 py-2 text-right font-medium">Email</th>
                      <th className="px-3 py-2 text-right font-medium">Meetings</th>
                      <th className="px-5 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((p) => (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <Avatar name={p.name} size="sm" />
                            <span className="font-medium text-slate-800">{p.name}</span>
                            <span className="text-xs text-slate-400">{p.role}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{p.call}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{p.whatsapp}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{p.email}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{p.meeting}</td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{p.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Campaigns this week" action={<LinkButton href="/bookings" variant="ghost" size="sm">All bookings</LinkButton>} />
            {campaigns.length === 0 ? (
              <EmptyState title="No campaigns starting or ending this week" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {campaigns.map(({ b, client }) => {
                  const starting = b.startDate >= t;
                  return (
                    <li key={b.id}>
                      <Link href={`/bookings/${b.id}`} className="block px-5 py-3 hover:bg-slate-50">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-slate-900">{b.title}</p>
                          <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {client} · {starting ? `starts ${fmtDay(b.startDate, { year: false })}` : `ends ${fmtDay(b.endDate, { year: false })}`} ·{" "}
                          {fmtRange(b.startDate, b.endDate)}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent activity" />
            <ul className="divide-y divide-slate-100">
              {recent.map(({ a, client, who }) => (
                <li key={a.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Badge tone={ACTIVITY_TYPES[a.type].tone}>{ACTIVITY_TYPES[a.type].label}</Badge>
                    <span>{relTime(a.occurredAt)}</span>
                    {who && <span>· {who}</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-700">
                    <Link href={`/clients/${a.clientId}`} className="font-medium text-slate-900 hover:underline">
                      {client}
                    </Link>
                    {a.outcome ? ` — ${a.outcome}` : ""}
                    {a.notes ? `: ${a.notes}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
