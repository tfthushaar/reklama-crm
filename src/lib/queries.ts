import "server-only";
import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { assets, bookingLines, bookings, invoices, payments } from "@/db/schema";
import { today } from "./format";

export function paidSq(db: Executor) {
  return db
    .select({
      invoiceId: payments.invoiceId,
      paid: sql<number>`sum(${payments.amount} + ${payments.tds})::bigint`.as("paid"),
      tds: sql<number>`sum(${payments.tds})::bigint`.as("tds_paid"),
    })
    .from(payments)
    .groupBy(payments.invoiceId)
    .as("paid_sq");
}

export async function outstandingSummary(db: Executor, clientId?: number) {
  const p = paidSq(db);
  const t = today();
  const where = [inArray(invoices.status, ["issued", "partial"])];
  if (clientId) where.push(eq(invoices.clientId, clientId));
  const [r] = await db
    .select({
      outstanding: sql<number>`coalesce(sum(${invoices.total} - coalesce(${p.paid}, 0)), 0)::bigint`,
      overdue: sql<number>`coalesce(sum(case when ${invoices.dueDate} < ${t} then ${invoices.total} - coalesce(${p.paid}, 0) else 0 end), 0)::bigint`,
      overdueCount: sql<number>`count(*) filter (where ${invoices.dueDate} < ${t})::int`,
    })
    .from(invoices)
    .leftJoin(p, eq(p.invoiceId, invoices.id))
    .where(and(...where));
  return { outstanding: Number(r?.outstanding ?? 0), overdue: Number(r?.overdue ?? 0), overdueCount: r?.overdueCount ?? 0 };
}

export async function collectedBetween(db: Executor, from: string, to: string) {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` })
    .from(payments)
    .where(and(gte(payments.date, from), lte(payments.date, to)));
  return Number(r?.n ?? 0);
}

/** Share of active screens that have at least one booking running on the given day. */
export async function occupancyOn(db: Executor, day = today()) {
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(assets).where(ne(assets.status, "inactive"));
  const [{ busy }] = await db
    .select({ busy: sql<number>`count(distinct ${bookingLines.assetId})::int` })
    .from(bookingLines)
    .innerJoin(bookings, eq(bookings.id, bookingLines.bookingId))
    .where(
      and(
        eq(bookingLines.kind, "media"),
        ne(bookings.status, "cancelled"),
        lte(bookingLines.startDate, day),
        gte(bookingLines.endDate, day),
      ),
    );
  return { total, busy, pct: total ? Math.round((busy / total) * 100) : 0 };
}
