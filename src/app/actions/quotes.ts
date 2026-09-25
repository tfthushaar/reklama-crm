"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { holds, quoteLines, quoteVersions, quotes, tasks } from "@/db/schema";
import { requirePerm, requireUser } from "@/lib/auth";
import { form, run } from "@/lib/action";
import { loadAvailability } from "@/lib/availability";
import { fmtDay } from "@/lib/format";
import type { LineInput } from "@/lib/pricing";
import { UserError } from "@/lib/services/common";
import { bookQuote } from "@/lib/services/bookings";
import { approveQuote, createQuote, rejectQuote, sendBackQuote, sendQuote, updateQuote, type QuoteInput } from "@/lib/services/quotes";

type Payload = {
  quoteId?: number;
  clientId: number;
  title: string;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  commissionPct: number;
  lines: {
    kind: "media" | "production";
    assetId?: number;
    startDate?: string;
    endDate?: string;
    mode?: "exclusive" | "slots";
    slots?: number;
    rate: number; // rupees
    qty?: number;
    discountPct?: number;
    description?: string;
  }[];
};

function toInput(p: Payload): QuoteInput {
  if (!p.clientId) throw new UserError("Choose who this quote is for.");
  const lines: LineInput[] = p.lines.map((l) => {
    const rate = Math.round(Number(l.rate || 0) * 100);
    const discountPct = Number(l.discountPct || 0);
    if (l.kind === "media") {
      return {
        kind: "media",
        assetId: Number(l.assetId),
        startDate: String(l.startDate),
        endDate: String(l.endDate),
        mode: l.mode === "slots" ? "slots" : "exclusive",
        slots: Math.max(1, Number(l.slots || 1)),
        rate,
        discountPct,
      };
    }
    if (!l.description?.trim()) throw new UserError("Give each extra charge a description.");
    return { kind: "production", description: l.description.trim(), qty: Number(l.qty || 1), rate, discountPct };
  });
  return {
    clientId: Number(p.clientId),
    title: p.title?.trim() || "Campaign proposal",
    validUntil: p.validUntil || null,
    notes: p.notes?.trim() || null,
    terms: p.terms?.trim() || null,
    commissionPct: Number(p.commissionPct || 0),
    lines,
  };
}

export async function saveQuoteAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("sales");
    const db = await getDb();
    const payload = JSON.parse(String(fd.get("payload") ?? "{}")) as Payload;
    const input = toInput(payload);
    const result = await db.transaction(async (tx) =>
      payload.quoteId ? updateQuote(tx, user.id, Number(payload.quoteId), input) : createQuote(tx, user.id, input),
    );
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: result.needsApproval ? "Saved — sent to your manager for discount approval" : "Quote saved",
      redirectTo: `/quotes/${result.quoteId}`,
    };
  });
}

export type LineCheck = {
  capacity: number;
  freeMin: number;
  freeMinWithHolds: number;
  bookedBy: string | null;
  heldBy: string | null;
};

/** Checks availability for a set of screen/date combinations while building a quote. */
export async function checkAvailabilityAction(
  items: { key: string; assetId: number; start: string; end: string }[],
  excludeQuoteId?: number,
): Promise<Record<string, LineCheck>> {
  await requireUser();
  const db = await getDb();
  const out: Record<string, LineCheck> = {};
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    if (!it.start || !it.end || it.end < it.start) continue;
    const k = `${it.start}|${it.end}`;
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  for (const [k, list] of groups) {
    const [start, end] = k.split("|") as [string, string];
    const av = await loadAvailability(db, [...new Set(list.map((i) => i.assetId))], start, end, { excludeQuoteId });
    for (const it of list) {
      const a = av.get(it.assetId);
      if (!a) continue;
      const b = a.bookings[0];
      const h = a.holds[0];
      out[it.key] = {
        capacity: a.capacity,
        freeMin: a.freeMin,
        freeMinWithHolds: a.freeMinWithHolds,
        bookedBy: b ? `${b.clientName} (till ${fmtDay(b.endDate, { year: false })})` : null,
        heldBy: h ? h.clientName : null,
      };
    }
  }
  return out;
}

export async function sendQuoteAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("sales");
    const db = await getDb();
    const id = form.id(fd);
    const via = (form.str(fd, "via") ?? "email") as "email" | "whatsapp" | "in_person";
    await db.transaction((tx) => sendQuote(tx, user.id, id, { via, to: form.str(fd, "to") }));
    // No revalidatePath here: the send dialog refreshes the page itself after showing the share links.
    return { ok: true, message: "Quote marked as sent — screens are on hold" };
  });
}

export async function approveQuoteAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("approve");
    const db = await getDb();
    await db.transaction((tx) => approveQuote(tx, user.id, form.id(fd)));
    revalidatePath("/", "layout");
    return { ok: true, message: "Discount approved" };
  });
}

export async function sendBackQuoteAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("approve");
    const db = await getDb();
    await db.transaction((tx) => sendBackQuote(tx, user.id, form.id(fd), form.str(fd, "note") ?? ""));
    revalidatePath("/", "layout");
    return { ok: true, message: "Sent back for changes" };
  });
}

export async function rejectQuoteAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("sales");
    const db = await getDb();
    await db.transaction((tx) => rejectQuote(tx, user.id, form.id(fd), form.str(fd, "reason") ?? ""));
    revalidatePath("/", "layout");
    return { ok: true, message: "Marked as rejected — screens released" };
  });
}

export async function bookQuoteAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const booking = await db.transaction((tx) =>
      bookQuote(tx, user.id, form.id(fd), {
        roNumber: form.str(fd, "roNumber"),
        roDate: form.str(fd, "roDate"),
        advanceAmount: form.money(fd, "advance"),
        paymentTerms: form.str(fd, "paymentTerms"),
        notes: form.str(fd, "notes"),
      }),
    );
    revalidatePath("/", "layout");
    return { ok: true, message: `Booking ${booking.number} confirmed`, redirectTo: `/bookings/${booking.id}` };
  });
}

export async function deleteDraftQuoteAction(fd: FormData) {
  return run(async () => {
    await requirePerm("sales");
    const db = await getDb();
    const id = form.id(fd);
    const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
    if (!q || !["draft", "pending_approval"].includes(q.status) || q.sentAt) throw new UserError("Only unsent drafts can be deleted.");
    await db.transaction(async (tx) => {
      const versionIds = (await tx.select({ id: quoteVersions.id }).from(quoteVersions).where(eq(quoteVersions.quoteId, id))).map((v) => v.id);
      if (versionIds.length) await tx.delete(quoteLines).where(inArray(quoteLines.versionId, versionIds));
      await tx.delete(quoteVersions).where(eq(quoteVersions.quoteId, id));
      await tx.delete(holds).where(eq(holds.quoteId, id));
      await tx.delete(tasks).where(and(eq(tasks.refType, "quote"), eq(tasks.refId, id)));
      await tx.delete(quotes).where(and(eq(quotes.id, id), ne(quotes.status, "accepted")));
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Draft deleted", redirectTo: "/quotes" };
  });
}
