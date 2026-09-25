import { and, asc, eq, inArray } from "drizzle-orm";
import type { Executor } from "@/db";
import { assets, clients, holds, quoteLines, quoteVersions, quotes, tasks, users } from "@/db/schema";
import { audit, logActivity } from "../audit";
import { capacityOf } from "../availability";
import { addDays, inr, istDateTime, today } from "../format";
import { nextNumber } from "../numbering";
import { discountLimit } from "../permissions";
import { computeTotals, isInterState, priceLine, type LineInput } from "../pricing";
import { firstUserWithRole, getSettings, getUser, UserError } from "./common";

export type QuoteInput = {
  clientId: number;
  title: string;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  commissionPct: number;
  lines: LineInput[];
};

export async function priceQuote(db: Executor, input: Pick<QuoteInput, "clientId" | "commissionPct" | "lines">) {
  const settings = await getSettings(db);
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId));
  if (!client) throw new UserError("Client not found");
  const priced = input.lines.map(priceLine);
  const totals = computeTotals(priced, {
    commissionPct: input.commissionPct,
    gstRate: settings.gstRate,
    interState: isInterState(settings.stateCode, client),
  });
  return { priced, totals, settings, client };
}

async function validateLines(db: Executor, lines: LineInput[]) {
  const media = lines.filter((l) => l.kind === "media");
  if (media.length === 0) throw new UserError("Add at least one screen to the quote.");
  const ids = [...new Set(media.map((l) => l.assetId))];
  const rows = await db.select().from(assets).where(inArray(assets.id, ids));
  const byId = new Map(rows.map((a) => [a.id, a]));
  for (const l of media) {
    const a = byId.get(l.assetId);
    if (!a) throw new UserError("One of the selected screens no longer exists.");
    if (!l.startDate || !l.endDate || l.endDate < l.startDate) throw new UserError(`Check the dates for ${a.name}.`);
    if (l.mode === "slots" && a.saleMode === "exclusive") throw new UserError(`${a.name} is sold exclusively only.`);
    if (l.mode === "exclusive" && a.saleMode === "slots") throw new UserError(`${a.name} is sold by slots only.`);
    if (l.mode === "slots" && (l.slots < 1 || l.slots > capacityOf(a)))
      throw new UserError(`${a.name} has ${capacityOf(a)} slots — pick between 1 and ${capacityOf(a)}.`);
  }
}

async function writeVersion(db: Executor, quoteId: number, version: number, userId: number, input: QuoteInput) {
  const { priced, totals } = await priceQuote(db, input);
  const [v] = await db
    .insert(quoteVersions)
    .values({
      quoteId,
      version,
      mediaGross: totals.mediaGross,
      discountTotal: totals.discountTotal,
      commissionPct: totals.commissionPct,
      commission: totals.commission,
      production: totals.production,
      taxable: totals.taxable,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      total: totals.total,
      maxDiscountPct: totals.maxDiscountPct,
      notes: input.notes,
      terms: input.terms,
      createdBy: userId,
    })
    .returning();
  await db.insert(quoteLines).values(
    priced.map((l) =>
      l.kind === "media"
        ? {
            versionId: v!.id,
            kind: "media" as const,
            assetId: l.assetId,
            startDate: l.startDate,
            endDate: l.endDate,
            days: l.days,
            mode: l.mode,
            slots: l.mode === "slots" ? l.slots : null,
            rate: l.rate,
            gross: l.gross,
            discountPct: l.discountPct,
            amount: l.amount,
          }
        : {
            versionId: v!.id,
            kind: "production" as const,
            description: l.description,
            qty: l.qty,
            rate: l.rate,
            gross: l.gross,
            discountPct: l.discountPct,
            amount: l.amount,
          },
    ),
  );
  return { version: v!, totals };
}

async function requestApprovalIfNeeded(
  db: Executor,
  userId: number,
  quote: { id: number; number: string; clientId: number },
  version: number,
  maxDiscountPct: number,
) {
  const user = await getUser(db, userId);
  const settings = await getSettings(db);
  const limit = discountLimit(user.role, settings);
  if (maxDiscountPct <= limit) return false;
  await db.update(quotes).set({ status: "pending_approval" }).where(eq(quotes.id, quote.id));
  const approver =
    maxDiscountPct <= settings.managerDiscountLimit && user.role === "sales_exec"
      ? await firstUserWithRole(db, "sales_manager")
      : await firstUserWithRole(db, "owner");
  if (approver) {
    await db
      .insert(tasks)
      .values({
        clientId: quote.clientId,
        assignedTo: approver.id,
        createdBy: userId,
        title: `Approve ${maxDiscountPct}% discount on ${quote.number}`,
        dueAt: new Date(Date.now() + 4 * 3600_000),
        priority: "high",
        refType: "quote",
        refId: quote.id,
        autoKey: `approve-${quote.id}-v${version}`,
      })
      .onConflictDoNothing();
  }
  return true;
}

export async function createQuote(db: Executor, userId: number, input: QuoteInput) {
  await validateLines(db, input.lines);
  const settings = await getSettings(db);
  const number = await nextNumber(db, "quote");
  const [q] = await db
    .insert(quotes)
    .values({
      number,
      clientId: input.clientId,
      createdBy: userId,
      title: input.title || "Campaign proposal",
      status: "draft",
      currentVersion: 1,
      validUntil: input.validUntil || addDays(today(), settings.quoteValidityDays),
    })
    .returning();
  const { totals } = await writeVersion(db, q!.id, 1, userId, input);
  const needsApproval = await requestApprovalIfNeeded(db, userId, q!, 1, totals.maxDiscountPct);
  await audit(db, userId, "create", "quote", q!.id, `Created quote ${number} (${inr(totals.total)})`);
  return { quoteId: q!.id, needsApproval };
}

/** Edits an unsent draft in place, or creates a new version when the quote was already sent. */
export async function updateQuote(db: Executor, userId: number, quoteId: number, input: QuoteInput) {
  await validateLines(db, input.lines);
  const [q] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!q) throw new UserError("Quote not found");
  if (q.bookingId) throw new UserError("This quote is already booked and can't be changed.");

  let versionNo = q.currentVersion;
  const [current] = await db
    .select()
    .from(quoteVersions)
    .where(and(eq(quoteVersions.quoteId, quoteId), eq(quoteVersions.version, q.currentVersion)));
  const wasSent = !!current?.sentVia || q.status === "sent" || q.status === "rejected" || q.status === "expired";

  if (wasSent) {
    versionNo = q.currentVersion + 1;
    await releaseHolds(db, quoteId);
  } else if (current) {
    await db.delete(quoteVersions).where(eq(quoteVersions.id, current.id));
  }

  const { totals } = await writeVersion(db, quoteId, versionNo, userId, input);
  await db
    .update(quotes)
    .set({
      title: input.title || q.title,
      validUntil: input.validUntil || q.validUntil,
      currentVersion: versionNo,
      status: "draft",
      updatedAt: new Date(),
    })
    .where(eq(quotes.id, quoteId));
  const needsApproval = await requestApprovalIfNeeded(db, userId, q, versionNo, totals.maxDiscountPct);
  await audit(
    db,
    userId,
    wasSent ? "revise" : "update",
    "quote",
    quoteId,
    wasSent ? `Revised ${q.number} to version ${versionNo}` : `Edited draft ${q.number}`,
  );
  return { quoteId, version: versionNo, needsApproval };
}

export async function currentVersionOf(db: Executor, quoteId: number) {
  const [q] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!q) throw new UserError("Quote not found");
  const [v] = await db
    .select()
    .from(quoteVersions)
    .where(and(eq(quoteVersions.quoteId, quoteId), eq(quoteVersions.version, q.currentVersion)));
  if (!v) throw new UserError("Quote version missing");
  const lines = await db.select().from(quoteLines).where(eq(quoteLines.versionId, v.id)).orderBy(asc(quoteLines.id));
  return { quote: q, version: v, lines };
}

export async function releaseHolds(db: Executor, quoteId: number) {
  await db
    .update(holds)
    .set({ status: "released" })
    .where(and(eq(holds.quoteId, quoteId), eq(holds.status, "active")));
}

export async function approveQuote(db: Executor, userId: number, quoteId: number) {
  const { quote, version } = await currentVersionOf(db, quoteId);
  if (quote.status !== "pending_approval") throw new UserError("This quote isn't waiting for approval.");
  const approver = await getUser(db, userId);
  const settings = await getSettings(db);
  if (version.maxDiscountPct > discountLimit(approver.role, settings))
    throw new UserError(`Discount of ${version.maxDiscountPct}% is above your approval limit — the owner must approve.`);
  await db.update(quoteVersions).set({ approvedBy: userId, approvedAt: new Date() }).where(eq(quoteVersions.id, version.id));
  await db.update(quotes).set({ status: "draft", updatedAt: new Date() }).where(eq(quotes.id, quoteId));
  await db
    .update(tasks)
    .set({ status: "done", completedAt: new Date(), outcome: "Approved" })
    .where(eq(tasks.autoKey, `approve-${quoteId}-v${version.version}`));
  await notifyTask(db, quote.createdBy, quote, `Discount approved on ${quote.number} — ready to send`);
  await logActivity(db, {
    clientId: quote.clientId,
    userId,
    type: "system",
    notes: `Approved ${version.maxDiscountPct}% discount on ${quote.number} v${version.version}`,
    refType: "quote",
    refId: quoteId,
  });
  await audit(db, userId, "approve", "quote", quoteId, `Approved discount on ${quote.number}`);
}

export async function sendBackQuote(db: Executor, userId: number, quoteId: number, note: string) {
  const { quote, version } = await currentVersionOf(db, quoteId);
  await db.update(quotes).set({ status: "draft", updatedAt: new Date() }).where(eq(quotes.id, quoteId));
  await db
    .update(tasks)
    .set({ status: "done", completedAt: new Date(), outcome: "Sent back" })
    .where(eq(tasks.autoKey, `approve-${quoteId}-v${version.version}`));
  await notifyTask(db, quote.createdBy, quote, `Revise ${quote.number}: ${note || "discount not approved"}`);
  await audit(db, userId, "send_back", "quote", quoteId, `Sent back ${quote.number}: ${note}`);
}

async function notifyTask(db: Executor, assignedTo: number, quote: { id: number; clientId: number }, title: string) {
  await db.insert(tasks).values({
    clientId: quote.clientId,
    assignedTo,
    title,
    dueAt: new Date(Date.now() + 2 * 3600_000),
    priority: "high",
    refType: "quote",
    refId: quote.id,
  });
}

export async function sendQuote(
  db: Executor,
  userId: number,
  quoteId: number,
  opts: { via: "email" | "whatsapp" | "in_person"; to: string | null },
) {
  const { quote, version, lines } = await currentVersionOf(db, quoteId);
  if (quote.status === "pending_approval") throw new UserError("This quote needs approval before it can be sent.");
  if (quote.bookingId) throw new UserError("This quote is already booked.");
  const sender = await getUser(db, userId);
  const settings = await getSettings(db);
  if (version.maxDiscountPct > discountLimit(sender.role, settings) && !version.approvedBy)
    throw new UserError("The discount is above your limit and hasn't been approved yet.");

  await db.update(quoteVersions).set({ sentVia: opts.via, sentTo: opts.to }).where(eq(quoteVersions.id, version.id));
  await db.update(quotes).set({ status: "sent", sentAt: new Date(), updatedAt: new Date() }).where(eq(quotes.id, quoteId));

  await releaseHolds(db, quoteId);
  const expiresAt = new Date(Date.now() + settings.holdHours * 3600_000);
  const media = lines.filter((l) => l.kind === "media" && l.assetId && l.startDate && l.endDate);
  if (media.length) {
    await db.insert(holds).values(
      media.map((l) => ({
        assetId: l.assetId!,
        quoteId,
        clientId: quote.clientId,
        startDate: l.startDate!,
        endDate: l.endDate!,
        slots: l.slots ?? 1,
        exclusive: l.mode !== "slots",
        expiresAt,
        createdBy: userId,
      })),
    );
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, quote.clientId));
  if (client && ["new", "contacted", "qualified", "meeting"].includes(client.stage)) {
    await db.update(clients).set({ stage: "proposal", updatedAt: new Date() }).where(eq(clients.id, client.id));
  }

  const viaLabel = opts.via === "email" ? "email" : opts.via === "whatsapp" ? "WhatsApp" : "in person";
  await logActivity(db, {
    clientId: quote.clientId,
    userId,
    type: opts.via === "email" ? "email" : opts.via === "whatsapp" ? "whatsapp" : "meeting",
    direction: "out",
    outcome: "Quote sent",
    notes: `Sent ${quote.number}${version.version > 1 ? ` (version ${version.version})` : ""} by ${viaLabel} — ${inr(version.total)}. Screens held for ${settings.holdHours} hours.`,
    refType: "quote",
    refId: quoteId,
  });

  await db
    .insert(tasks)
    .values({
      clientId: quote.clientId,
      assignedTo: quote.createdBy,
      createdBy: userId,
      title: `Follow up on quote ${quote.number}`,
      dueAt: istDateTime(addDays(today(), 2), "11:00"),
      priority: "normal",
      refType: "quote",
      refId: quoteId,
      autoKey: `quote-followup-${quoteId}-v${version.version}`,
    })
    .onConflictDoNothing();

  await audit(db, userId, "send", "quote", quoteId, `Sent ${quote.number} v${version.version} by ${viaLabel}`);
}

export async function rejectQuote(db: Executor, userId: number, quoteId: number, reason: string) {
  const [q] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!q) throw new UserError("Quote not found");
  await db
    .update(quotes)
    .set({ status: "rejected", rejectReason: reason, respondedAt: new Date(), updatedAt: new Date() })
    .where(eq(quotes.id, quoteId));
  await releaseHolds(db, quoteId);
  await logActivity(db, {
    clientId: q.clientId,
    userId,
    type: "system",
    notes: `Quote ${q.number} rejected${reason ? `: ${reason}` : ""}`,
    refType: "quote",
    refId: quoteId,
  });
  await audit(db, userId, "reject", "quote", quoteId, `Marked ${q.number} rejected`);
}

export async function quoteCreatorName(db: Executor, id: number) {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, id));
  return u?.name ?? "";
}
