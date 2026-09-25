import { and, asc, desc, eq, gt, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import { getDb } from "@/db";
import { clients, tasks, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { addDays, istDateTime, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { NewTaskButton, TaskRow, type TaskView } from "@/components/tasks";
import { Avatar, Card, EmptyState, PageHeader, Tabs, cn, table } from "@/components/ui";

export const metadata = { title: "My tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isTeam = can(user, "team");
  const tab = (["today", "upcoming", "done", "team"] as const).find((x) => x === sp.tab && (x !== "team" || isTeam)) ?? "today";
  const db = await getDb();
  const t = today();
  const endOfToday = istDateTime(addDays(t, 1), "00:00");

  const base = db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      priority: tasks.priority,
      status: tasks.status,
      outcome: tasks.outcome,
      clientId: tasks.clientId,
      clientName: clients.name,
      assigneeName: users.name,
      refType: tasks.refType,
      refId: tasks.refId,
    })
    .from(tasks)
    .leftJoin(clients, eq(clients.id, tasks.clientId))
    .leftJoin(users, eq(users.id, tasks.assignedTo));

  let list: TaskView[] = [];
  if (tab === "today") list = await base.where(and(eq(tasks.assignedTo, user.id), eq(tasks.status, "open"), lte(tasks.dueAt, endOfToday))).orderBy(asc(tasks.dueAt));
  if (tab === "upcoming") list = await base.where(and(eq(tasks.assignedTo, user.id), eq(tasks.status, "open"), gt(tasks.dueAt, endOfToday))).orderBy(asc(tasks.dueAt));
  if (tab === "done")
    list = await base
      .where(and(eq(tasks.assignedTo, user.id), eq(tasks.status, "done"), gte(tasks.completedAt, istDateTime(addDays(t, -30), "00:00"))))
      .orderBy(desc(tasks.completedAt))
      .limit(100);

  const counts = await db
    .select({
      today: sql<number>`count(*) filter (where ${tasks.status} = 'open' and ${tasks.dueAt} <= ${endOfToday.getTime()})`,
      upcoming: sql<number>`count(*) filter (where ${tasks.status} = 'open' and ${tasks.dueAt} > ${endOfToday.getTime()})`,
    })
    .from(tasks)
    .where(eq(tasks.assignedTo, user.id));

  let team: { id: number; name: string; role: string; open: number; overdue: number; doneWeek: number }[] = [];
  let teamOverdue: TaskView[] = [];
  if (tab === "team") {
    const people = await db.select().from(users).where(and(eq(users.active, true), ne(users.role, "owner")));
    const now = new Date();
    const stats = await db
      .select({
        userId: tasks.assignedTo,
        open: sql<number>`count(*) filter (where ${tasks.status} = 'open')`,
        overdue: sql<number>`count(*) filter (where ${tasks.status} = 'open' and ${tasks.dueAt} < ${now.getTime()})`,
        doneWeek: sql<number>`count(*) filter (where ${tasks.status} = 'done' and ${tasks.completedAt} >= ${istDateTime(addDays(t, -6), "00:00").getTime()})`,
      })
      .from(tasks)
      .groupBy(tasks.assignedTo);
    team = people.map((p) => {
      const s = stats.find((x) => x.userId === p.id);
      return { id: p.id, name: p.name, role: ROLE_LABEL[p.role], open: s?.open ?? 0, overdue: s?.overdue ?? 0, doneWeek: s?.doneWeek ?? 0 };
    });
    teamOverdue = await base
      .where(and(eq(tasks.status, "open"), lte(tasks.dueAt, now), inArray(tasks.assignedTo, people.map((p) => p.id))))
      .orderBy(asc(tasks.dueAt));
  }

  const people = isTeam ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)) : undefined;
  const clientList = await db.select({ id: clients.id, name: clients.name }).from(clients).where(ne(clients.stage, "lost")).orderBy(asc(clients.name));

  return (
    <div>
      <PageHeader
        title="Tasks & reminders"
        subtitle="Every follow-up in one list. Completing a task asks what happened, so nothing is lost."
        actions={<NewTaskButton users={people?.filter((p) => p.id !== user.id)} clients={clientList} />}
      />
      <Tabs
        items={[
          { label: "Today & overdue", href: "/tasks?tab=today", active: tab === "today", count: counts[0]?.today },
          { label: "Upcoming", href: "/tasks?tab=upcoming", active: tab === "upcoming", count: counts[0]?.upcoming },
          { label: "Done", href: "/tasks?tab=done", active: tab === "done" },
          ...(isTeam ? [{ label: "Team", href: "/tasks?tab=team", active: tab === "team" }] : []),
        ]}
      />
      {tab === "team" ? (
        <div className="space-y-5">
          <Card>
            <div className={table.wrap}>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th className={table.th}>Person</th>
                    <th className={cn(table.th, "text-right")}>Open</th>
                    <th className={cn(table.th, "text-right")}>Overdue</th>
                    <th className={cn(table.th, "text-right")}>Done this week</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((p) => (
                    <tr key={p.id} className={table.tr}>
                      <td className={table.td}>
                        <span className="flex items-center gap-2">
                          <Avatar name={p.name} size="sm" />
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs text-slate-400">{p.role}</span>
                        </span>
                      </td>
                      <td className={cn(table.td, "text-right tabular-nums")}>{p.open}</td>
                      <td className={cn(table.td, "text-right tabular-nums", p.overdue > 0 && "font-semibold text-red-600")}>{p.overdue}</td>
                      <td className={cn(table.td, "text-right tabular-nums")}>{p.doneWeek}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Overdue across the team</h2>
            </div>
            {teamOverdue.length === 0 ? (
              <EmptyState icon={<CheckCircle2 />} title="No overdue follow-ups" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {teamOverdue.map((task) => (
                  <TaskRow key={task.id} task={task} showAssignee />
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <Card>
          {list.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 />}
              title={tab === "today" ? "Nothing due today" : tab === "upcoming" ? "Nothing scheduled" : "Nothing completed recently"}
              text={tab === "today" ? "Enjoy the calm — or set a reminder for a lead you haven't called in a while." : undefined}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
