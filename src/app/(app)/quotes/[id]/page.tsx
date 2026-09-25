import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { CheckCircle2, FileDown, Hourglass, Pencil, Send, ShieldCheck, ThumbsDown, Trash2, Undo2 } from "lucide-react";
import { getDb } from "@/db";
import { activities, assets, clients, contacts, holds, quoteLines, quoteVersions, quotes, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { loadAvailability } from "@/lib/availability";
import { QUOTE_STATUS } from "@/lib/constants";
import { dayOf, fmtDateTime, fmtDay, fmtRange, inr, relTime, today } from "@/lib/format";
import { can, discountLimit } from "@/lib/permissions";
import { getSettings } from "@/lib/services/common";
import { ActionButton, ActionForm, Modal } from "@/components/forms";
import { ChipInput } from "@/components/inputs";
import { SendQuoteForm } from "@/components/send-quote";
import { Badge, Card, CardHeader, Field, Input, LinkButton, Notice, Textarea, buttonClass, cn, table } from "@/components/ui";
import {
  approveQuoteAction,
  bookQuoteAction,
  deleteDraftQuoteAction,
  rejectQuoteAction,
  sendBackQuoteAction,
  sendQuoteAction,
} from "@/app/actions/quotes";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const [q] = await db.select({ n: quotes.number }).from(quotes).where(eq(quotes.id, Number((await params).id)));
  return { title: q?.n ?? "Quote" };
}

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const sp = await searchParams;
  const db = await getDb();
  const [row] = await db
    .select({ q: quotes, client: clients, by: users.name })
    .from(quotes)
    .innerJoin(clients, eq(clients.id, quotes.clientId))
    .leftJoin(users, eq(users.id, quotes.createdBy))
    .where(eq(quotes.id, id));
  if (!row) notFound();
  const { q, client } = row;
  const settings = await getSettings(db);

  const versions = await db
    .select({ v: quoteVersions, by: users.name })
    .from(quoteVersions)
    .leftJoin(users, eq(users.id, quoteVersions.createdBy))
    .where(eq(quoteVersions.quoteId, id))
    .orderBy(desc(quoteVersions.version));
  const shownNo = sp.v ? Number(sp.v) : q.currentVersion;
  const shown = versions.find((x) => x.v.version === shownNo) ?? versions[0]!;
  const v = shown.v;
  const isCurrent = v.version === q.currentVersion;
  const lines = await db
    .select({ l: quoteLines, a: assets })
    .from(quoteLines)
    .leftJoin(assets, eq(assets.id, quoteLines.assetId))
    .where(eq(quoteLines.versionId, v.id))
    .orderBy(asc(quoteLines.id));
  const media = lines.filter((x) => x.l.kind === "media");
  const production = lines.filter((x) => x.l.kind === "production");
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.clientId, client.id), eq(contacts.isPrimary, true)));
  const activeHolds = await db.select().from(holds).where(and(eq(holds.quoteId, id), eq(holds.status, "active")));
  const holdUntil = activeHolds.length ? activeHolds.reduce((m, h) => (h.expiresAt < m ? h.expiresAt : m), activeHolds[0]!.expiresAt) : null;
  const log = await db
    .select({ a: activities, who: users.name })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.userId))
    .where(and(eq(activities.refType, "quote"), eq(activities.refId, id)))
    .orderBy(desc(activities.occurredAt));
  const approver = v.approvedBy ? (await db.select({ name: users.name }).from(users).where(eq(users.id, v.approvedBy)))[0]?.name : null;

  // live availability check for "book it"
  const start = media.reduce((m, x) => (x.l.startDate! < m ? x.l.startDate! : m), media[0]?.l.startDate ?? today());
  const end = media.reduce((m, x) => (x.l.endDate! > m ? x.l.endDate! : m), media[0]?.l.endDate ?? today());
  const av = media.length ? await loadAvailability(db, [...new Set(media.map((x) => x.l.assetId!))], start, end, { excludeQuoteId: id }) : new Map();
  const conflicts = media.filter((x) => {
    const a = av.get(x.l.assetId!);
    if (!a) return false;
    const need = x.l.mode === "slots" ? x.l.slots ?? 1 : a.capacity;
    return a.freeMin < need;
  });

  const isSales = can(user, "sales");
  const canApprove = can(user, "approve") && v.maxDiscountPct <= discountLimit(user.role, settings);
  const st = QUOTE_STATUS[q.status];
  const phone = contact?.phone ?? client.phone;
  const email = contact?.email ?? client.email;
  const firstName = contact?.name?.split(" ")[0] ?? "";
  const summary = `${media.length} screen${media.length > 1 ? "s" : ""} · ${fmtRange(start, end)} · ${inr(v.total)} incl. GST`;
  const waText = `Hi ${firstName}, sharing our proposal for "${q.title}" — ${summary}. Quote ${q.number} is valid till ${fmtDay(q.validUntil)}. PDF attached. — ${user.name}, Reklama Global`;
  const mailBody = `Dear ${contact?.name ?? "Sir/Madam"},\n\nPlease find attached our proposal for "${q.title}".\n\n${media
    .map((x) => `• ${x.a?.name} — ${fmtRange(x.l.startDate, x.l.endDate)} (${x.l.mode === "slots" ? `${x.l.slots} slot${(x.l.slots ?? 1) > 1 ? "s" : ""}` : "exclusive"})`)
    .join("\n")}\n\nTotal: ${inr(v.total)} including GST. The quote is valid till ${fmtDay(q.validUntil)} and the screens are held for ${settings.holdHours} hours.\n\nRegards,\n${user.name}\nReklama Global`;

  const steps = [
    { key: "draft", label: "Draft", done: true },
    ...(v.maxDiscountPct > 0 && (v.approvedBy || q.status === "pending_approval") ? [{ key: "approval", label: v.approvedBy ? "Approved" : "Approval", done: !!v.approvedBy }] : []),
    { key: "sent", label: "Sent", done: !!q.sentAt || ["sent", "accepted", "rejected", "expired"].includes(q.status) },
    { key: "accepted", label: q.status === "rejected" ? "Rejected" : q.status === "expired" ? "Expired" : "Booked", done: ["accepted", "rejected", "expired"].includes(q.status) },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/quotes" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          ← Quotes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{q.title}</h1>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {q.number} · for{" "}
              <Link href={`/clients/${client.id}`} className="font-medium text-brand-700 hover:underline">
                {client.name}
              </Link>{" "}
              · by {row.by} · valid till {fmtDay(q.validUntil)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/print/quote/${id}?v=${v.version}`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <FileDown /> PDF
            </a>
            {isSales && !q.bookingId && isCurrent && (
              <LinkButton href={`/quotes/${id}/edit`} variant="secondary">
                <Pencil /> {q.sentAt || q.status !== "draft" && q.status !== "pending_approval" ? "Revise" : "Edit"}
              </LinkButton>
            )}
            {isSales && !q.sentAt && ["draft", "pending_approval"].includes(q.status) && (
              <ActionButton action={deleteDraftQuoteAction} fields={{ id }} variant="ghost" confirm="Delete this draft quote?">
                <Trash2 />
              </ActionButton>
            )}
          </div>
        </div>
      </div>

      {/* progress + main action */}
      <Card className="p-5">
        <ol className="mb-5 flex flex-wrap items-center gap-2 text-sm">
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium",
                  s.done ? (s.label === "Rejected" || s.label === "Expired" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700") : "bg-slate-100 text-slate-500",
                )}
              >
                {s.done && <CheckCircle2 className="size-4" />}
                {s.label}
              </span>
              {i < steps.length - 1 && <span className="h-px w-6 bg-slate-300" />}
            </li>
          ))}
        </ol>

        {!isCurrent ? (
          <Notice tone="blue">
            You&apos;re looking at version {v.version}. <Link href={`/quotes/${id}`} className="font-medium underline">See the latest (v{q.currentVersion})</Link>
          </Notice>
        ) : q.status === "pending_approval" ? (
          <div className="flex flex-col gap-3 rounded-lg bg-amber-50 p-4 sm:flex-row sm:items-center">
            <ShieldCheck className="size-6 shrink-0 text-amber-600" />
            <div className="flex-1 text-sm text-amber-900">
              <p className="font-semibold">Needs approval: {v.maxDiscountPct}% discount</p>
              <p>This is above {row.by?.split(" ")[0]}&apos;s discount limit. It can be sent once a manager approves.</p>
            </div>
            {canApprove && (
              <div className="flex gap-2">
                <Modal label="Send back" icon={<Undo2 />} title="Send back for changes">
                  <ActionForm action={sendBackQuoteAction} submitLabel="Send back">
                    <input type="hidden" name="id" value={id} />
                    <Field label="What should change?">
                      <Textarea name="note" rows={3} placeholder="e.g. Max 12% on MG Road" />
                    </Field>
                  </ActionForm>
                </Modal>
                <ActionButton action={approveQuoteAction} fields={{ id }} variant="success">
                  <ShieldCheck /> Approve discount
                </ActionButton>
              </div>
            )}
          </div>
        ) : q.status === "draft" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Ready to send</p>
              <p>Sending holds these screens for {settings.holdHours} hours so nobody else can sell them meanwhile.</p>
              {approver && <p className="mt-1 text-emerald-700">Discount approved by {approver}.</p>}
            </div>
            {isSales && (
              <Modal label="Send to client" icon={<Send />} variant="primary" title="Send the quote" description={client.name}>
                <SendQuoteForm
                  action={sendQuoteAction}
                  quoteId={id}
                  phone={phone}
                  email={email}
                  waText={waText}
                  mailSubject={`Proposal ${q.number} — ${q.title}`}
                  mailBody={mailBody}
                  printHref={`/print/quote/${id}`}
                  holdHours={settings.holdHours}
                />
              </Modal>
            )}
          </div>
        ) : q.status === "sent" || q.status === "expired" ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex-1 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Waiting for the client&apos;s decision</p>
                <p>
                  Sent {relTime(q.sentAt)} {VIA[v.sentVia ?? ""] ?? ""}.{" "}
                  {holdUntil ? (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                      <Hourglass className="size-3.5" /> Screens held until {fmtDateTime(holdUntil)}
                    </span>
                  ) : (
                    <span className="font-medium text-slate-700">The hold has lapsed — screens can be sold to others.</span>
                  )}
                </p>
              </div>
              {isSales && (
                <div className="flex flex-wrap gap-2">
                  <Modal label="Client said no" icon={<ThumbsDown />} title="Mark as rejected" description="The held screens will be released.">
                    <ActionForm action={rejectQuoteAction} submitLabel="Mark rejected" submitVariant="danger">
                      <input type="hidden" name="id" value={id} />
                      <Field label="Why?" group>
                        <ChipInput name="reason" options={["Price too high", "Chose a competitor", "Budget cancelled", "Dates changed", "No response"]} />
                      </Field>
                    </ActionForm>
                  </Modal>
                  <Modal label="Client accepted — book it" icon={<CheckCircle2 />} variant="success" title="Confirm the booking" description={`${client.name} · ${summary}`}>
                    {conflicts.length > 0 && (
                      <Notice tone="red" className="mb-4">
                        {conflicts.map((x) => x.a?.name).join(", ")} {conflicts.length > 1 ? "are" : "is"} no longer free for these dates. Revise the quote first.
                      </Notice>
                    )}
                    <ActionForm action={bookQuoteAction} submitLabel="Confirm booking" submitVariant="success">
                      <input type="hidden" name="id" value={id} />
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Release order / PO no.">
                          <Input name="roNumber" placeholder="Optional" />
                        </Field>
                        <Field label="RO date">
                          <Input type="date" name="roDate" defaultValue={today()} />
                        </Field>
                      </div>
                      <Field label="Advance agreed (₹)" hint="You can raise a proforma invoice for this next.">
                        <Input name="advance" inputMode="numeric" placeholder="e.g. 200000" />
                      </Field>
                      <Field label="Payment terms">
                        <Input name="paymentTerms" defaultValue="50% advance, balance within 15 days of start" />
                      </Field>
                      <Field label="Notes for operations">
                        <Textarea name="notes" rows={2} placeholder="e.g. Creative will come from their agency" />
                      </Field>
                    </ActionForm>
                  </Modal>
                </div>
              )}
            </div>
            {q.status === "expired" && <Notice tone="amber">This quote passed its validity date. You can still book it if the screens are free, or revise it.</Notice>}
          </div>
        ) : q.status === "accepted" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <CheckCircle2 className="size-6 text-emerald-600" />
            <p className="flex-1 text-sm text-slate-700">
              <b>Booked.</b> The screens are reserved and operations has been notified.
            </p>
            {q.bookingId && <LinkButton href={`/bookings/${q.bookingId}`}>Open booking</LinkButton>}
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-slate-700">
              <b>Rejected</b>
              {q.rejectReason ? `: ${q.rejectReason}` : ""}. You can revise and send a new version.
            </p>
            {isSales && (
              <LinkButton href={`/quotes/${id}/edit`} variant="secondary">
                Revise & resend
              </LinkButton>
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Screens" description={`${media.length} screen${media.length === 1 ? "" : "s"} · version ${v.version}`} />
            <div className={table.wrap}>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th className={table.th}>Screen</th>
                    <th className={table.th}>Dates</th>
                    <th className={table.th}>Booking</th>
                    <th className={cn(table.th, "text-right")}>Rate/month</th>
                    <th className={cn(table.th, "text-right")}>Disc.</th>
                    <th className={cn(table.th, "text-right")}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {media.map(({ l, a }) => {
                    const clash = conflicts.some((c) => c.l.id === l.id) && isCurrent && ["draft", "sent", "expired", "pending_approval"].includes(q.status);
                    return (
                      <tr key={l.id} className={table.tr}>
                        <td className={table.td}>
                          <Link href={`/screens/${a?.id}`} className="font-medium text-slate-900 hover:underline">
                            {a?.name}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {a?.code} · {a?.area}
                          </p>
                          {clash && <p className="text-xs font-medium text-red-600">No longer available</p>}
                        </td>
                        <td className={cn(table.td, "whitespace-nowrap")}>
                          {fmtRange(l.startDate, l.endDate)}
                          <p className="text-xs text-slate-500">{l.days} days</p>
                        </td>
                        <td className={table.td}>
                          {l.mode === "slots" ? (
                            <>
                              {l.slots} of {a?.totalSlots} slots
                              <p className="text-xs text-slate-500">{(l.slots ?? 1) * (a?.slotSeconds ?? 0)}s per loop</p>
                            </>
                          ) : a?.type === "hoarding" ? (
                            "Whole hoarding"
                          ) : (
                            "Whole screen"
                          )}
                        </td>
                        <td className={cn(table.td, "text-right tabular-nums")}>
                          {inr(l.rate)}
                          {l.mode === "slots" && <p className="text-xs text-slate-500">per slot</p>}
                        </td>
                        <td className={cn(table.td, "text-right tabular-nums")}>{l.discountPct ? `${l.discountPct}%` : "—"}</td>
                        <td className={cn(table.td, "text-right font-medium tabular-nums")}>{inr(l.amount)}</td>
                      </tr>
                    );
                  })}
                  {production.map(({ l }) => (
                    <tr key={l.id} className={table.tr}>
                      <td className={table.td} colSpan={3}>
                        {l.description}
                        <p className="text-xs text-slate-500">Qty {l.qty}</p>
                      </td>
                      <td className={cn(table.td, "text-right tabular-nums")}>{inr(l.rate)}</td>
                      <td className={cn(table.td, "text-right")}>{l.discountPct ? `${l.discountPct}%` : "—"}</td>
                      <td className={cn(table.td, "text-right font-medium tabular-nums")}>{inr(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto max-w-sm space-y-1.5 px-5 py-4 text-sm">
              <TotalRow label="Screens" value={inr(v.mediaGross)} />
              {v.discountTotal > 0 && <TotalRow label="Discount" value={`− ${inr(v.discountTotal)}`} />}
              {v.commission > 0 && <TotalRow label={`Agency commission (${v.commissionPct}%)`} value={`− ${inr(v.commission)}`} />}
              {v.production > 0 && <TotalRow label="Production & extras" value={inr(v.production)} />}
              <TotalRow label="Taxable value" value={inr(v.taxable)} />
              {v.igst > 0 ? (
                <TotalRow label={`IGST ${settings.gstRate}%`} value={inr(v.igst)} muted />
              ) : (
                <>
                  <TotalRow label={`CGST ${settings.gstRate / 2}%`} value={inr(v.cgst)} muted />
                  <TotalRow label={`SGST ${settings.gstRate / 2}%`} value={inr(v.sgst)} muted />
                </>
              )}
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                <span className="font-semibold">Total</span>
                <span className="text-xl font-semibold tabular-nums">{inr(v.total)}</span>
              </div>
            </div>
            {v.notes && <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">Note: {v.notes}</p>}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Versions" />
            <ul className="divide-y divide-slate-100">
              {versions.map(({ v: x, by }) => (
                <li key={x.id}>
                  <Link
                    href={`/quotes/${id}?v=${x.version}`}
                    className={cn("flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50", x.version === v.version && "bg-brand-50/60")}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Version {x.version}
                        {x.version === q.currentVersion && <span className="ml-2 text-xs font-normal text-slate-500">latest</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {by} · {fmtDay(dayOf(x.createdAt))}
                        {x.sentVia ? ` · sent ${VIA[x.sentVia] ?? ""}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-medium tabular-nums">{inr(x.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="History" />
            <ul className="space-y-3 px-5 py-4">
              {log.map(({ a, who }) => (
                <li key={a.id} className="text-sm">
                  <p className="text-slate-700">{a.notes}</p>
                  <p className="text-xs text-slate-400">
                    {who} · {fmtDateTime(a.occurredAt)}
                  </p>
                </li>
              ))}
              {log.length === 0 && <li className="text-sm text-slate-500">Not sent yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

const VIA: Record<string, string> = { whatsapp: "on WhatsApp", email: "by email", in_person: "in person" };

function TotalRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", muted ? "text-slate-500" : "text-slate-700")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
