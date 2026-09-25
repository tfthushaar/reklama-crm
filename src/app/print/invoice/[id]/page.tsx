import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, clients, contacts, invoiceLines, invoices, payments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { fmtDay, inr, rupeesInWords } from "@/lib/format";
import { stateName } from "@/lib/pricing";
import { getSettings } from "@/lib/services/common";
import { Letterhead } from "@/components/letterhead";
import { PrintToolbar } from "@/components/print-toolbar";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const [i] = await db.select({ n: invoices.number }).from(invoices).where(eq(invoices.id, Number((await params).id)));
  return { title: i?.n ? `Invoice ${i.n.replaceAll("/", "-")}` : "Invoice" };
}

export default async function PrintInvoice({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) redirect("/login");
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
  const pays = await db.select().from(payments).where(eq(payments.invoiceId, id));
  const paid = pays.reduce((x, p) => x + p.amount + p.tds, 0);
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.clientId, c.id), eq(contacts.isPrimary, true)));
  const title = i.kind === "proforma" ? "Proforma Invoice" : "Tax Invoice";
  const half = s.gstRate / 2;

  return (
    <div className="min-h-screen bg-neutral-100 print:bg-white">
      <PrintToolbar back={`/invoices/${id}`} label="Print / Save PDF" />
      <div className="mx-auto my-6 max-w-[210mm] bg-white p-10 text-neutral-800 shadow-lg print:my-0 print:p-0 print:shadow-none">
        {i.status === "draft" && <p className="mb-4 rounded bg-neutral-100 px-3 py-2 text-center text-sm font-semibold text-neutral-800">DRAFT — not a valid invoice</p>}
        {i.status === "cancelled" && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-700">CANCELLED</p>}
        <Letterhead
          s={s}
          title={title}
          meta={[
            ["Invoice no.", i.number ?? "Draft"],
            ["Date", fmtDay(i.issueDate)],
            ["Due date", fmtDay(i.dueDate)],
            ["Place of supply", i.placeOfSupply ?? "—"],
          ]}
        />
        <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs text-neutral-500">Bill to</p>
            <p className="mt-1 font-semibold text-neutral-900">{c.name}</p>
            {c.address && <p className="text-neutral-600">{c.address}</p>}
            <p className="text-neutral-600">{[c.city, stateName(c.stateCode)].filter(Boolean).join(", ")}</p>
            {c.gstin && <p className="text-neutral-600">GSTIN: {c.gstin}</p>}
            {contact && <p className="text-neutral-600">Attn: {contact.name}</p>}
          </div>
          {b && (
            <div>
              <p className="text-xs text-neutral-500">Campaign</p>
              <p className="mt-1 font-semibold text-neutral-900">{b.title}</p>
              <p className="text-neutral-600">Booking {b.number}</p>
              {b.roNumber && (
                <p className="text-neutral-600">
                  Release order: {b.roNumber}
                  {b.roDate ? ` dated ${fmtDay(b.roDate)}` : ""}
                </p>
              )}
            </div>
          )}
        </section>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="bg-neutral-900 text-left text-xs text-white">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Description of service</th>
              <th className="px-3 py-2 font-medium">SAC</th>
              <th className="px-3 py-2 text-right font-medium">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, n) => (
              <tr key={l.id} className="border-b border-neutral-200">
                <td className="px-3 py-2 align-top text-neutral-500">{n + 1}</td>
                <td className="px-3 py-2">{l.description}</td>
                <td className="px-3 py-2 align-top text-neutral-500">{l.sac}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums">{inr(l.amount).replace("₹", "")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-4 flex justify-end">
          <table className="w-80 text-sm">
            <tbody>
              <R k="Total amount" v={inr(i.gross)} />
              {i.commission > 0 && <R k={`Less: agency commission @ ${i.commissionPct}%`} v={`− ${inr(i.commission)}`} />}
              <R k="Taxable value" v={inr(i.taxable)} bold />
              {i.igst > 0 ? (
                <R k={`IGST @ ${s.gstRate}%`} v={inr(i.igst)} />
              ) : (
                <>
                  <R k={`CGST @ ${half}%`} v={inr(i.cgst)} />
                  <R k={`SGST @ ${half}%`} v={inr(i.sgst)} />
                </>
              )}
              <tr className="border-t-2 border-neutral-900">
                <td className="pt-2 font-bold text-neutral-900">Invoice total</td>
                <td className="pt-2 text-right text-lg font-bold text-neutral-900 tabular-nums">{inr(i.total)}</td>
              </tr>
              {paid > 0 && <R k="Less: received" v={`− ${inr(paid)}`} />}
              {paid > 0 && <R k="Balance due" v={inr(i.total - paid)} bold />}
            </tbody>
          </table>
        </section>
        <p className="mt-1 text-right text-xs text-neutral-500 italic">{rupeesInWords(i.total)}</p>

        <table className="mt-6 w-full border border-neutral-200 text-xs">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="border border-neutral-200 px-2 py-1 text-left font-medium">SAC</th>
              <th className="border border-neutral-200 px-2 py-1 text-right font-medium">Taxable value</th>
              {i.igst > 0 ? (
                <th className="border border-neutral-200 px-2 py-1 text-right font-medium">IGST {s.gstRate}%</th>
              ) : (
                <>
                  <th className="border border-neutral-200 px-2 py-1 text-right font-medium">CGST {half}%</th>
                  <th className="border border-neutral-200 px-2 py-1 text-right font-medium">SGST {half}%</th>
                </>
              )}
              <th className="border border-neutral-200 px-2 py-1 text-right font-medium">Total tax</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-neutral-200 px-2 py-1">{s.sacCode}</td>
              <td className="border border-neutral-200 px-2 py-1 text-right">{inr(i.taxable)}</td>
              {i.igst > 0 ? (
                <td className="border border-neutral-200 px-2 py-1 text-right">{inr(i.igst)}</td>
              ) : (
                <>
                  <td className="border border-neutral-200 px-2 py-1 text-right">{inr(i.cgst)}</td>
                  <td className="border border-neutral-200 px-2 py-1 text-right">{inr(i.sgst)}</td>
                </>
              )}
              <td className="border border-neutral-200 px-2 py-1 text-right">{inr(i.cgst + i.sgst + i.igst)}</td>
            </tr>
          </tbody>
        </table>

        {i.notes && <p className="mt-4 text-sm whitespace-pre-line text-neutral-700">{i.notes}</p>}

        <section className="mt-6 grid grid-cols-2 gap-6 text-xs break-inside-avoid">
          <div>
            <p className="mb-1 font-semibold text-neutral-700">Pay to</p>
            <p className="leading-relaxed text-neutral-600">
              {s.legalName ?? s.companyName}
              <br />
              {s.bankName}
              <br />
              A/c: {s.bankAccount} · IFSC: {s.bankIfsc}
              <br />
              UPI: {s.upiId}
            </p>
            {s.invoiceTerms && (
              <>
                <p className="mt-3 mb-1 font-semibold text-neutral-700">Terms</p>
                <p className="leading-relaxed whitespace-pre-line text-neutral-600">{s.invoiceTerms}</p>
              </>
            )}
          </div>
          <div className="flex flex-col justify-end">
            <div className="mt-16 border-t border-neutral-300 pt-1 text-right text-neutral-500">For {s.legalName ?? s.companyName} — Authorised signatory</div>
            <p className="mt-2 text-right text-[10px] text-neutral-400">This is a computer-generated invoice.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function R({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <tr>
      <td className={bold ? "py-0.5 font-semibold" : "py-0.5 text-neutral-600"}>{k}</td>
      <td className={`py-0.5 text-right tabular-nums ${bold ? "font-semibold" : ""}`}>{v}</td>
    </tr>
  );
}
