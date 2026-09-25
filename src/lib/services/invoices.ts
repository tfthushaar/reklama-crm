import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { assets, bookingLines, bookings, clients, invoiceLines, invoices, payments, tasks } from "@/db/schema";
import { audit, logActivity } from "../audit";
import { addDays, fmtDay, fmtRange, inr, today } from "../format";
import { nextNumber } from "../numbering";
import { invoiceTotals, isInterState, stateName, type InvoiceLineInput } from "../pricing";
import { getSettings, UserError } from "./common";

export type InvoiceInput = {
  clientId: number;
  bookingId: number | null;
  kind: "tax" | "proforma";
  issueDate: string;
  dueDate: string;
  commissionPct: number;
  notes: string | null;
  lines: InvoiceLineInput[];
  issue: boolean;
};

export async function invoiceDefaultsFromBooking(db: Executor, bookingId: number) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw new UserError("Booking not found");
  const [client] = await db.select().from(clients).where(eq(clients.id, b.clientId));
  const settings = await getSettings(db);
  const rows = await db
    .select({ line: bookingLines, asset: assets })
    .from(bookingLines)
    .leftJoin(assets, eq(assets.id, bookingLines.assetId))
    .where(eq(bookingLines.bookingId, bookingId));
  const lines: InvoiceLineInput[] = rows.map(({ line, asset }) =>
    line.kind === "media"
      ? {
          description: `Display on ${asset?.name} (${asset?.code}), ${fmtRange(line.startDate, line.endDate)} — ${
            line.mode === "slots" ? `${line.slots} slot${(line.slots ?? 1) > 1 ? "s" : ""}` : "exclusive"
          }`,
          amount: line.amount,
          isMedia: true,
        }
      : { description: line.description ?? "Production", amount: line.amount, isMedia: false },
  );
  const issueDate = today();
  const creditDays = client?.creditDays ?? settings.paymentTermsDays;
  return {
    booking: b,
    client: client!,
    lines,
    commissionPct: b.commissionPct,
    issueDate,
    dueDate: addDays(issueDate, creditDays),
  };
}

export async function createInvoice(db: Executor, userId: number, input: InvoiceInput) {
  const lines = input.lines.filter((l) => l.description.trim() && l.amount > 0);
  if (lines.length === 0) throw new UserError("Add at least one line with an amount.");
  const settings = await getSettings(db);
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId));
  if (!client) throw new UserError("Client not found");
  const interState = isInterState(settings.stateCode, client);
  const t = invoiceTotals(lines, input.commissionPct, settings.gstRate, interState);
  const number = input.issue ? await nextNumber(db, input.kind === "tax" ? "invoice" : "proforma", input.issueDate) : null;
  const pos = client.stateCode || client.gstin?.slice(0, 2) || settings.stateCode;

  const [inv] = await db
    .insert(invoices)
    .values({
      number,
      kind: input.kind,
      status: input.issue ? "issued" : "draft",
      clientId: input.clientId,
      bookingId: input.bookingId,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      placeOfSupply: pos ? `${stateName(pos) ?? ""} (${pos})` : null,
      gross: t.gross,
      commissionPct: input.commissionPct,
      commission: t.commission,
      taxable: t.taxable,
      cgst: t.cgst,
      sgst: t.sgst,
      igst: t.igst,
      total: t.total,
      notes: input.notes,
      createdBy: userId,
    })
    .returning();
  await db.insert(invoiceLines).values(
    lines.map((l) => ({ invoiceId: inv!.id, description: l.description, amount: l.amount, isMedia: l.isMedia, sac: settings.sacCode })),
  );
  if (input.issue) await afterIssue(db, userId, inv!.id);
  await audit(db, userId, "create", "invoice", inv!.id, `Created ${input.kind === "tax" ? "invoice" : "proforma"} ${number ?? "(draft)"} for ${inr(t.total)}`);
  return inv!;
}

async function afterIssue(db: Executor, userId: number, invoiceId: number) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return;
  await logActivity(db, {
    clientId: inv.clientId,
    userId,
    type: "system",
    notes: `${inv.kind === "tax" ? "Invoice" : "Proforma invoice"} ${inv.number} raised for ${inr(inv.total)}, due ${fmtDay(inv.dueDate)}`,
    refType: "invoice",
    refId: inv.id,
  });
}

export async function issueInvoice(db: Executor, userId: number, invoiceId: number) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw new UserError("Invoice not found");
  if (inv.status !== "draft") throw new UserError("Only drafts can be issued.");
  const number = await nextNumber(db, inv.kind === "tax" ? "invoice" : "proforma", inv.issueDate);
  await db.update(invoices).set({ number, status: "issued" }).where(eq(invoices.id, invoiceId));
  await afterIssue(db, userId, invoiceId);
  await audit(db, userId, "issue", "invoice", invoiceId, `Issued ${number}`);
}

export async function amountPaid(db: Executor, invoiceId: number) {
  const [r] = await db
    .select({ paid: sql<number>`coalesce(sum(${payments.amount} + ${payments.tds}), 0)::bigint` })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId));
  return Number(r?.paid ?? 0);
}

export type PaymentInput = {
  date: string;
  amount: number;
  tds: number;
  mode: string;
  reference: string | null;
  notes: string | null;
};

export async function recordPayment(db: Executor, userId: number, invoiceId: number, p: PaymentInput) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw new UserError("Invoice not found");
  if (inv.status === "draft") throw new UserError("Issue the invoice before recording payments.");
  if (inv.status === "cancelled") throw new UserError("This invoice is cancelled.");
  if (p.amount <= 0 && p.tds <= 0) throw new UserError("Enter the amount received.");
  const paid = await amountPaid(db, invoiceId);
  const balance = inv.total - paid;
  if (p.amount + p.tds > balance + 100) throw new UserError(`That's more than the balance of ${inr(balance)}.`);

  const receiptNumber = await nextNumber(db, "receipt", p.date);
  const [pay] = await db
    .insert(payments)
    .values({ invoiceId, clientId: inv.clientId, receiptNumber, recordedBy: userId, ...p })
    .returning();
  const nowPaid = paid + p.amount + p.tds;
  const status = nowPaid >= inv.total - 100 ? "paid" : "partial";
  await db.update(invoices).set({ status }).where(eq(invoices.id, invoiceId));
  if (status === "paid") {
    await db
      .update(tasks)
      .set({ status: "done", completedAt: new Date(), outcome: "Paid in full" })
      .where(and(eq(tasks.autoKey, `collect-${invoiceId}`), eq(tasks.status, "open")));
  }
  await logActivity(db, {
    clientId: inv.clientId,
    userId,
    type: "system",
    notes: `Payment of ${inr(p.amount)}${p.tds ? ` (+ ${inr(p.tds)} TDS)` : ""} received against ${inv.number} by ${p.mode}. Receipt ${receiptNumber}.`,
    refType: "invoice",
    refId: invoiceId,
  });
  await audit(db, userId, "payment", "invoice", invoiceId, `Recorded ${inr(p.amount)} on ${inv.number} (${receiptNumber})`);
  return pay!;
}

export async function convertProforma(db: Executor, userId: number, invoiceId: number) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv || inv.kind !== "proforma") throw new UserError("Only proforma invoices can be converted.");
  if (inv.status === "draft" || inv.status === "cancelled") throw new UserError("Issue the proforma first.");
  const number = await nextNumber(db, "invoice");
  await db
    .update(invoices)
    .set({
      kind: "tax",
      number,
      issueDate: today(),
      notes: [inv.notes, `Converted from proforma ${inv.number}`].filter(Boolean).join("\n"),
    })
    .where(eq(invoices.id, invoiceId));
  await logActivity(db, {
    clientId: inv.clientId,
    userId,
    type: "system",
    notes: `Proforma ${inv.number} converted to tax invoice ${number}`,
    refType: "invoice",
    refId: invoiceId,
  });
  await audit(db, userId, "convert", "invoice", invoiceId, `Converted ${inv.number} → ${number}`);
}

export async function cancelInvoice(db: Executor, userId: number, invoiceId: number, reason: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw new UserError("Invoice not found");
  if ((await amountPaid(db, invoiceId)) > 0) throw new UserError("This invoice has payments. Issue a credit note instead.");
  await db.update(invoices).set({ status: "cancelled", cancelReason: reason }).where(eq(invoices.id, invoiceId));
  await audit(db, userId, "cancel", "invoice", invoiceId, `Cancelled ${inv.number ?? "draft"}: ${reason}`);
}
