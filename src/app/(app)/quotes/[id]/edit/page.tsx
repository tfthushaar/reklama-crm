import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db";
import { requirePerm } from "@/lib/auth";
import { addDays, today } from "@/lib/format";
import { builderData } from "@/lib/quote-builder-data";
import { currentVersionOf } from "@/lib/services/quotes";
import { QuoteBuilder, type BuilderLine } from "@/components/quote-builder";
import { Notice, PageHeader } from "@/components/ui";
import { checkAvailabilityAction, saveQuoteAction } from "@/app/actions/quotes";

export const metadata = { title: "Edit quote" };

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePerm("sales");
  const id = Number((await params).id);
  const db = await getDb();
  const data = await currentVersionOf(db, id).catch(() => null);
  if (!data) notFound();
  const { quote, version, lines } = data;
  if (quote.bookingId) redirect(`/quotes/${id}`);
  const { settings, assetOpts, clientOpts, limit } = await builderData(db, user);
  const media = lines.filter((l) => l.kind === "media");
  const start = media.reduce((m, l) => (l.startDate! < m ? l.startDate! : m), media[0]?.startDate ?? today());
  const end = media.reduce((m, l) => (l.endDate! > m ? l.endDate! : m), media[0]?.endDate ?? addDays(today(), 29));
  const willRevise = !!version.sentVia || ["sent", "rejected", "expired"].includes(quote.status);

  const builderLines: BuilderLine[] = lines.map((l) =>
    l.kind === "media"
      ? {
          key: `e${l.id}`,
          kind: "media",
          assetId: l.assetId!,
          startDate: l.startDate!,
          endDate: l.endDate!,
          mode: l.mode ?? "exclusive",
          slots: l.slots ?? 1,
          rate: Math.round(l.rate / 100),
          discountPct: l.discountPct,
        }
      : { key: `e${l.id}`, kind: "production", description: l.description ?? "", qty: l.qty, rate: Math.round(l.rate / 100), discountPct: l.discountPct },
  );

  return (
    <div>
      <PageHeader title={willRevise ? `Revise ${quote.number}` : `Edit ${quote.number}`} back={{ href: `/quotes/${id}`, label: quote.number }} />
      {willRevise && (
        <Notice tone="blue" className="mb-5">
          This quote was already sent, so saving creates <b>version {quote.currentVersion + 1}</b>. The earlier version stays in the history.
        </Notice>
      )}
      <QuoteBuilder
        assets={assetOpts}
        clients={clientOpts}
        gstRate={settings.gstRate}
        discountLimit={limit}
        saveAction={saveQuoteAction}
        checkAction={checkAvailabilityAction}
        initial={{
          quoteId: id,
          clientId: quote.clientId,
          title: quote.title,
          startDate: start,
          endDate: end,
          validUntil: quote.validUntil && quote.validUntil >= today() ? quote.validUntil : addDays(today(), settings.quoteValidityDays),
          notes: version.notes ?? "",
          terms: version.terms ?? settings.quoteTerms ?? "",
          commissionPct: version.commissionPct,
          lines: builderLines,
        }}
      />
    </div>
  );
}
