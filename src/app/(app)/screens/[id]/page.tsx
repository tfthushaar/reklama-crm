import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";
import { AlertTriangle, ExternalLink, FilePlus2, Pencil, Trash2, Wrench } from "lucide-react";
import { getDb } from "@/db";
import { assetPhotos, assets, bookingLines, bookings, clients, maintenanceTickets, siteOwners, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { loadAvailability } from "@/lib/availability";
import { ASSET_STATUS, ASSET_TYPE_LABEL, BOOKING_STATUS, OWNERSHIP_LABEL, TICKET_STATUS } from "@/lib/constants";
import { addDays, daysBetween, fmtDay, fmtRange, inr, monthEnd, monthStart, num, relTime, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ActionButton, ActionForm, Modal } from "@/components/forms";
import { AvailabilityStrip, Legend } from "@/components/availability-strip";
import { ScreenFields } from "@/components/screen-form";
import { priceSummary, saleSummary, sizeSummary } from "@/components/screens-nav";
import { BackLink, Badge, Card, CardHeader, EmptyState, Field, Input, KeyValue, LinkButton, Notice, Select, Textarea, cn } from "@/components/ui";
import { createTicketAction, deleteAssetPhotoAction, updateAssetAction, uploadAssetPhotoAction } from "@/app/actions/screens";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const [a] = await db.select({ name: assets.name }).from(assets).where(eq(assets.id, Number((await params).id)));
  return { title: a?.name ?? "Screen" };
}

export default async function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const db = await getDb();
  const [a] = await db.select().from(assets).where(eq(assets.id, id));
  if (!a) notFound();
  const t = today();

  const [photos, owner, owners, tickets, lines, av] = await Promise.all([
    db.select().from(assetPhotos).where(eq(assetPhotos.assetId, id)).orderBy(asc(assetPhotos.id)),
    a.siteOwnerId ? db.select().from(siteOwners).where(eq(siteOwners.id, a.siteOwnerId)).then((r) => r[0]) : null,
    db.select({ id: siteOwners.id, name: siteOwners.name }).from(siteOwners),
    db
      .select({ t: maintenanceTickets, who: users.name })
      .from(maintenanceTickets)
      .leftJoin(users, eq(users.id, maintenanceTickets.assignedTo))
      .where(eq(maintenanceTickets.assetId, id))
      .orderBy(desc(maintenanceTickets.createdAt)),
    db
      .select({ l: bookingLines, b: bookings, client: clients.name })
      .from(bookingLines)
      .innerJoin(bookings, eq(bookings.id, bookingLines.bookingId))
      .innerJoin(clients, eq(clients.id, bookings.clientId))
      .where(and(eq(bookingLines.assetId, id), ne(bookings.status, "cancelled"), gte(bookingLines.endDate, addDays(t, -90))))
      .orderBy(asc(bookingLines.startDate)),
    loadAvailability(db, [id], t, addDays(t, 59)).then((m) => m.get(id)!),
  ]);

  // This month's economics
  const ms = monthStart(t);
  const me = monthEnd(t);
  const monthDays = daysBetween(ms, me);
  let revenue = 0;
  const occupied = new Set<string>();
  for (const { l } of lines) {
    if (!l.startDate || !l.endDate || l.endDate < ms || l.startDate > me) continue;
    const s = l.startDate > ms ? l.startDate : ms;
    const e = l.endDate < me ? l.endDate : me;
    revenue += Math.round((l.amount * daysBetween(s, e)) / daysBetween(l.startDate, l.endDate));
    for (let d = s; d <= e; d = addDays(d, 1)) occupied.add(d);
  }
  const cost = a.rentMonthly ?? 0;
  const margin = revenue - cost;
  const occPct = Math.round((occupied.size / monthDays) * 100);

  const upcoming = lines.filter(({ l }) => l.endDate! >= t);
  const past = lines.filter(({ l }) => l.endDate! < t).reverse();
  const permitWarn = a.permitExpiry && a.permitExpiry <= addDays(t, 30);
  const leaseWarn = a.leaseEnd && a.leaseEnd <= addDays(t, 60);
  const canEdit = can(user, "inventory");

  return (
    <div className="space-y-5">
      <div>
        <BackLink href="/screens" label="Screens" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{a.name}</h1>
              <Badge tone={a.type === "led" ? "purple" : "teal"}>{ASSET_TYPE_LABEL[a.type]}</Badge>
              <Badge tone={ASSET_STATUS[a.status].tone} dot>
                {ASSET_STATUS[a.status].label}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              {a.code}, {[a.address, a.area, a.city].filter(Boolean).join(", ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Modal label="Report issue" icon={<Wrench />} title="Report a problem" description={a.name}>
              <ActionForm action={createTicketAction} submitLabel="Report issue">
                <input type="hidden" name="assetId" value={a.id} />
                <Field label="What's wrong?" required>
                  <Input name="title" required placeholder="e.g. Screen blank since morning" />
                </Field>
                <Field label="Priority">
                  <Select name="priority" defaultValue="normal">
                    <option value="high">High — screen is down</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </Select>
                </Field>
                <Field label="Details">
                  <Textarea name="notes" rows={2} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" name="takeOffline" className="size-4" /> Mark screen as under maintenance
                </label>
              </ActionForm>
            </Modal>
            {canEdit && (
              <Modal label="Edit" icon={<Pencil />} title="Edit screen" wide>
                <ActionForm action={updateAssetAction} submitLabel="Save changes" resetOnSuccess={false}>
                  <input type="hidden" name="id" value={a.id} />
                  <ScreenFields asset={a} owners={owners} />
                </ActionForm>
              </Modal>
            )}
            {can(user, "sales") && a.status === "active" && (
              <LinkButton href={`/quotes/new?asset=${a.id}`}>
                <FilePlus2 /> Quote this screen
              </LinkButton>
            )}
          </div>
        </div>
      </div>

      {(permitWarn || leaseWarn) && (
        <Notice tone="amber" icon={<AlertTriangle />}>
          {permitWarn && (
            <p>
              Permit {a.permitExpiry! < t ? "expired" : "expires"} on <b>{fmtDay(a.permitExpiry)}</b> — renew it before selling dates beyond that.
            </p>
          )}
          {leaseWarn && (
            <p>
              Site agreement ends on <b>{fmtDay(a.leaseEnd)}</b>
              {owner ? ` with ${owner.name}` : ""}.
            </p>
          )}
        </Notice>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Photos"
              description="Day and night photos help clients decide"
              action={
                <Modal label="Upload photo" size="sm" title="Upload a site photo">
                  <ActionForm action={uploadAssetPhotoAction} submitLabel="Upload">
                    <input type="hidden" name="assetId" value={a.id} />
                    <Field label="Photo" required>
                      <Input type="file" name="file" accept="image/*" required className="h-auto py-2" />
                    </Field>
                    <Field label="Taken during">
                      <Select name="kind" defaultValue="day">
                        <option value="day">Day</option>
                        <option value="night">Night</option>
                        <option value="other">Other</option>
                      </Select>
                    </Field>
                  </ActionForm>
                </Modal>
              }
            />
            {photos.length === 0 ? (
              <EmptyState title="No photos yet" />
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4">
                {photos.map((p) => (
                  <div key={p.id} className="group relative overflow-hidden rounded-lg border border-neutral-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`${a.name} ${p.kind}`} className="aspect-[16/10] w-full object-cover" />
                    <span className="absolute top-2 left-2 rounded bg-white/90 px-2 py-0.5 text-xs font-medium capitalize">{p.kind}</span>
                    {canEdit && (
                      <span className="absolute top-2 right-2 opacity-0 transition group-hover:opacity-100">
                        <ActionButton action={deleteAssetPhotoAction} fields={{ id: p.id }} size="sm" variant="danger" confirm="Remove this photo?">
                          <Trash2 />
                        </ActionButton>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Next 60 days" description={a.totalSlots > 1 && a.type === "led" ? `Capacity: ${a.totalSlots} slots per day` : undefined} />
            <div className="space-y-3 px-5 py-4">
              <AvailabilityStrip av={av} maintenance={a.status === "maintenance"} />
              <Legend slots={a.type === "led"} />
            </div>
            {av.holds.length > 0 && (
              <div className="border-t border-neutral-100 px-5 py-3">
                <p className="mb-2 text-[13px] font-medium text-neutral-500">On hold (quote sent, not confirmed)</p>
                <ul className="space-y-1.5 text-sm">
                  {av.holds.map((h, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <Link href={`/quotes/${h.refId}`} className="font-medium text-neutral-900 hover:underline">
                          {h.clientName}
                        </Link>{" "}
                        <span className="text-neutral-500">
                         , {fmtRange(h.startDate, h.endDate)}, {h.exclusive ? "whole screen" : `${h.slots} slot${h.slots > 1 ? "s" : ""}`}
                        </span>
                      </span>
                      <Badge tone="amber">Released {relTime(h.expiresAt!)}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Bookings" description={`${upcoming.length} current or upcoming`} />
            {lines.length === 0 ? (
              <EmptyState title="No bookings yet" />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {[...upcoming, ...past.slice(0, 5)].map(({ l, b, client }) => (
                  <li key={l.id}>
                    <Link href={`/bookings/${b.id}`} className={cn("flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-neutral-50", l.endDate! < t && "opacity-70")}>
                      <div>
                        <p className="font-medium text-neutral-900">{client}</p>
                        <p className="text-xs text-neutral-500">
                          {b.number}, {fmtRange(l.startDate, l.endDate)}, {l.mode === "slots" ? `${l.slots} slot${(l.slots ?? 1) > 1 ? "s" : ""}` : "whole screen"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium tabular-nums">{inr(l.amount)}</span>
                        <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Maintenance history" />
            {tickets.length === 0 ? (
              <p className="px-5 py-4 text-sm text-neutral-500">No issues reported.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {tickets.map(({ t: tk, who }) => (
                  <li key={tk.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{tk.title}</p>
                      <p className="text-xs text-neutral-500">
                        Reported {relTime(tk.createdAt)}
                        {who ? `, ${who}` : ""}
                        {tk.cost ? `, cost ${inr(tk.cost)}` : ""}
                      </p>
                    </div>
                    <Badge tone={TICKET_STATUS[tk.status].tone}>{TICKET_STATUS[tk.status].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="At a glance" />
            <div className="px-5 py-2">
              <KeyValue
                items={[
                  ["Size", sizeSummary(a) || null],
                  ["Sold as", saleSummary(a)],
                  ["Price", priceSummary(a)],
                  ["Minimum booking", `${a.minDays} days`],
                  ["Lighting", a.type === "led" ? "Digital" : a.illumination],
                  ["Operating hours", a.operatingHours],
                  ["Daily traffic", a.dailyTraffic ? `~${num(a.dailyTraffic)}` : null],
                  ["Landmark", a.landmark],
                  [
                    "Map",
                    a.mapLink ? (
                      <a href={a.mapLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                        Open <ExternalLink className="size-3" />
                      </a>
                    ) : null,
                  ],
                ]}
              />
            </div>
          </Card>

          {(can(user, "finance") || can(user, "team") || user.role === "operations") && (
            <Card>
              <CardHeader title="This month" description={`${fmtDay(ms, { year: false })} – ${fmtDay(me)}`} />
              <div className="grid grid-cols-2 gap-px bg-neutral-100">
                <div className="bg-white px-5 py-3">
                  <p className="text-xs text-neutral-500">Occupancy</p>
                  <p className="text-lg font-semibold tabular-nums">{occPct}%</p>
                </div>
                <div className="bg-white px-5 py-3">
                  <p className="text-xs text-neutral-500">Revenue</p>
                  <p className="text-lg font-semibold tabular-nums">{inr(revenue)}</p>
                </div>
                <div className="bg-white px-5 py-3">
                  <p className="text-xs text-neutral-500">{a.ownership === "third_party" ? "Buying cost" : "Site rent"}</p>
                  <p className="text-lg font-semibold tabular-nums">{cost ? inr(cost) : "—"}</p>
                </div>
                <div className="bg-white px-5 py-3">
                  <p className="text-xs text-neutral-500">Margin</p>
                  <p className={cn("text-lg font-semibold tabular-nums", margin < 0 ? "text-red-600" : "text-neutral-900")}>{inr(margin)}</p>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Site & compliance" />
            <div className="px-5 py-2">
              <KeyValue
                items={[
                  ["Ownership", OWNERSHIP_LABEL[a.ownership]],
                  ["Site owner", owner ? <Link href="/screens/owners" className="text-brand-700 hover:underline">{owner.name}</Link> : null],
                  ["Owner phone", owner?.phone],
                  [a.ownership === "third_party" ? "Buying cost" : "Rent", a.rentMonthly ? `${inr(a.rentMonthly)}/month` : null],
                  ["Agreement ends", a.leaseEnd ? <span className={cn(leaseWarn && "text-neutral-900")}>{fmtDay(a.leaseEnd)}</span> : null],
                  ["Permit no.", a.permitNumber],
                  ["Permit valid till", a.permitExpiry ? <span className={cn(permitWarn && "text-red-600")}>{fmtDay(a.permitExpiry)}</span> : null],
                ]}
              />
            </div>
            {a.notes && <p className="border-t border-neutral-100 px-5 py-3 text-sm text-neutral-600">{a.notes}</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
