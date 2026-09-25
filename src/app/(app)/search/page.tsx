import Link from "next/link";
import { desc, eq, like, or } from "drizzle-orm";
import { Search } from "lucide-react";
import { getDb } from "@/db";
import { assets, bookings, clients, contacts, invoices, quotes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { BOOKING_STATUS, INVOICE_STATUS, QUOTE_STATUS, stageInfo } from "@/lib/constants";
import { fmtRange, inr } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = (await searchParams).q?.trim() ?? "";
  if (q.length < 2) {
    return (
      <div>
        <PageHeader title="Search" />
        <Card>
          <EmptyState icon={<Search />} title="Type at least 2 letters" text="Search by company, contact, phone, GSTIN, screen, quote, booking or invoice number." />
        </Card>
      </div>
    );
  }
  const pattern = `%${q}%`;
  const db = await getDb();
  const [cl, ct, sc, qt, bk, iv] = await Promise.all([
    db.select().from(clients).where(or(like(clients.name, pattern), like(clients.gstin, pattern), like(clients.phone, pattern), like(clients.email, pattern))).limit(10),
    db
      .select({ p: contacts, c: clients })
      .from(contacts)
      .innerJoin(clients, eq(clients.id, contacts.clientId))
      .where(or(like(contacts.name, pattern), like(contacts.phone, pattern), like(contacts.email, pattern)))
      .limit(10),
    db.select().from(assets).where(or(like(assets.name, pattern), like(assets.code, pattern), like(assets.area, pattern))).limit(10),
    db
      .select({ q: quotes, c: clients.name })
      .from(quotes)
      .innerJoin(clients, eq(clients.id, quotes.clientId))
      .where(or(like(quotes.number, pattern), like(quotes.title, pattern), like(clients.name, pattern)))
      .orderBy(desc(quotes.createdAt))
      .limit(10),
    db
      .select({ b: bookings, c: clients.name })
      .from(bookings)
      .innerJoin(clients, eq(clients.id, bookings.clientId))
      .where(or(like(bookings.number, pattern), like(bookings.title, pattern), like(bookings.roNumber, pattern), like(clients.name, pattern)))
      .limit(10),
    db
      .select({ i: invoices, c: clients.name })
      .from(invoices)
      .innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(or(like(invoices.number, pattern), like(clients.name, pattern)))
      .limit(10),
  ]);
  const total = cl.length + ct.length + sc.length + qt.length + bk.length + iv.length;

  const Section = ({ title, children, n }: { title: string; children: React.ReactNode; n: number }) =>
    n > 0 ? (
      <Card>
        <p className="border-b border-slate-100 px-5 py-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {title} · {n}
        </p>
        <ul className="divide-y divide-slate-100">{children}</ul>
      </Card>
    ) : null;
  const Item = ({ href, title, sub, badge }: { href: string; title: string; sub?: string; badge?: React.ReactNode }) => (
    <li>
      <Link href={href} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
        <span>
          <span className="block font-medium text-slate-900">{title}</span>
          {sub && <span className="text-xs text-slate-500">{sub}</span>}
        </span>
        {badge}
      </Link>
    </li>
  );

  return (
    <div className="space-y-4">
      <PageHeader title={`Results for “${q}”`} subtitle={`${total} match${total === 1 ? "" : "es"}`} />
      {total === 0 && (
        <Card>
          <EmptyState icon={<Search />} title="Nothing found" text="Try part of a name, a phone number or a document number." />
        </Card>
      )}
      <Section title="Clients & leads" n={cl.length}>
        {cl.map((c) => (
          <Item key={c.id} href={`/clients/${c.id}`} title={c.name} sub={[c.industry, c.city, c.gstin].filter(Boolean).join(" · ")} badge={<Badge tone={stageInfo(c.stage).tone}>{stageInfo(c.stage).label}</Badge>} />
        ))}
      </Section>
      <Section title="Contacts" n={ct.length}>
        {ct.map(({ p, c }) => (
          <Item key={p.id} href={`/clients/${c.id}`} title={p.name} sub={`${c.name} · ${[p.phone, p.email].filter(Boolean).join(" · ")}`} />
        ))}
      </Section>
      <Section title="Screens" n={sc.length}>
        {sc.map((a) => (
          <Item key={a.id} href={`/screens/${a.id}`} title={a.name} sub={`${a.code} · ${a.area}, ${a.city}`} />
        ))}
      </Section>
      <Section title="Quotes" n={qt.length}>
        {qt.map(({ q: x, c }) => (
          <Item key={x.id} href={`/quotes/${x.id}`} title={`${x.number} — ${x.title}`} sub={c} badge={<Badge tone={QUOTE_STATUS[x.status].tone}>{QUOTE_STATUS[x.status].label}</Badge>} />
        ))}
      </Section>
      <Section title="Bookings" n={bk.length}>
        {bk.map(({ b, c }) => (
          <Item key={b.id} href={`/bookings/${b.id}`} title={`${b.number} — ${b.title}`} sub={`${c} · ${fmtRange(b.startDate, b.endDate)}`} badge={<Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>} />
        ))}
      </Section>
      <Section title="Invoices" n={iv.length}>
        {iv.map(({ i, c }) => (
          <Item key={i.id} href={`/invoices/${i.id}`} title={i.number ?? "Draft invoice"} sub={`${c} · ${inr(i.total)}`} badge={<Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>} />
        ))}
      </Section>
    </div>
  );
}
