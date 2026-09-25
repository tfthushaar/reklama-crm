import Link from "next/link";
import { and, desc, eq, ilike, inArray, isNull, min, ne, or, sql } from "drizzle-orm";
import { Building2, Upload } from "lucide-react";
import { getDb } from "@/db";
import { bookings, clients, contacts, invoices, tasks, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { CLIENT_TYPE_LABEL, OPEN_STAGES, stageInfo } from "@/lib/constants";
import { dueLabel, inrShort, relTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { paidSq } from "@/lib/queries";
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader, Tabs, cn, table } from "@/components/ui";

export const metadata = { title: "Clients" };

const TABS = [
  { key: "all", label: "All" },
  { key: "leads", label: "Active leads" },
  { key: "won", label: "Clients" },
  { key: "lost", label: "Lost" },
] as const;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; owner?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "all";
  const q = sp.q?.trim();
  const db = await getDb();

  const where = [];
  if (tab === "leads") where.push(inArray(clients.stage, OPEN_STAGES));
  if (tab === "won") where.push(eq(clients.stage, "won"));
  if (tab === "lost") where.push(eq(clients.stage, "lost"));
  if (sp.owner === "me") where.push(eq(clients.ownerId, user.id));
  if (sp.owner === "none") where.push(isNull(clients.ownerId));
  if (q) {
    const contactMatch = db.select({ id: contacts.clientId }).from(contacts).where(or(ilike(contacts.name, `%${q}%`), ilike(contacts.phone, `%${q}%`)));
    where.push(or(ilike(clients.name, `%${q}%`), ilike(clients.city, `%${q}%`), ilike(clients.gstin, `%${q}%`), inArray(clients.id, contactMatch))!);
  }

  const nextTask = db
    .select({ clientId: tasks.clientId, due: min(tasks.dueAt).as("due") })
    .from(tasks)
    .where(eq(tasks.status, "open"))
    .groupBy(tasks.clientId)
    .as("nt");
  const business = db
    .select({ clientId: bookings.clientId, total: sql<number>`sum(${bookings.total})::bigint`.as("biz") })
    .from(bookings)
    .where(ne(bookings.status, "cancelled"))
    .groupBy(bookings.clientId)
    .as("biz");
  const p = paidSq(db);
  const due = db
    .select({ clientId: invoices.clientId, balance: sql<number>`sum(${invoices.total} - coalesce(${p.paid},0))::bigint`.as("bal") })
    .from(invoices)
    .leftJoin(p, eq(p.invoiceId, invoices.id))
    .where(inArray(invoices.status, ["issued", "partial"]))
    .groupBy(invoices.clientId)
    .as("due");
  const primary = db
    .select({ clientId: contacts.clientId, name: min(contacts.name).as("cname") })
    .from(contacts)
    .where(eq(contacts.isPrimary, true))
    .groupBy(contacts.clientId)
    .as("pc");

  const rows = await db
    .select({ c: clients, owner: users.name, due: nextTask.due, biz: business.total, balance: due.balance, contact: primary.name })
    .from(clients)
    .leftJoin(users, eq(users.id, clients.ownerId))
    .leftJoin(nextTask, eq(nextTask.clientId, clients.id))
    .leftJoin(business, eq(business.clientId, clients.id))
    .leftJoin(due, eq(due.clientId, clients.id))
    .leftJoin(primary, eq(primary.clientId, clients.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(clients.updatedAt));

  const counts = await db
    .select({ stage: clients.stage, n: sql<number>`count(*)::int` })
    .from(clients)
    .groupBy(clients.stage);
  const count = (keys: string[]) => counts.filter((c) => keys.includes(c.stage)).reduce((s, c) => s + c.n, 0);
  const tabCount = { all: count(counts.map((c) => c.stage)), leads: count(OPEN_STAGES), won: count(["won"]), lost: count(["lost"]) };

  const href = (t: string) => `/clients?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Every company you've talked to — leads, active clients and lost deals."
        actions={
          can(user, "sales") && (
            <>
              <LinkButton href="/clients/import" variant="secondary">
                <Upload /> Import
              </LinkButton>
              <LinkButton href="/clients/new">Add lead</LinkButton>
            </>
          )
        }
      />
      <Tabs items={TABS.map((t) => ({ label: t.label, href: href(t.key), active: tab === t.key, count: tabCount[t.key] }))} />
      <form className="mb-4 flex gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by company, contact, phone, city or GSTIN…"
          className="h-10 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
      </form>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Building2 />} title="No clients found" text={q ? "Try a different search." : "Add your first lead to get started."} />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>Company</th>
                  <th className={table.th}>Stage</th>
                  <th className={table.th}>Owner</th>
                  <th className={table.th}>Last contact</th>
                  <th className={table.th}>Next follow-up</th>
                  <th className={cn(table.th, "text-right")}>Business</th>
                  <th className={cn(table.th, "text-right")}>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, owner, due: d, biz, balance, contact }) => {
                  const st = stageInfo(c.stage);
                  const overdue = d && new Date(d).getTime() < Date.now();
                  return (
                    <tr key={c.id} className={table.tr}>
                      <td className={table.td}>
                        <Link href={`/clients/${c.id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">
                          {c.name}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                          {c.type !== "advertiser" && <Badge tone="purple">{CLIENT_TYPE_LABEL[c.type]}</Badge>}
                          <span>{[contact, c.industry, c.city].filter(Boolean).join(" · ")}</span>
                        </div>
                      </td>
                      <td className={table.td}>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className={table.td}>
                        {owner ? (
                          <span className="inline-flex items-center gap-2 text-slate-700">
                            <Avatar name={owner} size="sm" /> {owner.split(" ")[0]}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-amber-700">Unassigned</span>
                        )}
                      </td>
                      <td className={cn(table.td, "text-slate-600")}>{c.lastActivityAt ? relTime(c.lastActivityAt) : "—"}</td>
                      <td className={cn(table.td, overdue ? "font-medium text-red-600" : "text-slate-600")}>{d ? dueLabel(d) : "—"}</td>
                      <td className={cn(table.td, "text-right tabular-nums")}>{biz ? inrShort(Number(biz)) : "—"}</td>
                      <td className={cn(table.td, "text-right tabular-nums", balance && Number(balance) > 0 && "font-medium text-amber-700")}>
                        {balance && Number(balance) > 0 ? inrShort(Number(balance)) : "—"}
                      </td>
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
