import Link from "next/link";
import { and, desc, eq, like, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { Download, Receipt } from "lucide-react";
import { getDb } from "@/db";
import { bookings, clients, invoices } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { INVOICE_STATUS } from "@/lib/constants";
import { daysBetween, fmtDay, inr, inrShort, monthStart, today } from "@/lib/format";
import { collectedBetween, outstandingSummary, paidSq } from "@/lib/queries";
import { Badge, Card, EmptyState, PageHeader, Stat, StatRow, Tabs, buttonClass, cn, table, StatusLabel } from "@/components/ui";

export const metadata = { title: "Invoices" };

const TABS = ["unpaid", "overdue", "paid", "proforma", "draft", "all"] as const;
const LABEL: Record<(typeof TABS)[number], string> = {
  unpaid: "Unpaid",
  overdue: "Overdue",
  paid: "Paid",
  proforma: "Proforma",
  draft: "Drafts",
  all: "All",
};

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const tab = TABS.find((x) => x === sp.tab) ?? "unpaid";
  const db = await getDb();
  const t = today();
  const p = paidSq(db);

  const where: SQL[] = [];
  if (tab === "unpaid") where.push(inArray(invoices.status, ["issued", "partial"]));
  if (tab === "overdue") where.push(inArray(invoices.status, ["issued", "partial"]), lt(invoices.dueDate, t));
  if (tab === "paid") where.push(eq(invoices.status, "paid"));
  if (tab === "proforma") where.push(eq(invoices.kind, "proforma"));
  if (tab === "draft") where.push(eq(invoices.status, "draft"));
  if (sp.q) where.push(or(like(invoices.number, `%${sp.q}%`), like(clients.name, `%${sp.q}%`))!);

  const rows = await db
    .select({ i: invoices, client: clients.name, booking: bookings.title, paid: p.paid, tds: p.tds })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .leftJoin(bookings, eq(bookings.id, invoices.bookingId))
    .leftJoin(p, eq(p.invoiceId, invoices.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(tab === "unpaid" || tab === "overdue" ? invoices.dueDate : desc(invoices.issueDate));

  const [out, collected] = await Promise.all([outstandingSummary(db), collectedBetween(db, monthStart(t), t)]);
  const aging = await db
    .select({
      bucket: sql<string>`case when ${invoices.dueDate} >= ${t} then 'Not due' when julianday(${t}) - julianday(${invoices.dueDate}) <= 30 then '1–30 days' when julianday(${t}) - julianday(${invoices.dueDate}) <= 60 then '31–60 days' when julianday(${t}) - julianday(${invoices.dueDate}) <= 90 then '61–90 days' else '90+ days' end`,
      amount: sql<number>`sum(${invoices.total} - coalesce(${p.paid},0))`,
    })
    .from(invoices)
    .leftJoin(p, eq(p.invoiceId, invoices.id))
    .where(inArray(invoices.status, ["issued", "partial"]))
    .groupBy(sql`1`);
  const buckets = ["Not due", "1–30 days", "31–60 days", "61–90 days", "90+ days"].map((b) => ({ b, amount: Number(aging.find((a) => a.bucket === b)?.amount ?? 0) }));
  const maxBucket = Math.max(1, ...buckets.map((b) => b.amount));
  const [{ drafts }] = await db.select({ drafts: sql<number>`count(*)` }).from(invoices).where(and(eq(invoices.status, "draft"), isNull(invoices.number)));

  return (
    <div>
      <PageHeader
        title="Invoices & payments"
        subtitle="What's been billed, what's been paid, and who to chase."
        actions={
          <a href="/api/export/invoices" className={buttonClass("secondary")}>
            <Download /> Export for accounts
          </a>
        }
      />
      <StatRow className="mb-8">
        <Stat label="Outstanding" value={inrShort(out.outstanding)} hint="All unpaid invoices" />
        <Stat label="Overdue" value={inrShort(out.overdue)} hint={`${out.overdueCount} invoice${out.overdueCount === 1 ? "" : "s"} past due`} tone={out.overdue ? "red" : undefined} href="/invoices?tab=overdue" />
        <Stat label="Collected this month" value={inrShort(collected)} tone="green" />
        <div className="px-6 py-5">
          <p className="mb-2.5 text-[13px] text-neutral-500">Outstanding by age</p>
          <div className="space-y-1">
            {buckets.map(({ b, amount }) => (
              <div key={b} className="flex items-center gap-2 text-[11px]">
                <span className="w-16 shrink-0 text-neutral-500">{b}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <span
                    className={cn("block h-full rounded-full", b === "Not due" ? "bg-neutral-300" : b === "1–30 days" ? "bg-neutral-600" : "bg-red-500")}
                    style={{ width: `${(amount / maxBucket) * 100}%` }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right font-medium text-neutral-700 tabular-nums">{amount ? inrShort(amount) : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      </StatRow>

      <Tabs items={TABS.map((k) => ({ label: LABEL[k], href: `/invoices?tab=${k}`, active: tab === k, count: k === "draft" ? drafts : k === "overdue" ? out.overdueCount : undefined }))} />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Receipt />} title={tab === "overdue" ? "Nothing overdue" : "No invoices here"} text="Invoices are created from a booking." />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>Invoice</th>
                  <th className={table.th}>Client</th>
                  <th className={table.th}>Due</th>
                  <th className={table.th}>Status</th>
                  <th className={cn(table.th, "text-right")}>Total</th>
                  <th className={cn(table.th, "text-right")}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ i, client, booking, paid }) => {
                  const bal = i.total - Number(paid ?? 0);
                  const open = ["issued", "partial"].includes(i.status);
                  const late = open && i.dueDate < t ? daysBetween(i.dueDate, t) - 1 : 0;
                  return (
                    <tr key={i.id} className={table.tr}>
                      <td className={table.td}>
                        <Link href={`/invoices/${i.id}`} className="font-medium text-neutral-900 hover:text-brand-700 hover:underline">
                          {i.number ?? "Draft"}
                        </Link>
                        <p className="text-xs text-neutral-500">
                          {i.kind === "proforma" ? "Proforma, " : ""}
                          {fmtDay(i.issueDate)}
                          {booking ? `, ${booking}` : ""}
                        </p>
                      </td>
                      <td className={cn(table.td, "text-neutral-700")}>
                        <Link href={`/clients/${i.clientId}`} className="hover:underline">
                          {client}
                        </Link>
                      </td>
                      <td className={cn(table.td, "whitespace-nowrap", late && "font-medium text-red-600")}>
                        {fmtDay(i.dueDate)}
                        {late > 0 && <p className="text-xs">{late} days late</p>}
                      </td>
                      <td className={table.td}>
                        <StatusLabel tone={late ? "red" : INVOICE_STATUS[i.status].tone} label={late ? "Overdue" : INVOICE_STATUS[i.status].label} />
                      </td>
                      <td className={cn(table.td, "text-right tabular-nums")}>{inr(i.total)}</td>
                      <td className={cn(table.td, "text-right font-medium tabular-nums")}>{i.status === "cancelled" || i.status === "draft" ? "—" : inr(bal)}</td>
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
