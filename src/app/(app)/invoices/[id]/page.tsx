import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ArrowRightLeft, BellRing, CheckCircle2, FileDown, IndianRupee, Mail, MessageCircle, Send, XCircle } from "lucide-react";
import { getDb } from "@/db";
import { bookings, clients, contacts, invoiceLines, invoices, payments, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { INVOICE_STATUS } from "@/lib/constants";
import { daysBetween, fmtDay, inr, rupeesInWords, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/services/common";
import { ActionButton, ActionForm, Modal } from "@/components/forms";
import { PaymentFields } from "@/components/payment-fields";
import { waLink } from "@/components/activity";
import { BackLink, Stat, StatRow, Badge, Card, CardHeader, EmptyState, Field, Notice, Textarea, buttonClass, cn, table } from "@/components/ui";
import {
  cancelInvoiceAction,
  convertProformaAction,
  issueInvoiceAction,
  logReminderAction,
  recordPaymentAction,
} from "@/app/actions/invoices";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const [i] = await db.select({ n: invoices.number }).from(invoices).where(eq(invoices.id, Number((await params).id)));
  return { title: i?.n ?? "Invoice" };
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const db = await getDb();
  const [row] = await db
    .select({ i: invoices, c: clients, b: bookings })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .leftJoin(bookings, eq(bookings.id, invoices.bookingId))
    .where(eq(invoices.id, id));
  if (!row) notFound();
  const { i, c, b } = row;
  const s = await getSettings(db);
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.id));
  const pays = await db
    .select({ p: payments, who: users.name })
    .from(payments)
    .leftJoin(users, eq(users.id, payments.recordedBy))
    .where(eq(payments.invoiceId, id))
    .orderBy(desc(payments.date));
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.clientId, c.id), eq(contacts.isPrimary, true)));
  const settled = pays.reduce((s2, x) => s2 + x.p.amount + x.p.tds, 0);
  const tdsTotal = pays.reduce((s2, x) => s2 + x.p.tds, 0);
  const balance = i.total - settled;
  const t = today();
  const open = ["issued", "partial"].includes(i.status);
  const late = open && i.dueDate < t ? daysBetween(i.dueDate, t) - 1 : 0;
  const finance = can(user, "finance");
  const title = i.kind === "proforma" ? "Proforma invoice" : "Tax invoice";
  const phone = contact?.phone ?? c.phone;
  const email = contact?.email ?? c.email;
  const reminder = `Dear ${contact?.name?.split(" ")[0] ?? "Sir/Madam"}, a gentle reminder that invoice ${i.number} for ${inr(i.total)} ${late ? `was due on ${fmtDay(i.dueDate)}` : `is due on ${fmtDay(i.dueDate)}`}. Balance: ${inr(balance)}. Bank: ${s.bankName}, A/c ${s.bankAccount}, IFSC ${s.bankIfsc}. UPI: ${s.upiId}. Thank you — Accounts, ${s.companyName}`;

  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/invoices" label="Invoices" />
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[13px] text-neutral-500">{title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] text-neutral-900 tabular-nums">{i.number ?? `Draft ${title.toLowerCase()}`}</h1>
              <Badge tone={late ? "red" : INVOICE_STATUS[i.status].tone}>{late ? `Overdue by ${late} days` : INVOICE_STATUS[i.status].label}</Badge>
            </div>
            <p className="mt-1.5 text-[15px] text-neutral-500">
              <Link href={`/clients/${c.id}`} className="text-neutral-900 hover:underline">
                {c.name}
              </Link>
              {b && (
                <>
                  {" for "}
                  <Link href={`/bookings/${b.id}`} className="hover:underline">
                    {b.title}
                  </Link>
                </>
              )}
              . Issued {fmtDay(i.issueDate)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/print/invoice/${id}`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              PDF
            </a>
            {finance && i.status === "draft" && (
              <ActionButton action={issueInvoiceAction} fields={{ id }} variant="primary">
                <Send /> Issue invoice
              </ActionButton>
            )}
            {finance && i.kind === "proforma" && open && (
              <ActionButton action={convertProformaAction} fields={{ id }} confirm="Convert this proforma into a GST tax invoice with a new number?">
                <ArrowRightLeft /> Convert to tax invoice
              </ActionButton>
            )}
            {open && (
              <Modal label="Send reminder" icon={<BellRing />} title="Payment reminder" description={`${c.name}, ${inr(balance)} due`}>
                <div className="space-y-3">
                  <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">{reminder}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {waLink(phone, reminder) && (
                      <a href={waLink(phone, reminder)!} target="_blank" rel="noreferrer" className={buttonClass("success")}>
                        <MessageCircle /> WhatsApp
                      </a>
                    )}
                    {email && (
                      <a href={`mailto:${email}?subject=${encodeURIComponent(`Payment reminder — ${i.number}`)}&body=${encodeURIComponent(reminder)}`} className={buttonClass("primary")}>
                        <Mail /> Email
                      </a>
                    )}
                  </div>
                  <ActionForm action={logReminderAction} submitLabel="I've sent it — log it" submitVariant="secondary">
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="via" value={phone ? "whatsapp" : "email"} />
                  </ActionForm>
                </div>
              </Modal>
            )}
            {finance && open && (
              <Modal label="Record payment" icon={<IndianRupee />} variant="success" title="Record a payment" description={`Balance ${inr(balance)}`}>
                <ActionForm action={recordPaymentAction} submitLabel="Save payment" submitVariant="success">
                  <input type="hidden" name="id" value={id} />
                  <PaymentFields balance={Math.round(balance / 100)} taxable={Math.round(i.taxable / 100)} />
                </ActionForm>
              </Modal>
            )}
          </div>
        </div>
      </div>

      {i.status === "cancelled" && <Notice tone="red">Cancelled{i.cancelReason ? `: ${i.cancelReason}` : ""}.</Notice>}
      {i.status === "draft" && <Notice tone="blue">This is a draft — it has no number yet and isn&apos;t counted as outstanding. Issue it when ready.</Notice>}

      <StatRow>
        <Stat label="Invoice total" value={inr(i.total)} />
        <Stat label="Received" value={inr(settled - tdsTotal)} hint={tdsTotal ? `plus ${inr(tdsTotal)} TDS` : undefined} />
        <Stat label="Balance" value={i.status === "cancelled" ? "—" : inr(balance)} />
        <Stat
          label="Due"
          value={fmtDay(i.dueDate)}
          hint={late ? <span className="text-red-600">{late} days late</span> : open ? `in ${daysBetween(t, i.dueDate) - 1} days` : undefined}
        />
      </StatRow>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title={title} description={`Place of supply: ${i.placeOfSupply ?? "—"}${c.gstin ? `, Client GSTIN ${c.gstin}` : ""}`} />
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>#</th>
                  <th className={table.th}>Description</th>
                  <th className={table.th}>SAC</th>
                  <th className={cn(table.th, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, n) => (
                  <tr key={l.id} className={table.tr}>
                    <td className={cn(table.td, "text-neutral-500")}>{n + 1}</td>
                    <td className={table.td}>{l.description}</td>
                    <td className={cn(table.td, "text-neutral-500")}>{l.sac}</td>
                    <td className={cn(table.td, "text-right tabular-nums")}>{inr(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto max-w-sm space-y-1.5 px-5 py-4 text-sm">
            <Row k="Amount" v={inr(i.gross)} />
            {i.commission > 0 && <Row k={`Agency commission (${i.commissionPct}%)`} v={`− ${inr(i.commission)}`} />}
            <Row k="Taxable value" v={inr(i.taxable)} />
            {i.igst > 0 ? (
              <Row k={`IGST ${s.gstRate}%`} v={inr(i.igst)} muted />
            ) : (
              <>
                <Row k={`CGST ${s.gstRate / 2}%`} v={inr(i.cgst)} muted />
                <Row k={`SGST ${s.gstRate / 2}%`} v={inr(i.sgst)} muted />
              </>
            )}
            <div className="flex items-baseline justify-between border-t border-neutral-200 pt-2">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-semibold tabular-nums">{inr(i.total)}</span>
            </div>
            <p className="text-right text-xs text-neutral-500 italic">{rupeesInWords(i.total)}</p>
          </div>
          {i.notes && <p className="border-t border-neutral-100 px-5 py-3 text-sm whitespace-pre-line text-neutral-600">{i.notes}</p>}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Payments" description={pays.length ? `${pays.length} received` : undefined} />
            {pays.length === 0 ? (
              <EmptyState icon={<IndianRupee />} title="No payments yet" />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {pays.map(({ p, who }) => (
                  <li key={p.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                        <CheckCircle2 className="size-4 text-neutral-900" /> {inr(p.amount)}
                        {p.tds > 0 && <span className="text-xs font-normal text-neutral-500">+ {inr(p.tds)} TDS</span>}
                      </p>
                      <a href={`/print/receipt/${p.id}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-700 hover:underline">
                        Receipt
                      </a>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {fmtDay(p.date)}, {p.mode}
                      {p.reference ? `, ${p.reference}` : ""}, {p.receiptNumber}, by {who}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {finance && settled === 0 && i.status !== "cancelled" && (
            <Card className="p-5">
              <p className="text-sm font-medium text-neutral-900">Need to cancel?</p>
              <p className="mb-3 text-xs text-neutral-500">Only invoices without payments can be cancelled. The number stays used, for GST records.</p>
              <Modal label="Cancel invoice" icon={<XCircle />} variant="danger" size="sm" title="Cancel this invoice?">
                <ActionForm action={cancelInvoiceAction} submitLabel="Cancel invoice" submitVariant="danger">
                  <input type="hidden" name="id" value={id} />
                  <Field label="Reason" required>
                    <Textarea name="reason" rows={2} required />
                  </Field>
                </ActionForm>
              </Modal>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", muted ? "text-neutral-500" : "text-neutral-700")}>
      <span>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}
