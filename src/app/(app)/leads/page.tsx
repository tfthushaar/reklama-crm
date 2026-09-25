import Link from "next/link";
import { and, eq, like, inArray, isNull, min, or, sql } from "drizzle-orm";
import { Upload } from "lucide-react";
import { getDb } from "@/db";
import { clients, tasks, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { OPEN_STAGES, STAGES } from "@/lib/constants";
import { dueLabel, inrShort, relTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { Kanban, type LeadCard } from "@/components/kanban";
import { LinkButton, PageHeader, cn } from "@/components/ui";
import { setStageAction } from "@/app/actions/clients";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ owner?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const owner = sp.owner ?? (user.role === "sales_exec" ? "me" : "all");
  const q = sp.q?.trim();

  const where = [inArray(clients.stage, OPEN_STAGES)];
  if (owner === "me") where.push(eq(clients.ownerId, user.id));
  else if (owner === "none") where.push(isNull(clients.ownerId));
  else if (/^\d+$/.test(owner)) where.push(eq(clients.ownerId, Number(owner)));
  if (q) where.push(or(like(clients.name, `%${q}%`), like(clients.requirement, `%${q}%`))!);

  const nextTask = db
    .select({ clientId: tasks.clientId, due: min(tasks.dueAt).as("due") })
    .from(tasks)
    .where(eq(tasks.status, "open"))
    .groupBy(tasks.clientId)
    .as("next_task");

  const rows = await db
    .select({ c: clients, ownerName: users.name, due: nextTask.due })
    .from(clients)
    .leftJoin(users, eq(users.id, clients.ownerId))
    .leftJoin(nextTask, eq(nextTask.clientId, clients.id))
    .where(and(...where))
    .orderBy(sql`${clients.updatedAt} desc`);

  const cards: LeadCard[] = rows.map(({ c, ownerName, due }) => {
    const stale = !c.lastActivityAt || Date.now() - new Date(c.lastActivityAt).getTime() > 7 * 86400_000;
    return {
      id: c.id,
      name: c.name,
      stage: c.stage,
      industry: c.industry,
      requirement: c.requirement,
      budget: c.budget ? inrShort(c.budget) : null,
      ownerName,
      lastContact: c.lastActivityAt ? `Contacted ${relTime(c.lastActivityAt)}` : "Not contacted yet",
      stale,
      nextTask: due ? dueLabel(due) : null,
      nextOverdue: !!due && new Date(due).getTime() < Date.now(),
    };
  });

  const team = can(user, "team")
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.role, ["sales_exec", "sales_manager", "owner"]))
    : [];
  const filters = [
    { key: "all", label: "Everyone" },
    { key: "me", label: "Mine" },
    ...(can(user, "team") ? [{ key: "none", label: "Unassigned" }, ...team.filter((u) => u.id !== user.id).map((u) => ({ key: String(u.id), label: u.name.split(" ")[0]! }))] : []),
  ];

  const columns = STAGES.filter((s) => OPEN_STAGES.includes(s.key)).map((s) => ({ key: s.key, label: s.label, dot: "" }));

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Drag a card to move it to the next stage. Open a card to call, message or quote."
        actions={
          <>
            <LinkButton href="/clients/import" variant="secondary">
              <Upload /> Import
            </LinkButton>
            <LinkButton href="/clients/new">Add lead</LinkButton>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-full bg-neutral-100 p-1">
          {filters.map((f) => (
            <Link
              key={f.key}
              href={`/leads?owner=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                owner === f.key ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form className="ml-auto">
          <input type="hidden" name="owner" value={owner} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Filter leads…"
            className="h-9 w-56 rounded-full border border-neutral-200 bg-white px-4 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/5"
          />
        </form>
        <Link href="/clients?tab=won" className="text-sm text-neutral-500 hover:text-neutral-800">
          Won and lost
        </Link>
      </div>
      <Kanban columns={columns} cards={cards} moveAction={setStageAction} />
    </div>
  );
}
