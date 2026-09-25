import Link from "next/link";
import { and, desc, eq, like, inArray, or, sql, type SQL } from "drizzle-orm";
import { FileText } from "lucide-react";
import { getDb } from "@/db";
import { clients, quoteLines, quoteVersions, quotes, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { QUOTE_STATUS } from "@/lib/constants";
import { dayOf, fmtDay, fmtRange, inr, relTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Tabs, cn, table } from "@/components/ui";

export const metadata = { title: "Quotes" };

const TABS = [
  { key: "all", label: "All", statuses: null },
  { key: "draft", label: "Drafts", statuses: ["draft"] },
  { key: "approval", label: "Needs approval", statuses: ["pending_approval"] },
  { key: "sent", label: "Awaiting reply", statuses: ["sent"] },
  { key: "accepted", label: "Booked", statuses: ["accepted"] },
  { key: "closed", label: "Rejected / expired", statuses: ["rejected", "expired"] },
] as const;

type Status = (typeof quotes.$inferSelect)["status"];

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ tab?: string; mine?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const mine = sp.mine === "1" || (sp.mine === undefined && user.role === "sales_exec");
  const db = await getDb();

  const where: SQL[] = [];
  if (tab.statuses) where.push(inArray(quotes.status, tab.statuses as unknown as Status[]));
  if (mine) where.push(eq(quotes.createdBy, user.id));
  if (sp.q) where.push(or(like(quotes.title, `%${sp.q}%`), like(quotes.number, `%${sp.q}%`), like(clients.name, `%${sp.q}%`))!);

  const dates = db
    .select({
      versionId: quoteLines.versionId,
      start: sql<string>`min(${quoteLines.startDate})`.as("qs"),
      end: sql<string>`max(${quoteLines.endDate})`.as("qe"),
      screens: sql<number>`count(${quoteLines.assetId})`.as("qn"),
    })
    .from(quoteLines)
    .groupBy(quoteLines.versionId)
    .as("d");

  const rows = await db
    .select({ q: quotes, v: quoteVersions, client: clients.name, by: users.name, start: dates.start, end: dates.end, screens: dates.screens })
    .from(quotes)
    .innerJoin(clients, eq(clients.id, quotes.clientId))
    .innerJoin(quoteVersions, and(eq(quoteVersions.quoteId, quotes.id), eq(quoteVersions.version, quotes.currentVersion)))
    .leftJoin(users, eq(users.id, quotes.createdBy))
    .leftJoin(dates, eq(dates.versionId, quoteVersions.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(quotes.updatedAt));

  const counts = await db
    .select({ status: quotes.status, n: sql<number>`count(*)` })
    .from(quotes)
    .where(mine ? eq(quotes.createdBy, user.id) : undefined)
    .groupBy(quotes.status);
  const countFor = (st: readonly string[] | null) => counts.filter((c) => !st || st.includes(c.status)).reduce((s, c) => s + c.n, 0);
  const href = (k: string, m = mine) => `/quotes?tab=${k}&mine=${m ? 1 : 0}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`;

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle="Proposals sent to clients. Sent quotes hold their screens until the client decides."
        actions={can(user, "sales") && <LinkButton href="/quotes/new">New quote</LinkButton>}
      />
      <Tabs items={TABS.map((t) => ({ label: t.label, href: href(t.key), active: tab.key === t.key, count: countFor(t.statuses) }))} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <Link href={href(tab.key, false)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", !mine ? "bg-white shadow-sm" : "text-slate-600")}>
            Everyone&apos;s
          </Link>
          <Link href={href(tab.key, true)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", mine ? "bg-white shadow-sm" : "text-slate-600")}>
            Mine
          </Link>
        </div>
        <form className="ml-auto">
          <input type="hidden" name="tab" value={tab.key} />
          <input type="hidden" name="mine" value={mine ? 1 : 0} />
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Search quotes…"
            className="h-9 w-56 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
        </form>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<FileText />} title="No quotes here" action={can(user, "sales") && <LinkButton href="/quotes/new">Create a quote</LinkButton>} />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>Quote</th>
                  <th className={table.th}>Client</th>
                  <th className={table.th}>Campaign dates</th>
                  <th className={table.th}>Status</th>
                  <th className={table.th}>By</th>
                  <th className={cn(table.th, "text-right")}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ q, v, client, by, start, end, screens }) => (
                  <tr key={q.id} className={table.tr}>
                    <td className={table.td}>
                      <Link href={`/quotes/${q.id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">
                        {q.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {q.number}
                        {q.currentVersion > 1 ? ` · v${q.currentVersion}` : ""} · {screens} screen{screens === 1 ? "" : "s"}
                      </p>
                    </td>
                    <td className={cn(table.td, "text-slate-700")}>
                      <Link href={`/clients/${q.clientId}`} className="hover:underline">
                        {client}
                      </Link>
                    </td>
                    <td className={cn(table.td, "whitespace-nowrap text-slate-600")}>{fmtRange(start, end)}</td>
                    <td className={table.td}>
                      <Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {q.status === "sent" ? `sent ${relTime(q.sentAt)}` : q.status === "draft" ? `created ${fmtDay(dayOf(q.createdAt), { year: false })}` : ""}
                        {q.status === "pending_approval" ? `${v.maxDiscountPct}% discount` : ""}
                      </p>
                    </td>
                    <td className={cn(table.td, "text-slate-600")}>{by?.split(" ")[0]}</td>
                    <td className={cn(table.td, "text-right font-medium tabular-nums")}>{inr(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
