import { getDb } from "@/db";
import { requirePerm } from "@/lib/auth";
import { addDays, today } from "@/lib/format";
import { builderData } from "@/lib/quote-builder-data";
import { QuoteBuilder } from "@/components/quote-builder";
import { PageHeader } from "@/components/ui";
import { checkAvailabilityAction, saveQuoteAction } from "@/app/actions/quotes";

export const metadata = { title: "New quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ client?: string; asset?: string; from?: string; to?: string }> }) {
  const user = await requirePerm("sales");
  const sp = await searchParams;
  const db = await getDb();
  const { settings, assetOpts, clientOpts, limit } = await builderData(db, user);
  const t = today();
  const start = sp.from && sp.from >= t ? sp.from : addDays(t, 7);
  const end = sp.to && sp.to >= start ? sp.to : addDays(start, 29);
  const clientId = sp.client ? Number(sp.client) : null;
  const client = clientOpts.find((c) => c.id === clientId);

  return (
    <div>
      <PageHeader
        title="New quote"
        subtitle="Pick the client, dates and screens — prices, GST and availability are worked out for you."
        back={client ? { href: `/clients/${client.id}`, label: client.name } : { href: "/quotes", label: "Quotes" }}
      />
      <QuoteBuilder
        assets={assetOpts}
        clients={clientOpts}
        gstRate={settings.gstRate}
        discountLimit={limit}
        saveAction={saveQuoteAction}
        checkAction={checkAvailabilityAction}
        initial={{
          clientId: client?.id ?? null,
          title: client ? `${client.name} campaign` : "",
          startDate: start,
          endDate: end,
          validUntil: addDays(t, settings.quoteValidityDays),
          notes: "",
          terms: settings.quoteTerms ?? "",
          commissionPct: client?.type === "agency" ? client.agencyCommission : null,
          lines: [],
          addAssetId: sp.asset ? Number(sp.asset) : null,
        }}
      />
    </div>
  );
}
