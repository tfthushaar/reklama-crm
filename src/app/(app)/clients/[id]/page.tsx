import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { ArrowRight, FilePlus2, Mail, MessageCircle, Pencil, Phone, Plus, UserCog } from "lucide-react";
import { getDb } from "@/db";
import { activities, bookings, clients, contacts, invoices, quoteVersions, quotes, tasks, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ACTIVITY_TYPES, BOOKING_STATUS, CLIENT_TYPE_LABEL, INVOICE_STATUS, QUOTE_STATUS, stageInfo } from "@/lib/constants";
import { dayOf, dueLabel, fmtDay, fmtRange, inr, inrShort, relTime, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { outstandingSummary, paidSq } from "@/lib/queries";
import { stateName } from "@/lib/pricing";
import { ActionForm, Modal } from "@/components/forms";
import { ClientFields } from "@/components/client-form";
import { LogActivityButton, TimelineEntry, waLink } from "@/components/activity";
import { StageStepper } from "@/components/stage-stepper";
import { NewTaskButton, TaskRow, type TaskView } from "@/components/tasks";
import { Avatar, Badge, Card, CardHeader, EmptyState, Field, Input, KeyValue, LinkButton, Select, Tabs, cn, table } from "@/components/ui";
import { addContactAction, assignOwnerAction, updateClientAction } from "@/app/actions/clients";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const [c] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, Number((await params).id)));
  return { title: c?.name ?? "Client" };
}

const TABS = ["timeline", "quotes", "bookings", "invoices", "contacts"] as const;

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; type?: string; user?: string }>;
}) {
  const user = await requireUser();
  const id = Number((await params).id);
  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "timeline";
  const db = await getDb();

  const [row] = await db.select({ c: clients, owner: users.name }).from(clients).leftJoin(users, eq(users.id, clients.ownerId)).where(eq(clients.id, id));
  if (!row) notFound();
  const c = row.c;

  const [contactRows, openTasks, quoteRows, bookingRows, invoiceRows, out, team, counts] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.clientId, id)).orderBy(desc(contacts.isPrimary), asc(contacts.id)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueAt: tasks.dueAt,
        priority: tasks.priority,
        status: tasks.status,
        outcome: tasks.outcome,
        clientId: tasks.clientId,
        clientName: sql<string | null>`null`,
        assigneeName: users.name,
        refType: tasks.refType,
        refId: tasks.refId,
      })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assignedTo))
      .where(and(eq(tasks.clientId, id), eq(tasks.status, "open")))
      .orderBy(asc(tasks.dueAt)),
    db
      .select({ q: quotes, v: quoteVersions, by: users.name })
      .from(quotes)
      .innerJoin(quoteVersions, and(eq(quoteVersions.quoteId, quotes.id), eq(quoteVersions.version, quotes.currentVersion)))
      .leftJoin(users, eq(users.id, quotes.createdBy))
      .where(eq(quotes.clientId, id))
      .orderBy(desc(quotes.createdAt)),
    db.select().from(bookings).where(eq(bookings.clientId, id)).orderBy(desc(bookings.startDate)),
    (() => {
      const p = paidSq(db);
      return db
        .select({ i: invoices, paid: p.paid })
        .from(invoices)
        .leftJoin(p, eq(p.invoiceId, invoices.id))
        .where(eq(invoices.clientId, id))
        .orderBy(desc(invoices.issueDate));
    })(),
    outstandingSummary(db, id),
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.role, ["sales_exec", "sales_manager", "owner"])),
    db
      .select({ n: sql<number>`count(*)` })
      .from(activities)
      .where(and(eq(activities.clientId, id), inArray(activities.type, ["call", "whatsapp", "email", "meeting"]))),
  ]);

  const primary = contactRows[0];
  const phone = primary?.phone ?? c.phone;
  const email = primary?.email ?? c.email;
  const business = bookingRows.filter((b) => b.status !== "cancelled").reduce((s, b) => s + b.total, 0);
  const nextTask = openTasks[0];
  const st = stageInfo(c.stage);
  const isSales = can(user, "sales");

  // ---------- smart next step ----------
  const activeQuote = quoteRows.find((r) => ["draft", "pending_approval", "sent"].includes(r.q.status));
  const unbilled = bookingRows.find((b) => b.status !== "cancelled" && !invoiceRows.some((i) => i.i.bookingId === b.id && i.i.status !== "cancelled"));
  const unpaid = invoiceRows.find((i) => ["issued", "partial"].includes(i.i.status));
  let next: { title: string; text: string; href?: string; cta?: string; tone: "blue" | "amber" | "green" } | null = null;
  if (c.stage === "lost") next = null;
  else if (counts[0]!.n === 0)
    next = { title: "Make the first contact", text: `Call or WhatsApp ${primary?.name ?? c.name} and log how it went.`, tone: "blue" };
  else if (activeQuote?.q.status === "pending_approval")
    next = { title: "Quote waiting for approval", text: `${activeQuote.q.number} has a ${activeQuote.v.maxDiscountPct}% discount that needs a manager's OK.`, href: `/quotes/${activeQuote.q.id}`, cta: "Open quote", tone: "amber" };
  else if (activeQuote?.q.status === "draft")
    next = { title: "Send the quote", text: `${activeQuote.q.number} is ready — send it by email or WhatsApp to hold the screens.`, href: `/quotes/${activeQuote.q.id}`, cta: "Open quote", tone: "blue" };
  else if (activeQuote?.q.status === "sent")
    next = { title: "Get a decision on the quote", text: `${activeQuote.q.number} (${inr(activeQuote.v.total)}) was sent ${relTime(activeQuote.q.sentAt)}. Follow up and mark it accepted when they confirm.`, href: `/quotes/${activeQuote.q.id}`, cta: "Open quote", tone: "amber" };
  else if (unbilled && can(user, "finance"))
    next = { title: "Raise the invoice", text: `Booking ${unbilled.number} hasn't been billed yet.`, href: `/invoices/new?booking=${unbilled.id}`, cta: "Create invoice", tone: "blue" };
  else if (unpaid)
    next = { title: "Collect payment", text: `${unpaid.i.number} — ${inr(unpaid.i.total - Number(unpaid.paid ?? 0))} due ${fmtDay(unpaid.i.dueDate)}.`, href: `/invoices/${unpaid.i.id}`, cta: "Open invoice", tone: "amber" };
  else if (["qualified", "meeting", "negotiation", "contacted"].includes(c.stage))
    next = { title: "Prepare a quote", text: "Pick screens and dates — availability is checked for you.", href: `/quotes/new?client=${c.id}`, cta: "New quote", tone: "blue" };
  else if (c.stage === "won")
    next = { title: "Keep them coming back", text: "Offer a renewal or a new campaign before their current one ends.", href: `/quotes/new?client=${c.id}`, cta: "New quote", tone: "green" };

  const tabHref = (t: string) => `/clients/${id}?tab=${t}`;
  const tabItems = [
    { label: "Timeline", href: tabHref("timeline"), active: tab === "timeline" },
    { label: "Quotes", href: tabHref("quotes"), active: tab === "quotes", count: quoteRows.length },
    { label: "Bookings", href: tabHref("bookings"), active: tab === "bookings", count: bookingRows.length },
    { label: "Invoices", href: tabHref("invoices"), active: tab === "invoices", count: invoiceRows.length },
    { label: "Contacts", href: tabHref("contacts"), active: tab === "contacts", count: contactRows.length },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link href={c.stage === "won" ? "/clients?tab=won" : "/leads"} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          ← {c.stage === "won" ? "Clients" : "Leads"}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{c.name}</h1>
              <Badge tone={st.tone}>{st.label}</Badge>
              {c.type !== "advertiser" && <Badge tone="purple">{CLIENT_TYPE_LABEL[c.type]}</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {[c.industry, c.city, c.source && `Source: ${c.source}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Modal label="Edit" icon={<Pencil />} title="Edit client details" wide>
              <ActionForm action={updateClientAction} submitLabel="Save changes" resetOnSuccess={false}>
                <input type="hidden" name="id" value={c.id} />
                <ClientFields client={c} />
              </ActionForm>
            </Modal>
            {isSales && (
              <LinkButton href={`/quotes/new?client=${c.id}`} variant="primary">
                <FilePlus2 /> New quote
              </LinkButton>
            )}
          </div>
        </div>
      </div>

      <Card className="p-4">
        <StageStepper clientId={c.id} stage={c.stage} lostReason={c.lostReason} canEdit={isSales} />
      </Card>

      {/* Quick actions */}
      <Card className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3 lg:w-72">
          <Avatar name={primary?.name ?? c.name} />
          <div className="min-w-0 text-sm leading-tight">
            <p className="truncate font-medium text-slate-900">{primary?.name ?? "No contact yet"}</p>
            <p className="truncate text-slate-500">{[primary?.designation, phone].filter(Boolean).join(" · ") || "Add a phone number"}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-wrap gap-2 lg:justify-end">
          <LogActivityButton kind="call" clientId={c.id} clientName={c.name} phone={phone} />
          <LogActivityButton kind="whatsapp" clientId={c.id} clientName={c.name} phone={phone} />
          <LogActivityButton kind="email" clientId={c.id} clientName={c.name} email={email} />
          <LogActivityButton kind="meeting" clientId={c.id} clientName={c.name} />
          <LogActivityButton kind="note" clientId={c.id} clientName={c.name} />
          <NewTaskButton clientId={c.id} clientName={c.name} variant="secondary" label="Reminder" />
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MiniStat label="Conversations" value={counts[0]!.n} />
        <MiniStat label="Last contacted" value={c.lastActivityAt ? relTime(c.lastActivityAt) : "Never"} />
        <MiniStat
          label="Next follow-up"
          value={nextTask ? dueLabel(nextTask.dueAt) : "None set"}
          tone={nextTask && new Date(nextTask.dueAt).getTime() < Date.now() ? "red" : undefined}
        />
        <MiniStat label="Business booked" value={business ? inrShort(business) : "—"} />
        <MiniStat label="Outstanding" value={out.outstanding ? inrShort(out.outstanding) : "—"} tone={out.overdue ? "red" : undefined} />
      </div>

      {next && (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center",
            next.tone === "amber" && "border-amber-200 bg-amber-50",
            next.tone === "blue" && "border-brand-200 bg-brand-50",
            next.tone === "green" && "border-emerald-200 bg-emerald-50",
          )}
        >
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Next step</p>
            <p className="mt-0.5 font-semibold text-slate-900">{next.title}</p>
            <p className="text-sm text-slate-600">{next.text}</p>
          </div>
          {next.href && (
            <LinkButton href={next.href}>
              {next.cta} <ArrowRight />
            </LinkButton>
          )}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Tabs items={tabItems} />
          {tab === "timeline" && <Timeline clientId={id} type={sp.type} userFilter={sp.user} />}
          {tab === "quotes" && (
            <Card>
              {quoteRows.length === 0 ? (
                <EmptyState title="No quotes yet" action={isSales && <LinkButton href={`/quotes/new?client=${c.id}`}>New quote</LinkButton>} />
              ) : (
                <div className={table.wrap}>
                  <table className={table.table}>
                    <thead>
                      <tr>
                        <th className={table.th}>Quote</th>
                        <th className={table.th}>Status</th>
                        <th className={table.th}>By</th>
                        <th className={cn(table.th, "text-right")}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quoteRows.map(({ q, v, by }) => (
                        <tr key={q.id} className={table.tr}>
                          <td className={table.td}>
                            <Link href={`/quotes/${q.id}`} className="font-medium text-slate-900 hover:underline">
                              {q.title}
                            </Link>
                            <p className="text-xs text-slate-500">
                              {q.number}
                              {q.currentVersion > 1 && ` · version ${q.currentVersion}`} · {fmtDay(dayOf(q.createdAt))}
                            </p>
                          </td>
                          <td className={table.td}>
                            <Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge>
                          </td>
                          <td className={cn(table.td, "text-slate-600")}>{by}</td>
                          <td className={cn(table.td, "text-right font-medium tabular-nums")}>{inr(v.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
          {tab === "bookings" && (
            <Card>
              {bookingRows.length === 0 ? (
                <EmptyState title="No bookings yet" text="Bookings appear here when a quote is accepted." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {bookingRows.map((b) => (
                    <li key={b.id}>
                      <Link href={`/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50">
                        <div>
                          <p className="font-medium text-slate-900">{b.title}</p>
                          <p className="text-xs text-slate-500">
                            {b.number} · {fmtRange(b.startDate, b.endDate)}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
                          <p className="mt-1 text-sm font-medium tabular-nums">{inr(b.total)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {tab === "invoices" && (
            <Card>
              {invoiceRows.length === 0 ? (
                <EmptyState title="No invoices yet" />
              ) : (
                <div className={table.wrap}>
                  <table className={table.table}>
                    <thead>
                      <tr>
                        <th className={table.th}>Invoice</th>
                        <th className={table.th}>Status</th>
                        <th className={table.th}>Due</th>
                        <th className={cn(table.th, "text-right")}>Total</th>
                        <th className={cn(table.th, "text-right")}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceRows.map(({ i, paid }) => {
                        const bal = i.total - Number(paid ?? 0);
                        const overdue = ["issued", "partial"].includes(i.status) && i.dueDate < today();
                        return (
                          <tr key={i.id} className={table.tr}>
                            <td className={table.td}>
                              <Link href={`/invoices/${i.id}`} className="font-medium text-slate-900 hover:underline">
                                {i.number ?? "Draft"}
                              </Link>
                              <p className="text-xs text-slate-500">{i.kind === "proforma" ? "Proforma" : "Tax invoice"} · {fmtDay(i.issueDate)}</p>
                            </td>
                            <td className={table.td}>
                              <Badge tone={overdue ? "red" : INVOICE_STATUS[i.status].tone}>{overdue ? "Overdue" : INVOICE_STATUS[i.status].label}</Badge>
                            </td>
                            <td className={cn(table.td, overdue && "font-medium text-red-600")}>{fmtDay(i.dueDate)}</td>
                            <td className={cn(table.td, "text-right tabular-nums")}>{inr(i.total)}</td>
                            <td className={cn(table.td, "text-right font-medium tabular-nums")}>{i.status === "cancelled" ? "—" : inr(bal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
          {tab === "contacts" && (
            <Card>
              <CardHeader
                title="People at this company"
                action={
                  <Modal label="Add contact" icon={<Plus />} size="sm" title="Add a contact">
                    <ActionForm action={addContactAction} submitLabel="Add contact">
                      <input type="hidden" name="clientId" value={c.id} />
                      <Field label="Name" required>
                        <Input name="name" required />
                      </Field>
                      <Field label="Designation">
                        <Input name="designation" />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Phone">
                          <Input name="phone" type="tel" />
                        </Field>
                        <Field label="Email">
                          <Input name="email" type="email" />
                        </Field>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" name="isPrimary" className="size-4" /> Main contact
                      </label>
                    </ActionForm>
                  </Modal>
                }
              />
              <ul className="divide-y divide-slate-100">
                {contactRows.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Avatar name={p.name} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        {p.name} {p.isPrimary && <Badge tone="blue">Main contact</Badge>}
                      </p>
                      <p className="text-sm text-slate-500">{p.designation}</p>
                    </div>
                    <div className="flex gap-1">
                      {p.phone && (
                        <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title={p.phone}>
                          <Phone className="size-4" />
                        </a>
                      )}
                      {waLink(p.phone) && (
                        <a href={waLink(p.phone)!} target="_blank" rel="noreferrer" className="rounded-md p-2 text-emerald-600 hover:bg-emerald-50" title="WhatsApp">
                          <MessageCircle className="size-4" />
                        </a>
                      )}
                      {p.email && (
                        <a href={`mailto:${p.email}`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title={p.email}>
                          <Mail className="size-4" />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Follow-ups" description={openTasks.length ? `${openTasks.length} open` : "Nothing scheduled"} />
            {openTasks.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Use &ldquo;Reminder&rdquo; above so this client isn&apos;t forgotten.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(openTasks as TaskView[]).map((t) => (
                  <TaskRow key={t.id} task={t} showAssignee />
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader
              title="Details"
              action={
                can(user, "assign") && (
                  <Modal label="Reassign" icon={<UserCog />} size="sm" variant="ghost" title="Who owns this client?">
                    <ActionForm action={assignOwnerAction} submitLabel="Save">
                      <input type="hidden" name="id" value={c.id} />
                      <Field label="Owner">
                        <Select name="ownerId" defaultValue={c.ownerId ? String(c.ownerId) : "none"}>
                          {team.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                          <option value="none">Unassigned</option>
                        </Select>
                      </Field>
                    </ActionForm>
                  </Modal>
                )
              }
            />
            <div className="px-5 py-2">
              <KeyValue
                items={[
                  ["Owner", row.owner ?? <span className="text-amber-700">Unassigned</span>],
                  ["Phone", phone],
                  ["Email", email],
                  ["Requirement", c.requirement],
                  ["Budget", c.budget ? inr(c.budget) : null],
                  ["Preferred locations", c.preferredLocations],
                  ["Timing", c.timing],
                  ["GSTIN", c.gstin],
                  ["GST state", stateName(c.stateCode)],
                  ...(c.type === "agency" ? ([["Agency commission", `${c.agencyCommission}%`]] as [string, string][]) : []),
                  ["Credit period", c.creditDays ? `${c.creditDays} days` : null],
                  ["Added", fmtDay(dayOf(c.createdAt))],
                ]}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "red" }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("mt-0.5 truncate text-[15px] font-semibold text-slate-900", tone === "red" && "text-red-600")}>{value}</p>
    </Card>
  );
}

async function Timeline({ clientId, type, userFilter }: { clientId: number; type?: string; userFilter?: string }) {
  const db = await getDb();
  const where = [eq(activities.clientId, clientId)];
  if (type && type in ACTIVITY_TYPES) where.push(eq(activities.type, type as keyof typeof ACTIVITY_TYPES));
  if (userFilter && /^\d+$/.test(userFilter)) where.push(eq(activities.userId, Number(userFilter)));
  const rows = await db
    .select({ a: activities, who: users.name })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.userId))
    .where(and(...where))
    .orderBy(desc(activities.occurredAt))
    .limit(200);
  const people = await db
    .selectDistinct({ id: users.id, name: users.name })
    .from(activities)
    .innerJoin(users, eq(users.id, activities.userId))
    .where(and(eq(activities.clientId, clientId), ne(activities.type, "system")));

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const d = dayOf(r.a.occurredAt);
    groups.set(d, [...(groups.get(d) ?? []), r]);
  }
  const t = today();
  const label = (d: string) => (d === t ? "Today" : fmtDay(d));
  const q = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ tab: "timeline" });
    const merged = { type, user: userFilter, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/clients/${clientId}?${p}`;
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        {[["", "All"], ...Object.entries(ACTIVITY_TYPES).map(([k, v]) => [k, v.label])].map(([k, l]) => (
          <Link
            key={k}
            href={q({ type: k || undefined })}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              (type ?? "") === k ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {l}
          </Link>
        ))}
        {people.length > 1 && (
          <span className="ml-auto flex flex-wrap gap-1">
            {people.map((p) => (
              <Link
                key={p.id}
                href={q({ user: userFilter === String(p.id) ? undefined : String(p.id) })}
                title={`Only ${p.name}`}
                className={cn("rounded-full ring-2", userFilter === String(p.id) ? "ring-brand-500" : "ring-transparent")}
              >
                <Avatar name={p.name} size="sm" />
              </Link>
            ))}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing logged yet" text="Use the buttons above to log calls, messages and meetings." />
      ) : (
        <div className="space-y-6 px-5 py-5">
          {[...groups.entries()].map(([d, items]) => (
            <div key={d}>
              <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">{label(d)}</p>
              <ul>
                {items.map(({ a, who }) => (
                  <TimelineEntry key={a.id} a={{ ...a, who }} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
