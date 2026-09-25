import { notFound, redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { assetPhotos, assets, clients, contacts, quoteLines, quoteVersions, quotes, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { dayOf, fmtDay, fmtRange, inr, num, rupeesInWords } from "@/lib/format";
import { getSettings } from "@/lib/services/common";
import { Letterhead } from "@/components/letterhead";
import { PrintToolbar } from "@/components/print-toolbar";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const [q] = await db.select({ n: quotes.number, t: quotes.title }).from(quotes).where(eq(quotes.id, Number((await params).id)));
  return { title: q ? `${q.n.replaceAll("/", "-")} ${q.t}` : "Quotation" };
}

export default async function PrintQuote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  if (!(await getCurrentUser())) redirect("/login");
  const id = Number((await params).id);
  const sp = await searchParams;
  const db = await getDb();
  const [row] = await db
    .select({ q: quotes, c: clients, by: users })
    .from(quotes)
    .innerJoin(clients, eq(clients.id, quotes.clientId))
    .innerJoin(users, eq(users.id, quotes.createdBy))
    .where(eq(quotes.id, id));
  if (!row) notFound();
  const { q, c, by } = row;
  const versionNo = sp.v ? Number(sp.v) : q.currentVersion;
  const [v] = await db.select().from(quoteVersions).where(and(eq(quoteVersions.quoteId, id), eq(quoteVersions.version, versionNo)));
  if (!v) notFound();
  const s = await getSettings(db);
  const lines = await db
    .select({ l: quoteLines, a: assets })
    .from(quoteLines)
    .leftJoin(assets, eq(assets.id, quoteLines.assetId))
    .where(eq(quoteLines.versionId, v.id))
    .orderBy(asc(quoteLines.id));
  const photos = await db
    .select({ assetId: assetPhotos.assetId, url: sql<string>`min(${assetPhotos.url})` })
    .from(assetPhotos)
    .where(eq(assetPhotos.kind, "day"))
    .groupBy(assetPhotos.assetId);
  const photoOf = new Map(photos.map((p) => [p.assetId, p.url]));
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.clientId, c.id), eq(contacts.isPrimary, true)));
  const media = lines.filter((x) => x.l.kind === "media");
  const prod = lines.filter((x) => x.l.kind === "production");

  return (
    <div className="min-h-screen bg-neutral-100 print:bg-white">
      <PrintToolbar back={`/quotes/${id}`} label="Print / Save PDF" />
      <div className="mx-auto my-6 max-w-[210mm] bg-white p-10 text-neutral-800 shadow-lg print:my-0 print:p-0 print:shadow-none">
        <Letterhead
          s={s}
          title="Quotation"
          meta={[
            ["Quote no.", `${q.number}${v.version > 1 ? ` (v${v.version})` : ""}`],
            ["Date", fmtDay(dayOf(v.createdAt))],
            ["Valid till", fmtDay(q.validUntil)],
          ]}
        />

        <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs text-neutral-500">Prepared for</p>
            <p className="mt-1 font-semibold text-neutral-900">{c.name}</p>
            {contact && (
              <p className="text-neutral-600">
                Attn: {contact.name}
                {contact.designation ? `, ${contact.designation}` : ""}
              </p>
            )}
            {c.address && <p className="text-neutral-600">{c.address}</p>}
            {c.gstin && <p className="text-neutral-600">GSTIN: {c.gstin}</p>}
          </div>
          <div>
            <p className="text-xs text-neutral-500">Campaign</p>
            <p className="mt-1 font-semibold text-neutral-900">{q.title}</p>
            <p className="text-neutral-600">
              {media.length} screen{media.length === 1 ? "" : "s"} · {fmtRange(media.reduce((m, x) => (x.l.startDate! < m ? x.l.startDate! : m), media[0]?.l.startDate ?? ""), media.reduce((m, x) => (x.l.endDate! > m ? x.l.endDate! : m), media[0]?.l.endDate ?? ""))}
            </p>
            <p className="text-neutral-600">
              Contact: {by.name} · {by.phone} · {by.email}
            </p>
          </div>
        </section>

        <section className="mt-6 space-y-3">
          {media.map(({ l, a }, i) => (
            <div key={l.id} className="flex gap-4 rounded-lg border border-neutral-200 p-3 break-inside-avoid">
              {a && photoOf.get(a.id) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoOf.get(a.id)} alt="" className="h-24 w-40 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      {i + 1}. {a?.name}
                    </p>
                    <p className="text-neutral-500">
                      {a?.code} · {[a?.address, a?.area].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  <p className="text-sm font-semibold whitespace-nowrap text-neutral-900 tabular-nums">{inr(l.amount)}</p>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-neutral-600">
                  <Spec k="Format" v={a?.type === "led" ? `LED ${a.widthFt}′×${a.heightFt}′` : `Hoarding ${a?.widthFt}′×${a?.heightFt}′ ${a?.illumination ?? ""}`} />
                  <Spec k="Period" v={`${fmtRange(l.startDate, l.endDate)} (${l.days} days)`} />
                  <Spec
                    k="Booking"
                    v={l.mode === "slots" ? `${l.slots} of ${a?.totalSlots} slots · ${(l.slots ?? 1) * (a?.slotSeconds ?? 0)}s per ${a?.loopSeconds}s loop` : a?.type === "led" ? "Whole screen (exclusive)" : "Exclusive"}
                  />
                  <Spec
                    k="Rate"
                    v={`${inr(l.rate)}/month${l.mode === "slots" ? " per slot" : ""}${l.discountPct ? ` · ${l.discountPct}% off` : ""}`}
                  />
                </div>
                {a?.dailyTraffic && <p className="mt-1 text-neutral-500">Approx. {num(a.dailyTraffic)} daily traffic</p>}
              </div>
            </div>
          ))}
        </section>

        {prod.length > 0 && (
          <table className="mt-4 w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-neutral-500">
                <th className="py-1.5 font-medium">Production & extras</th>
                <th className="py-1.5 text-right font-medium">Qty</th>
                <th className="py-1.5 text-right font-medium">Rate</th>
                <th className="py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {prod.map(({ l }) => (
                <tr key={l.id} className="border-b border-neutral-100">
                  <td className="py-1.5">{l.description}</td>
                  <td className="py-1.5 text-right">{num(l.qty)}</td>
                  <td className="py-1.5 text-right tabular-nums">{inr(l.rate)}</td>
                  <td className="py-1.5 text-right tabular-nums">{inr(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <section className="mt-5 flex justify-end break-inside-avoid">
          <table className="w-72 text-sm">
            <tbody>
              <T k="Screens (gross)" v={inr(v.mediaGross)} />
              {v.discountTotal > 0 && <T k="Discount" v={`− ${inr(v.discountTotal)}`} />}
              {v.commission > 0 && <T k={`Agency commission (${v.commissionPct}%)`} v={`− ${inr(v.commission)}`} />}
              {v.production > 0 && <T k="Production & extras" v={inr(v.production)} />}
              <T k="Taxable value" v={inr(v.taxable)} bold />
              {v.igst > 0 ? (
                <T k={`IGST @ ${s.gstRate}%`} v={inr(v.igst)} />
              ) : (
                <>
                  <T k={`CGST @ ${s.gstRate / 2}%`} v={inr(v.cgst)} />
                  <T k={`SGST @ ${s.gstRate / 2}%`} v={inr(v.sgst)} />
                </>
              )}
              <tr className="border-t-2 border-neutral-900">
                <td className="pt-2 font-bold text-neutral-900">Total</td>
                <td className="pt-2 text-right text-lg font-bold text-neutral-900 tabular-nums">{inr(v.total)}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <p className="mt-1 text-right text-xs text-neutral-500 italic">{rupeesInWords(v.total)}</p>

        {v.notes && <p className="mt-4 rounded bg-neutral-50 p-3 text-sm text-neutral-700">{v.notes}</p>}

        <section className="mt-6 grid grid-cols-2 gap-6 text-xs break-inside-avoid">
          <div>
            <p className="mb-1 font-semibold text-neutral-700">Terms & conditions</p>
            <p className="leading-relaxed whitespace-pre-line text-neutral-600">{v.terms}</p>
          </div>
          <div>
            <p className="mb-1 font-semibold text-neutral-700">Bank details</p>
            <p className="leading-relaxed text-neutral-600">
              {s.bankName}
              <br />
              A/c: {s.bankAccount} · IFSC: {s.bankIfsc}
              <br />
              UPI: {s.upiId}
            </p>
            <div className="mt-10 border-t border-neutral-300 pt-1 text-neutral-500">For {s.companyName} — Authorised signatory</div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[11px] text-neutral-400">{k}</p>
      <p className="text-neutral-700">{v}</p>
    </div>
  );
}

function T({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <tr>
      <td className={bold ? "py-0.5 font-semibold" : "py-0.5 text-neutral-600"}>{k}</td>
      <td className={`py-0.5 text-right tabular-nums ${bold ? "font-semibold" : ""}`}>{v}</td>
    </tr>
  );
}
