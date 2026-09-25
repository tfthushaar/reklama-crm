import { and, eq, gte, inArray, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { assets, bookings, clients, holds, invoices, quotes, tasks } from "@/db/schema";
import { addDays, fmtDay, inr, istDateTime, today } from "../format";
import { firstUserWithRole } from "./common";

const g = globalThis as unknown as { __rkHousekeepingAt?: number };

/** Expires stale holds/quotes, completes finished campaigns and creates automatic reminder tasks. */
export async function runHousekeeping(db: Executor, force = false) {
  const now = Date.now();
  if (!force && g.__rkHousekeepingAt && now - g.__rkHousekeepingAt < 60_000) return;
  g.__rkHousekeepingAt = now;
  const t = today();

  await db
    .update(holds)
    .set({ status: "released" })
    .where(and(eq(holds.status, "active"), lt(holds.expiresAt, new Date())));

  const expired = await db
    .update(quotes)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(quotes.status, "sent"), lt(quotes.validUntil, t)))
    .returning({ id: quotes.id });
  if (expired.length) {
    await db
      .update(holds)
      .set({ status: "released" })
      .where(and(eq(holds.status, "active"), inArray(holds.quoteId, expired.map((q) => q.id))));
  }

  await db
    .update(bookings)
    .set({ status: "completed", updatedAt: new Date() })
    .where(and(eq(bookings.status, "live"), lt(bookings.endDate, t)));

  const owner = await firstUserWithRole(db, "owner");
  const ops = await firstUserWithRole(db, "operations");
  const accounts = await firstUserWithRole(db, "accounts");
  const newTasks: (typeof tasks.$inferInsert)[] = [];

  // Holds expiring in the next 24 hours
  const expiring = await db
    .select({ quoteId: quotes.id, number: quotes.number, clientId: quotes.clientId, createdBy: quotes.createdBy, v: quotes.currentVersion })
    .from(holds)
    .innerJoin(quotes, eq(quotes.id, holds.quoteId))
    .where(
      and(
        eq(holds.status, "active"),
        lte(holds.expiresAt, new Date(now + 24 * 3600_000)),
        eq(quotes.status, "sent"),
      ),
    )
    .groupBy(quotes.id);
  for (const h of expiring) {
    newTasks.push({
      clientId: h.clientId,
      assignedTo: h.createdBy,
      title: `Screens on hold for ${h.number} expire soon — get a decision`,
      dueAt: new Date(now + 2 * 3600_000),
      priority: "high",
      refType: "quote",
      refId: h.quoteId,
      autoKey: `hold-${h.quoteId}-v${h.v}`,
    });
  }

  // Campaigns ending within 15 days → renewal
  const ending = await db
    .select({ b: bookings, ownerId: clients.ownerId })
    .from(bookings)
    .innerJoin(clients, eq(clients.id, bookings.clientId))
    .where(
      and(
        inArray(bookings.status, ["confirmed", "creative_received", "creative_approved", "live"]),
        gte(bookings.endDate, t),
        lte(bookings.endDate, addDays(t, 15)),
      ),
    );
  for (const { b, ownerId } of ending) {
    newTasks.push({
      clientId: b.clientId,
      assignedTo: ownerId ?? owner!.id,
      title: `Renewal: ${b.title} ends ${fmtDay(b.endDate, { year: false })} — offer an extension`,
      dueAt: istDateTime(t, "12:00"),
      priority: "normal",
      refType: "booking",
      refId: b.id,
      autoKey: `renewal-${b.id}`,
    });
  }

  // Overdue invoices → collection call
  const overdue = await db
    .select({ inv: invoices, ownerId: clients.ownerId })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(inArray(invoices.status, ["issued", "partial"]), lt(invoices.dueDate, t), isNotNull(invoices.number)));
  for (const { inv, ownerId } of overdue) {
    newTasks.push({
      clientId: inv.clientId,
      assignedTo: accounts?.id ?? ownerId ?? owner!.id,
      title: `Collect payment: ${inv.number} (${inr(inv.total)}) was due ${fmtDay(inv.dueDate, { year: false })}`,
      dueAt: istDateTime(t, "11:00"),
      priority: "high",
      refType: "invoice",
      refId: inv.id,
      autoKey: `collect-${inv.id}`,
    });
  }

  // Permits and leases expiring
  const expiringAssets = await db
    .select()
    .from(assets)
    .where(
      and(
        ne(assets.status, "inactive"),
        sql`(${assets.permitExpiry} <= ${addDays(t, 30)} OR ${assets.leaseEnd} <= ${addDays(t, 60)})`,
      ),
    );
  for (const a of expiringAssets) {
    if (a.permitExpiry && a.permitExpiry <= addDays(t, 30)) {
      newTasks.push({
        assignedTo: ops?.id ?? owner!.id,
        title: `Renew permit for ${a.name} — ${a.permitExpiry < t ? "expired" : "expires"} ${fmtDay(a.permitExpiry)}`,
        dueAt: istDateTime(t, "10:00"),
        priority: "high",
        refType: "asset",
        refId: a.id,
        autoKey: `permit-${a.id}-${a.permitExpiry}`,
      });
    }
    if (a.leaseEnd && a.leaseEnd <= addDays(t, 60)) {
      newTasks.push({
        assignedTo: owner?.id ?? ops!.id,
        title: `Lease for ${a.name} ends ${fmtDay(a.leaseEnd)} — renew with site owner`,
        dueAt: istDateTime(t, "10:00"),
        priority: "normal",
        refType: "asset",
        refId: a.id,
        autoKey: `lease-${a.id}-${a.leaseEnd}`,
      });
    }
  }

  if (newTasks.length) await db.insert(tasks).values(newTasks).onConflictDoNothing();
}
