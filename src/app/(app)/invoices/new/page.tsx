import { and, eq, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { isInterState } from "@/lib/pricing";
import { getSettings } from "@/lib/services/common";
import { invoiceDefaultsFromBooking } from "@/lib/services/invoices";
import { InvoiceForm } from "@/components/invoice-form";
import { PageHeader } from "@/components/ui";
import { createInvoiceAction } from "@/app/actions/invoices";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  await requirePerm("finance");
  const sp = await searchParams;
  if (!sp.booking) notFound();
  const db = await getDb();
  const bookingId = Number(sp.booking);
  const d = await invoiceDefaultsFromBooking(db, bookingId).catch(() => null);
  if (!d) notFound();
  const settings = await getSettings(db);
  const existing = await db
    .select({ total: invoices.total })
    .from(invoices)
    .where(and(eq(invoices.bookingId, bookingId), ne(invoices.status, "cancelled"), eq(invoices.kind, "tax")));
  const alreadyBilled = existing.reduce((s, x) => s + x.total, 0);

  return (
    <div>
      <PageHeader
        title="New invoice"
        subtitle={`${d.client.name} · ${d.booking.title} (${d.booking.number})`}
        back={{ href: `/bookings/${bookingId}`, label: d.booking.number }}
      />
      <InvoiceForm
        action={createInvoiceAction}
        clientId={d.client.id}
        clientName={d.client.name}
        isAgency={d.client.type === "agency"}
        bookingId={bookingId}
        bookingTitle={d.booking.title}
        defaultLines={d.lines.map((l) => ({ ...l, amount: Math.round(l.amount / 100) }))}
        commissionPct={d.commissionPct}
        creditDays={d.client.creditDays ?? settings.paymentTermsDays}
        gstRate={settings.gstRate}
        interState={isInterState(settings.stateCode, d.client)}
        alreadyBilled={alreadyBilled}
        bookingTotal={d.booking.total}
        issueDate={d.issueDate}
      />
    </div>
  );
}
