import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, CalendarPlus, Check, FileText, Image as ImageIcon, IndianRupee, Pencil, Upload, XCircle } from "lucide-react";
import { getDb } from "@/db";
import { activities, assets, bookingFiles, bookingLines, bookings, clients, invoices, quotes, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { BOOKING_STATUS, BOOKING_STEPS, INVOICE_STATUS } from "@/lib/constants";
import { addDays, daysBetween, fmtDateTime, fmtDay, fmtRange, inr, relTime, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { paidSq } from "@/lib/queries";
import { ActionButton, ActionForm, Modal } from "@/components/forms";
import { Badge, Card, CardHeader, EmptyState, Field, Input, KeyValue, LinkButton, Notice, Select, Textarea, cn, table } from "@/components/ui";
import { advanceBookingAction, cancelBookingAction, extendBookingAction, updateBookingInfoAction, uploadBookingFileAction } from "@/app/actions/bookings";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const [b] = await db.select({ t: bookings.title }).from(bookings).where(eq(bookings.id, Number((await params).id)));
  return { title: b?.t ?? "Booking" };
}

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const db = await getDb();
  const [row] = await db
    .select({ b: bookings, client: clients, quoteNo: quotes.number })
    .from(bookings)
    .innerJoin(clients, eq(clients.id, bookings.clientId))
    .leftJoin(quotes, eq(quotes.id, bookings.quoteId))
    .where(eq(bookings.id, id));
  if (!row) notFound();
  const { b, client } = row;
  const t = today();
  const p = paidSq(db);

  const [lines, files, invs, log, team] = await Promise.all([
    db.select({ l: bookingLines, a: assets }).from(bookingLines).leftJoin(assets, eq(assets.id, bookingLines.assetId)).where(eq(bookingLines.bookingId, id)).orderBy(asc(bookingLines.id)),
    db.select({ f: bookingFiles, who: users.name }).from(bookingFiles).leftJoin(users, eq(users.id, bookingFiles.uploadedBy)).where(eq(bookingFiles.bookingId, id)).orderBy(desc(bookingFiles.createdAt)),
    db.select({ i: invoices, paid: p.paid }).from(invoices).leftJoin(p, eq(p.invoiceId, invoices.id)).where(eq(invoices.bookingId, id)).orderBy(asc(invoices.createdAt)),
    db
      .select({ a: activities, who: users.name })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.userId))
      .where(and(eq(activities.refType, "booking"), eq(activities.refId, id)))
      .orderBy(desc(activities.occurredAt)),
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.role, ["operations", "owner", "sales_manager"])),
  ]);
  const owner = team.find((u) => u.id === b.ownerId);
  const media = lines.filter((x) => x.l.kind === "media");
  const production = lines.filter((x) => x.l.kind === "production");
  const liveInvoices = invs.filter((x) => x.i.status !== "cancelled" && x.i.status !== "draft");
  const billed = liveInvoices.reduce((s, x) => s + x.i.total, 0);
  const received = liveInvoices.reduce((s, x) => s + Number(x.paid ?? 0), 0);
  const cancelled = b.status === "cancelled";
  const stepIdx = BOOKING_STEPS.findIndex((s) => s.key === b.status);
  const nextStep = BOOKING_STEPS[stepIdx]?.next;
  const canOps = can(user, "operations");
  const pops = files.filter((x) => x.f.kind === "pop");
  const ro = files.filter((x) => x.f.kind === "ro");
  const creatives = files.filter((x) => x.f.kind === "creative");
  const others = files.filter((x) => x.f.kind === "other");
  const isImg = (url: string) => /\.(png|jpe?g|webp|gif)$/i.test(url) || url.startsWith("/img/");

  const timing =
    b.startDate > t
      ? `Starts in ${daysBetween(t, b.startDate) - 1} day${daysBetween(t, b.startDate) - 1 === 1 ? "" : "s"}`
      : b.endDate >= t
        ? `Day ${daysBetween(b.startDate, t)} of ${daysBetween(b.startDate, b.endDate)}`
        : `Ended ${fmtDay(b.endDate)}`;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/bookings" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          ← Bookings
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{b.title}</h1>
              <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {b.number} ·{" "}
              <Link href={`/clients/${client.id}`} className="font-medium text-brand-700 hover:underline">
                {client.name}
              </Link>{" "}
              · {fmtRange(b.startDate, b.endDate)} · {cancelled ? "cancelled" : timing}
            </p>
          </div>
          {!cancelled && (
            <div className="flex flex-wrap gap-2">
              {b.status !== "completed" && (
                <Modal label="Extend" icon={<CalendarPlus />} title="Extend this booking" description="We'll check the screens are free for the extra days.">
                  <ActionForm action={extendBookingAction} submitLabel="Extend booking">
                    <input type="hidden" name="id" value={id} />
                    <Field label="New end date" required hint={`Currently ends ${fmtDay(b.endDate)}. The amount is increased pro-rata.`}>
                      <Input type="date" name="endDate" required min={addDays(b.endDate, 1)} defaultValue={addDays(b.endDate, 14)} />
                    </Field>
                  </ActionForm>
                </Modal>
              )}
              {can(user, "approve") && b.status !== "completed" && (
                <Modal label="Cancel" icon={<XCircle />} variant="danger" title="Cancel this booking?" description="The screens become available to others straight away.">
                  <ActionForm action={cancelBookingAction} submitLabel="Cancel booking" submitVariant="danger">
                    <input type="hidden" name="id" value={id} />
                    <Field label="Reason" required>
                      <Textarea name="reason" rows={2} required />
                    </Field>
                  </ActionForm>
                </Modal>
              )}
              {can(user, "finance") && (
                <LinkButton href={`/invoices/new?booking=${id}`}>
                  <IndianRupee /> Create invoice
                </LinkButton>
              )}
            </div>
          )}
        </div>
      </div>

      {cancelled ? (
        <Notice tone="red">Cancelled{b.cancelReason ? `: ${b.cancelReason}` : ""}. The screens have been released.</Notice>
      ) : (
        <Card className="p-5">
          <ol className="flex flex-wrap items-center gap-2">
            {BOOKING_STEPS.map((s, i) => {
              const done = i < stepIdx || b.status === "completed";
              const current = i === stepIdx && b.status !== "completed";
              return (
                <li key={s.key} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
                      done && "bg-emerald-50 text-emerald-700",
                      current && "bg-brand-700 text-white",
                      !done && !current && "bg-slate-100 text-slate-500",
                    )}
                  >
                    {done && <Check className="size-4" />}
                    {s.label}
                  </span>
                  {i < BOOKING_STEPS.length - 1 && <span className="h-px w-5 bg-slate-300" />}
                </li>
              );
            })}
          </ol>
          {nextStep && canOps && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg bg-slate-50 p-4 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-slate-600">
                {b.status === "confirmed" && "Waiting for the client's creative. Upload it below when it arrives."}
                {b.status === "creative_received" && "Check the creative fits the screen specs, then approve it."}
                {b.status === "creative_approved" &&
                  (media.some((x) => x.a?.type === "hoarding") ? "Print and mount the flex, then mark the campaign live." : "Schedule it on the screens, then mark it live.")}
                {b.status === "live" && "Upload day and night proof photos. Mark completed when the campaign ends."}
              </p>
              <ActionButton action={advanceBookingAction} fields={{ id }} variant="primary">
                {nextStep} <ArrowRight />
              </ActionButton>
            </div>
          )}
          {b.status === "live" && pops.length === 0 && (
            <Notice tone="amber" className="mt-3">
              No proof of display uploaded yet — clients usually expect photos before paying.
            </Notice>
          )}
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Screens booked" description={`${media.length} screen${media.length === 1 ? "" : "s"}`} />
            <div className={table.wrap}>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th className={table.th}>Screen</th>
                    <th className={table.th}>Dates</th>
                    <th className={table.th}>Booking</th>
                    <th className={cn(table.th, "text-right")}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {media.map(({ l, a }) => (
                    <tr key={l.id} className={table.tr}>
                      <td className={table.td}>
                        <Link href={`/screens/${a?.id}`} className="font-medium text-slate-900 hover:underline">
                          {a?.name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {a?.code} · {a?.area}
                        </p>
                      </td>
                      <td className={cn(table.td, "whitespace-nowrap")}>{fmtRange(l.startDate, l.endDate)}</td>
                      <td className={table.td}>
                        {l.mode === "slots" ? `${l.slots} of ${a?.totalSlots} slots (${(l.slots ?? 1) * (a?.slotSeconds ?? 0)}s/loop)` : a?.type === "hoarding" ? "Whole hoarding" : "Whole screen"}
                      </td>
                      <td className={cn(table.td, "text-right tabular-nums")}>{inr(l.amount)}</td>
                    </tr>
                  ))}
                  {production.map(({ l }) => (
                    <tr key={l.id} className={table.tr}>
                      <td className={table.td} colSpan={3}>
                        {l.description}
                      </td>
                      <td className={cn(table.td, "text-right tabular-nums")}>{inr(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between border-t border-slate-100 px-5 py-3 text-sm">
              <span className="text-slate-600">Total including GST{b.commissionPct ? `, after ${b.commissionPct}% agency commission` : ""}</span>
              <span className="font-semibold tabular-nums">{inr(b.total)}</span>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Proof of display"
              description="Day and night photos of each screen showing the campaign"
              action={<UploadButton bookingId={id} kind="pop" label="Upload photo" screens={media.map((x) => ({ id: x.a!.id, name: x.a!.name }))} />}
            />
            {pops.length === 0 ? (
              <EmptyState icon={<ImageIcon />} title="No photos yet" />
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3">
                {pops.map(({ f, who }) => (
                  <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-lg border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={f.name} className="aspect-[16/10] w-full object-cover transition group-hover:scale-[1.02]" />
                    <div className="px-2.5 py-2">
                      <p className="truncate text-xs font-medium text-slate-800">{f.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {who} · {fmtDateTime(f.createdAt)}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Documents & creatives"
              action={
                <div className="flex gap-2">
                  <UploadButton bookingId={id} kind="ro" label="Release order" />
                  <UploadButton bookingId={id} kind="creative" label="Creative" />
                  <UploadButton bookingId={id} kind="other" label="Other" />
                </div>
              }
            />
            {ro.length + creatives.length + others.length === 0 ? (
              <EmptyState icon={<FileText />} title="Nothing uploaded yet" text="Keep the release order, artwork and any approvals here." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {[...ro, ...creatives, ...others].map(({ f, who }) => (
                  <li key={f.id} className="flex items-center gap-3 px-5 py-3">
                    {isImg(f.url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.url} alt="" className="h-10 w-14 rounded border border-slate-200 object-cover" />
                    ) : (
                      <span className="flex h-10 w-14 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-400">
                        <FileText className="size-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <a href={f.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-900 hover:underline">
                        {f.name}
                      </a>
                      <p className="text-xs text-slate-500">
                        {f.kind === "ro" ? "Release order" : f.kind === "creative" ? "Creative" : "Document"} · {who} · {relTime(f.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Billing"
              action={
                can(user, "finance") &&
                !cancelled && (
                  <LinkButton href={`/invoices/new?booking=${id}`} variant="ghost" size="sm">
                    + Invoice
                  </LinkButton>
                )
              }
            />
            <div className="grid grid-cols-3 gap-px bg-slate-100 text-center">
              {[
                ["Value", inr(b.total)],
                ["Invoiced", inr(billed)],
                ["Received", inr(received)],
              ].map(([k, v]) => (
                <div key={k} className="bg-white px-2 py-3">
                  <p className="text-xs text-slate-500">{k}</p>
                  <p className="text-sm font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            {invs.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">No invoices yet.{b.advanceAmount ? ` Advance agreed: ${inr(b.advanceAmount)}.` : ""}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {invs.map(({ i, paid }) => {
                  const overdue = ["issued", "partial"].includes(i.status) && i.dueDate < t;
                  return (
                    <li key={i.id}>
                      <Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{i.number ?? "Draft invoice"}</p>
                          <p className="text-xs text-slate-500">
                            {i.kind === "proforma" ? "Proforma" : "Tax invoice"} · {inr(i.total)}
                            {Number(paid ?? 0) > 0 ? ` · ${inr(Number(paid))} received` : ""}
                          </p>
                        </div>
                        <Badge tone={overdue ? "red" : INVOICE_STATUS[i.status].tone}>{overdue ? "Overdue" : INVOICE_STATUS[i.status].label}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Details"
              action={
                <Modal label="Edit" icon={<Pencil />} size="sm" variant="ghost" title="Booking details">
                  <ActionForm action={updateBookingInfoAction} submitLabel="Save" resetOnSuccess={false}>
                    <input type="hidden" name="id" value={id} />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Release order no.">
                        <Input name="roNumber" defaultValue={b.roNumber ?? ""} />
                      </Field>
                      <Field label="RO date">
                        <Input type="date" name="roDate" defaultValue={b.roDate ?? ""} />
                      </Field>
                    </div>
                    <Field label="Advance agreed (₹)">
                      <Input name="advance" inputMode="numeric" defaultValue={b.advanceAmount ? Math.round(b.advanceAmount / 100) : ""} />
                    </Field>
                    <Field label="Payment terms">
                      <Input name="paymentTerms" defaultValue={b.paymentTerms ?? ""} />
                    </Field>
                    <Field label="Campaign owner (operations)">
                      <Select name="ownerId" defaultValue={b.ownerId ?? ""}>
                        {team.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Notes">
                      <Textarea name="notes" rows={2} defaultValue={b.notes ?? ""} />
                    </Field>
                  </ActionForm>
                </Modal>
              }
            />
            <div className="px-5 py-2">
              <KeyValue
                items={[
                  ["Client", <Link key="c" href={`/clients/${client.id}`} className="text-brand-700 hover:underline">{client.name}</Link>],
                  ["From quote", row.quoteNo ? <Link key="q" href={`/quotes/${b.quoteId}`} className="text-brand-700 hover:underline">{row.quoteNo}</Link> : null],
                  ["Release order", b.roNumber ? `${b.roNumber}${b.roDate ? ` · ${fmtDay(b.roDate)}` : ""}` : <span className="text-amber-700">Not received</span>],
                  ["Advance agreed", b.advanceAmount ? inr(b.advanceAmount) : null],
                  ["Payment terms", b.paymentTerms],
                  ["Campaign owner", owner?.name],
                  ["Notes", b.notes],
                ]}
              />
            </div>
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
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function UploadButton({ bookingId, kind, label, screens }: { bookingId: number; kind: "ro" | "creative" | "pop" | "other"; label: string; screens?: { id: number; name: string }[] }) {
  return (
    <Modal label={label} icon={<Upload />} size="sm" title={`Upload ${label.toLowerCase()}`}>
      <ActionForm action={uploadBookingFileAction} submitLabel="Upload">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="kind" value={kind} />
        {screens && screens.length > 0 && (
          <Field label="Which screen?">
            <Select name="assetId" defaultValue={screens[0]!.id}>
              {screens.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {kind === "pop" && (
          <Field label="Label">
            <Select name="label" defaultValue="Day photo">
              <option>Day photo</option>
              <option>Night photo</option>
              <option>Close-up</option>
            </Select>
          </Field>
        )}
        <Field label="File" required hint={kind === "pop" ? "JPG or PNG, up to 15 MB" : "PDF, image, video or Office file, up to 15 MB"}>
          <Input type="file" name="file" required className="h-auto py-2" accept={kind === "pop" ? "image/*" : undefined} />
        </Field>
      </ActionForm>
    </Modal>
  );
}
