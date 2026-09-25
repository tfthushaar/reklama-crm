"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { requirePerm, requireUser } from "@/lib/auth";
import { form, run } from "@/lib/action";
import { logActivity } from "@/lib/audit";
import { fmtDay, inr, today } from "@/lib/format";
import { UserError } from "@/lib/services/common";
import { cancelInvoice, convertProforma, createInvoice, issueInvoice, recordPayment } from "@/lib/services/invoices";

type Payload = {
  clientId: number;
  bookingId: number | null;
  kind: "tax" | "proforma";
  issueDate: string;
  dueDate: string;
  commissionPct: number;
  notes: string;
  lines: { description: string; amount: number; isMedia: boolean }[];
};

export async function createInvoiceAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("finance");
    const db = await getDb();
    const p = JSON.parse(String(fd.get("payload") ?? "{}")) as Payload;
    const issue = fd.get("issue") === "1";
    if (!p.clientId) throw new UserError("Choose the client to bill.");
    if (!p.issueDate || !p.dueDate) throw new UserError("Set the invoice and due dates.");
    if (p.dueDate < p.issueDate) throw new UserError("The due date can't be before the invoice date.");
    const inv = await db.transaction((tx) =>
      createInvoice(tx, user.id, {
        clientId: Number(p.clientId),
        bookingId: p.bookingId ? Number(p.bookingId) : null,
        kind: p.kind === "proforma" ? "proforma" : "tax",
        issueDate: p.issueDate,
        dueDate: p.dueDate,
        commissionPct: Number(p.commissionPct || 0),
        notes: p.notes?.trim() || null,
        lines: p.lines.map((l) => ({ description: String(l.description ?? ""), amount: Math.round(Number(l.amount || 0) * 100), isMedia: !!l.isMedia })),
        issue,
      }),
    );
    revalidatePath("/", "layout");
    return { ok: true, message: issue ? `Invoice ${inv.number} issued` : "Draft saved", redirectTo: `/invoices/${inv.id}` };
  });
}

export async function issueInvoiceAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("finance");
    const db = await getDb();
    await db.transaction((tx) => issueInvoice(tx, user.id, form.id(fd)));
    revalidatePath("/", "layout");
    return { ok: true, message: "Invoice issued" };
  });
}

export async function recordPaymentAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("finance");
    const db = await getDb();
    const id = form.id(fd);
    const pay = await db.transaction((tx) =>
      recordPayment(tx, user.id, id, {
        date: form.str(fd, "date") ?? today(),
        amount: form.money(fd, "amount") ?? 0,
        tds: form.money(fd, "tds") ?? 0,
        mode: form.str(fd, "mode") ?? "Bank transfer",
        reference: form.str(fd, "reference"),
        notes: form.str(fd, "notes"),
      }),
    );
    revalidatePath("/", "layout");
    return { ok: true, message: `Payment recorded — receipt ${pay.receiptNumber}` };
  });
}

export async function convertProformaAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("finance");
    const db = await getDb();
    await db.transaction((tx) => convertProforma(tx, user.id, form.id(fd)));
    revalidatePath("/", "layout");
    return { ok: true, message: "Converted to a tax invoice" };
  });
}

export async function cancelInvoiceAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("finance");
    const db = await getDb();
    await db.transaction((tx) => cancelInvoice(tx, user.id, form.id(fd), form.req(fd, "reason", "Reason")));
    revalidatePath("/", "layout");
    return { ok: true, message: "Invoice cancelled" };
  });
}

export async function logReminderAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const id = form.id(fd);
    const via = form.str(fd, "via") === "email" ? "email" : "whatsapp";
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!inv) throw new UserError("Invoice not found");
    await logActivity(db, {
      clientId: inv.clientId,
      userId: user.id,
      type: via,
      direction: "out",
      outcome: "Payment reminder",
      notes: `Reminder sent for ${inv.number} (${inr(inv.total)}, due ${fmtDay(inv.dueDate)})`,
      refType: "invoice",
      refId: id,
    });
    revalidatePath(`/invoices/${id}`);
    return { ok: true, message: "Reminder logged on the client timeline" };
  });
}
