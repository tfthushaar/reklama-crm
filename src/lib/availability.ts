import { and, eq, gt, gte, inArray, lte, ne, type SQL } from "drizzle-orm";
import type { Executor } from "@/db";
import { assets, bookingLines, bookings, clients, holds, quotes } from "@/db/schema";
import { eachDay } from "./format";

export function capacityOf(a: { type: "led" | "hoarding"; totalSlots: number }) {
  return a.type === "hoarding" ? 1 : Math.max(1, a.totalSlots);
}

export type Occupant = {
  kind: "booking" | "hold";
  refId: number;
  number: string;
  clientId: number;
  clientName: string;
  startDate: string;
  endDate: string;
  exclusive: boolean;
  slots: number;
  expiresAt?: Date;
};

export type AssetAvailability = {
  assetId: number;
  capacity: number;
  freeMin: number;
  freeMinWithHolds: number;
  bookings: Occupant[];
  holds: Occupant[];
  byDay: Map<string, { used: number; held: number }>;
};

export type AvailabilityStatus = "available" | "held" | "partial" | "booked";

export async function loadAvailability(
  db: Executor,
  assetIds: number[] | "all",
  start: string,
  end: string,
  opts: { excludeQuoteId?: number; excludeBookingId?: number } = {},
): Promise<Map<number, AssetAvailability>> {
  const result = new Map<number, AssetAvailability>();
  if (assetIds !== "all" && assetIds.length === 0) return result;

  const assetFilter = assetIds === "all" ? undefined : inArray(assets.id, assetIds);
  const assetRows = await db
    .select({ id: assets.id, type: assets.type, totalSlots: assets.totalSlots })
    .from(assets)
    .where(assetFilter);

  const ids = assetRows.map((a) => a.id);
  if (ids.length === 0) return result;

  const bookingWhere: SQL[] = [
    inArray(bookingLines.assetId, ids),
    eq(bookingLines.kind, "media"),
    ne(bookings.status, "cancelled"),
    lte(bookingLines.startDate, end),
    gte(bookingLines.endDate, start),
  ];
  if (opts.excludeBookingId) bookingWhere.push(ne(bookings.id, opts.excludeBookingId));

  const bookedRows = await db
    .select({
      assetId: bookingLines.assetId,
      startDate: bookingLines.startDate,
      endDate: bookingLines.endDate,
      mode: bookingLines.mode,
      slots: bookingLines.slots,
      bookingId: bookings.id,
      number: bookings.number,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(bookingLines)
    .innerJoin(bookings, eq(bookings.id, bookingLines.bookingId))
    .innerJoin(clients, eq(clients.id, bookings.clientId))
    .where(and(...bookingWhere));

  const holdWhere: SQL[] = [
    inArray(holds.assetId, ids),
    eq(holds.status, "active"),
    gt(holds.expiresAt, new Date()),
    lte(holds.startDate, end),
    gte(holds.endDate, start),
  ];
  if (opts.excludeQuoteId) holdWhere.push(ne(holds.quoteId, opts.excludeQuoteId));

  const heldRows = await db
    .select({
      assetId: holds.assetId,
      startDate: holds.startDate,
      endDate: holds.endDate,
      exclusive: holds.exclusive,
      slots: holds.slots,
      quoteId: quotes.id,
      number: quotes.number,
      clientId: clients.id,
      clientName: clients.name,
      expiresAt: holds.expiresAt,
    })
    .from(holds)
    .innerJoin(quotes, eq(quotes.id, holds.quoteId))
    .innerJoin(clients, eq(clients.id, holds.clientId))
    .where(and(...holdWhere));

  const days = eachDay(start, end);
  for (const a of assetRows) {
    const capacity = capacityOf(a);
    const byDay = new Map(days.map((d) => [d, { used: 0, held: 0 }]));
    const bookingsFor: Occupant[] = [];
    const holdsFor: Occupant[] = [];

    for (const r of bookedRows) {
      if (r.assetId !== a.id || !r.startDate || !r.endDate) continue;
      const exclusive = r.mode !== "slots";
      const units = exclusive ? capacity : Math.min(capacity, r.slots ?? 1);
      bookingsFor.push({
        kind: "booking",
        refId: r.bookingId,
        number: r.number,
        clientId: r.clientId,
        clientName: r.clientName,
        startDate: r.startDate,
        endDate: r.endDate,
        exclusive,
        slots: units,
      });
      for (const d of days) if (d >= r.startDate && d <= r.endDate) byDay.get(d)!.used += units;
    }

    for (const r of heldRows) {
      if (r.assetId !== a.id) continue;
      const units = r.exclusive ? capacity : Math.min(capacity, r.slots);
      holdsFor.push({
        kind: "hold",
        refId: r.quoteId,
        number: r.number,
        clientId: r.clientId,
        clientName: r.clientName,
        startDate: r.startDate,
        endDate: r.endDate,
        exclusive: r.exclusive,
        slots: units,
        expiresAt: r.expiresAt,
      });
      for (const d of days) if (d >= r.startDate && d <= r.endDate) byDay.get(d)!.held += units;
    }

    let freeMin = capacity;
    let freeMinWithHolds = capacity;
    for (const v of byDay.values()) {
      freeMin = Math.min(freeMin, capacity - v.used);
      freeMinWithHolds = Math.min(freeMinWithHolds, capacity - v.used - v.held);
    }

    result.set(a.id, {
      assetId: a.id,
      capacity,
      freeMin: Math.max(0, freeMin),
      freeMinWithHolds: Math.max(0, freeMinWithHolds),
      bookings: bookingsFor,
      holds: holdsFor,
      byDay,
    });
  }
  return result;
}

export function statusFor(av: AssetAvailability | undefined, needed: number): AvailabilityStatus {
  if (!av) return "available";
  if (av.freeMin < needed) return av.freeMin > 0 ? "partial" : "booked";
  if (av.freeMinWithHolds < needed) return "held";
  return "available";
}

export function unitsNeeded(mode: "exclusive" | "slots", slots: number, capacity: number) {
  return mode === "exclusive" ? capacity : Math.max(1, Math.min(slots, capacity));
}
