import { and, asc, eq, gt, gte, inArray, lte, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { assets, bookingLines, bookings, clients, holds, quotes, tasks } from "@/db/schema";
import { audit, logActivity } from "../audit";
import { capacityOf, loadAvailability, unitsNeeded } from "../availability";
import { BOOKING_STATUS, BOOKING_STEPS } from "../constants";
import { addDays, daysBetween, fmtDay, fmtRange, inr, istDateTime, today } from "../format";
import { nextNumber } from "../numbering";
import { computeTotals, isInterState, roundRupee } from "../pricing";
import { firstUserWithRole, getSettings, UserError } from "./common";
import { currentVersionOf } from "./quotes";

export type BookInput = {
  roNumber: string | null;
  roDate: string | null;
  advanceAmount: number | null;
  paymentTerms: string | null;
  notes: string | null;
};

async function lockAssets(db: Executor, ids: number[]) {
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    await db.execute(sql`SELECT pg_advisory_xact_lock(${1000000 + id})`);
  }
}

function describeOccupant(o: { clientName: string; number: string; startDate: string; endDate: string }) {
  return `${o.clientName} (${o.number}, ${fmtRange(o.startDate, o.endDate)})`;
}

/** Must run inside a transaction. */
export async function bookQuote(db: Executor, userId: number, quoteId: number, input: BookInput) {
  const { quote, version, lines } = await currentVersionOf(db, quoteId);
  if (quote.bookingId) throw new UserError("This quote has already been booked.");
  if (quote.status === "pending_approval") throw new UserError("This quote needs discount approval first.");
  if (quote.status === "rejected") throw new UserError("This quote was rejected. Revise it before booking.");

  const media = lines.filter((l) => l.kind === "media" && l.assetId && l.startDate && l.endDate);
  if (media.length === 0) throw new UserError("There are no screens on this quote.");

  const assetRows = await db.select().from(assets).where(inArray(assets.id, media.map((l) => l.assetId!)));
  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  await lockAssets(db, media.map((l) => l.assetId!));

  const number = await nextNumber(db, "booking");
  const startDate = media.reduce((m, l) => (l.startDate! < m ? l.startDate! : m), media[0]!.startDate!);
  const endDate = media.reduce((m, l) => (l.endDate! > m ? l.endDate! : m), media[0]!.endDate!);
  const ops = await firstUserWithRole(db, "operations");

  const [booking] = await db
    .insert(bookings)
    .values({
      number,
      clientId: quote.clientId,
      quoteId,
      versionId: version.id,
      title: quote.title,
      status: "confirmed",
      startDate,
      endDate,
      roNumber: input.roNumber,
      roDate: input.roDate,
      advanceAmount: input.advanceAmount,
      paymentTerms: input.paymentTerms,
      notes: input.notes,
      ownerId: ops?.id ?? userId,
      commissionPct: version.commissionPct,
      total: version.total,
      createdBy: userId,
    })
    .returning();

  const problems: string[] = [];
  for (const l of media) {
    const asset = assetById.get(l.assetId!)!;
    const cap = capacityOf(asset);
    const mode = l.mode ?? "exclusive";
    const needed = unitsNeeded(mode, l.slots ?? 1, cap);
    const av = (await loadAvailability(db, [asset.id], l.startDate!, l.endDate!)).get(asset.id)!;
    if (av.freeMin < needed) {
      const who = av.bookings.map(describeOccupant).join("; ");
      problems.push(
        mode === "slots" && av.freeMin > 0
          ? `${asset.name}: only ${av.freeMin} of ${cap} slots are free — booked by ${who}`
          : `${asset.name} is already booked by ${who}`,
      );
      continue;
    }
    await db.insert(bookingLines).values({
      bookingId: booking!.id,
      kind: "media",
      assetId: asset.id,
      startDate: l.startDate,
      endDate: l.endDate,
      mode,
      slots: mode === "slots" ? l.slots : null,
      amount: l.amount,
    });
  }
  if (problems.length) throw new UserError(`Can't confirm — ${problems.join(". ")}.`);

  for (const l of lines.filter((x) => x.kind === "production")) {
    await db.insert(bookingLines).values({
      bookingId: booking!.id,
      kind: "production",
      description: l.description,
      amount: l.amount,
    });
  }

  await db
    .update(holds)
    .set({ status: "converted" })
    .where(and(eq(holds.quoteId, quoteId), eq(holds.status, "active")));
  await db
    .update(quotes)
    .set({ status: "accepted", bookingId: booking!.id, respondedAt: new Date(), updatedAt: new Date() })
    .where(eq(quotes.id, quoteId));
  await db.update(clients).set({ stage: "won", updatedAt: new Date() }).where(eq(clients.id, quote.clientId));

  await bumpCompetingHolds(db, media.map((l) => l.assetId!), startDate, endDate, quoteId);

  await logActivity(db, {
    clientId: quote.clientId,
    userId,
    type: "system",
    notes: `Booking ${number} confirmed — ${media.length} screen${media.length > 1 ? "s" : ""}, ${fmtRange(startDate, endDate)}, ${inr(version.total)}`,
    refType: "booking",
    refId: booking!.id,
  });

  if (ops) {
    await db
      .insert(tasks)
      .values({
        clientId: quote.clientId,
        assignedTo: ops.id,
        createdBy: userId,
        title: `Collect creative for ${number} (starts ${fmtDay(startDate, { year: false })})`,
        dueAt: istDateTime(addDays(today(), 1), "11:00"),
        priority: "high",
        refType: "booking",
        refId: booking!.id,
        autoKey: `creative-${booking!.id}`,
      })
      .onConflictDoNothing();
  }

  await audit(db, userId, "create", "booking", booking!.id, `Confirmed booking ${number} from ${quote.number}`);
  return booking!;
}

/** Releases other clients' holds that can no longer fit, and tells their owners. */
async function bumpCompetingHolds(db: Executor, assetIds: number[], start: string, end: string, exceptQuoteId: number) {
  const competing = await db
    .select({ hold: holds, quoteNumber: quotes.number, createdBy: quotes.createdBy })
    .from(holds)
    .innerJoin(quotes, eq(quotes.id, holds.quoteId))
    .where(
      and(
        inArray(holds.assetId, assetIds),
        eq(holds.status, "active"),
        gt(holds.expiresAt, new Date()),
        ne(holds.quoteId, exceptQuoteId),
        lte(holds.startDate, end),
        gte(holds.endDate, start),
      ),
    );
  for (const c of competing) {
    const av = (await loadAvailability(db, [c.hold.assetId], c.hold.startDate, c.hold.endDate)).get(c.hold.assetId)!;
    const needed = c.hold.exclusive ? av.capacity : c.hold.slots;
    if (av.freeMin >= needed) continue;
    await db.update(holds).set({ status: "released" }).where(eq(holds.id, c.hold.id));
    const [asset] = await db.select({ name: assets.name }).from(assets).where(eq(assets.id, c.hold.assetId));
    await db.insert(tasks).values({
      clientId: c.hold.clientId,
      assignedTo: c.createdBy,
      title: `${asset?.name} was booked by another client — update quote ${c.quoteNumber}`,
      dueAt: new Date(Date.now() + 3600_000),
      priority: "high",
      refType: "quote",
      refId: c.hold.quoteId,
    });
  }
}

export async function recalcBookingTotal(db: Executor, bookingId: number) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) return;
  const [client] = await db.select().from(clients).where(eq(clients.id, b.clientId));
  const settings = await getSettings(db);
  const lines = await db.select().from(bookingLines).where(eq(bookingLines.bookingId, bookingId));
  const totals = computeTotals(
    lines.map((l) =>
      l.kind === "media"
        ? {
            kind: "media" as const,
            assetId: l.assetId!,
            startDate: l.startDate!,
            endDate: l.endDate!,
            mode: l.mode ?? "exclusive",
            slots: l.slots ?? 1,
            rate: 0,
            discountPct: 0,
            days: 0,
            gross: l.amount,
            amount: l.amount,
          }
        : { kind: "production" as const, description: l.description ?? "", qty: 1, rate: l.amount, discountPct: 0, days: null, gross: l.amount, amount: l.amount },
    ),
    { commissionPct: b.commissionPct, gstRate: settings.gstRate, interState: isInterState(settings.stateCode, client!) },
  );
  await db.update(bookings).set({ total: totals.total, updatedAt: new Date() }).where(eq(bookings.id, bookingId));
  return totals;
}

export async function extendBooking(db: Executor, userId: number, bookingId: number, newEnd: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw new UserError("Booking not found");
  if (b.status === "cancelled" || b.status === "completed") throw new UserError("Only active bookings can be extended.");
  if (newEnd <= b.endDate) throw new UserError("Pick a date after the current end date.");

  const lines = await db
    .select()
    .from(bookingLines)
    .where(and(eq(bookingLines.bookingId, bookingId), eq(bookingLines.kind, "media"), eq(bookingLines.endDate, b.endDate)));
  await lockAssets(db, lines.map((l) => l.assetId!));
  const assetRows = await db.select().from(assets).where(inArray(assets.id, lines.map((l) => l.assetId!)));
  const byId = new Map(assetRows.map((a) => [a.id, a]));
  const extraStart = addDays(b.endDate, 1);
  const problems: string[] = [];

  for (const l of lines) {
    const asset = byId.get(l.assetId!)!;
    const av = (await loadAvailability(db, [asset.id], extraStart, newEnd, { excludeBookingId: bookingId })).get(asset.id)!;
    const needed = unitsNeeded(l.mode ?? "exclusive", l.slots ?? 1, av.capacity);
    if (av.freeMin < needed) {
      problems.push(`${asset.name} is booked by ${av.bookings.map(describeOccupant).join("; ")}`);
      continue;
    }
    const oldDays = daysBetween(l.startDate!, l.endDate!);
    const newDays = daysBetween(l.startDate!, newEnd);
    const amount = roundRupee((l.amount * newDays) / oldDays);
    await db.update(bookingLines).set({ endDate: newEnd, amount }).where(eq(bookingLines.id, l.id));
  }
  if (problems.length) throw new UserError(`Can't extend — ${problems.join(". ")}.`);

  await db.update(bookings).set({ endDate: newEnd, updatedAt: new Date() }).where(eq(bookings.id, bookingId));
  const totals = await recalcBookingTotal(db, bookingId);
  await logActivity(db, {
    clientId: b.clientId,
    userId,
    type: "system",
    notes: `Extended ${b.number} to ${fmtRange(b.startDate, newEnd)} — new total ${inr(totals?.total)}`,
    refType: "booking",
    refId: bookingId,
  });
  await audit(db, userId, "extend", "booking", bookingId, `Extended ${b.number} to ${newEnd}`);
}

export async function cancelBooking(db: Executor, userId: number, bookingId: number, reason: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw new UserError("Booking not found");
  await db
    .update(bookings)
    .set({ status: "cancelled", cancelReason: reason, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));
  await logActivity(db, {
    clientId: b.clientId,
    userId,
    type: "system",
    notes: `Booking ${b.number} cancelled${reason ? `: ${reason}` : ""}. Screens released.`,
    refType: "booking",
    refId: bookingId,
  });
  await audit(db, userId, "cancel", "booking", bookingId, `Cancelled ${b.number}: ${reason}`);
}

export async function advanceBooking(db: Executor, userId: number, bookingId: number) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw new UserError("Booking not found");
  const idx = BOOKING_STEPS.findIndex((s) => s.key === b.status);
  const next = BOOKING_STEPS[idx + 1];
  if (idx < 0 || !next) throw new UserError("This booking can't move forward.");
  await db.update(bookings).set({ status: next.key, updatedAt: new Date() }).where(eq(bookings.id, bookingId));
  if (next.key === "creative_received") {
    await db
      .update(tasks)
      .set({ status: "done", completedAt: new Date(), outcome: "Creative received" })
      .where(eq(tasks.autoKey, `creative-${bookingId}`));
  }
  await logActivity(db, {
    clientId: b.clientId,
    userId,
    type: "system",
    notes: `${b.number}: ${BOOKING_STATUS[next.key].label}`,
    refType: "booking",
    refId: bookingId,
  });
  await audit(db, userId, "status", "booking", bookingId, `${b.number} → ${next.key}`);
}

export async function bookingLinesWithAssets(db: Executor, bookingId: number) {
  return db
    .select({ line: bookingLines, asset: assets })
    .from(bookingLines)
    .leftJoin(assets, eq(assets.id, bookingLines.assetId))
    .where(eq(bookingLines.bookingId, bookingId))
    .orderBy(asc(bookingLines.id));
}
