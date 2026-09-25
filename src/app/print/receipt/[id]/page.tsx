import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoices, payments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { fmtDay, inr, rupeesInWords } from "@/lib/format";
import { getSettings } from "@/lib/services/common";
import { Letterhead } from "@/components/letterhead";
import { PrintToolbar } from "@/components/print-toolbar";

export const metadata = { title: "Payment receipt" };

export default async function PrintReceipt({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) redirect("/login");
  const id = Number((await params).id);
  const db = await getDb();
  const [row] = await db
    .select({ p: payments, i: invoices, c: clients })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(clients, eq(clients.id, payments.clientId))
    .where(eq(payments.id, id));
  if (!row) notFound();
  const { p, i, c } = row;
  const s = await getSettings(db);

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <PrintToolbar back={`/invoices/${i.id}`} label="Print / Save PDF" />
      <div className="mx-auto my-6 max-w-[210mm] bg-white p-10 text-slate-800 shadow-lg print:my-0 print:p-0 print:shadow-none">
        <Letterhead s={s} title="Payment Receipt" meta={[["Receipt no.", p.receiptNumber], ["Date", fmtDay(p.date)]]} />
        <div className="mt-8 space-y-4 text-[15px] leading-relaxed">
          <p>
            Received with thanks from <b>{c.name}</b> the sum of <b>{inr(p.amount)}</b> ({rupeesInWords(p.amount)}) by <b>{p.mode}</b>
            {p.reference ? ` (ref. ${p.reference})` : ""} against invoice <b>{i.number}</b> dated {fmtDay(i.issueDate)}.
          </p>
          {p.tds > 0 && (
            <p>
              Tax deducted at source (TDS) of <b>{inr(p.tds)}</b> has been adjusted against the same invoice. Please share the TDS certificate.
            </p>
          )}
        </div>
        <table className="mt-8 w-full max-w-md text-sm">
          <tbody>
            <tr>
              <td className="py-1 text-slate-600">Amount received</td>
              <td className="py-1 text-right font-semibold">{inr(p.amount)}</td>
            </tr>
            {p.tds > 0 && (
              <tr>
                <td className="py-1 text-slate-600">TDS adjusted</td>
                <td className="py-1 text-right">{inr(p.tds)}</td>
              </tr>
            )}
            <tr className="border-t border-slate-300">
              <td className="py-1 font-semibold">Total settled</td>
              <td className="py-1 text-right font-semibold">{inr(p.amount + p.tds)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-20 w-64 border-t border-slate-300 pt-1 text-sm text-slate-500">For {s.legalName ?? s.companyName}</div>
      </div>
    </div>
  );
}
