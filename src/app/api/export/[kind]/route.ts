import ExcelJS from "exceljs";
import { asc, eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { activities, assets, bookings, clients, contacts, invoices, payments, quoteVersions, quotes, siteOwners, tasks, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { paidSq } from "@/lib/queries";
import { today } from "@/lib/format";

type Sheet = { name: string; columns: string[]; rows: (string | number | null)[][] };
const r = (p: number | null | undefined) => (p == null ? null : Math.round(p) / 100);
const d = (x: Date | null | undefined) => (x ? x.toISOString().replace("T", " ").slice(0, 16) : null);

const BUILDERS: Record<string, { finance?: boolean; build: (db: DB) => Promise<Sheet> }> = {
  clients: {
    build: async (db) => {
      const rows = await db.select({ c: clients, owner: users.name }).from(clients).leftJoin(users, eq(users.id, clients.ownerId)).orderBy(asc(clients.name));
      return {
        name: "Clients",
        columns: ["Company", "Type", "Stage", "Industry", "City", "Phone", "Email", "GSTIN", "Source", "Owner", "Budget (₹)", "Requirement", "Last contacted", "Added"],
        rows: rows.map(({ c, owner }) => [c.name, c.type, c.stage, c.industry, c.city, c.phone, c.email, c.gstin, c.source, owner, r(c.budget), c.requirement, d(c.lastActivityAt), d(c.createdAt)]),
      };
    },
  },
  contacts: {
    build: async (db) => {
      const rows = await db.select({ p: contacts, c: clients.name }).from(contacts).innerJoin(clients, eq(clients.id, contacts.clientId));
      return { name: "Contacts", columns: ["Company", "Name", "Designation", "Phone", "Email", "Main contact"], rows: rows.map(({ p, c }) => [c, p.name, p.designation, p.phone, p.email, p.isPrimary ? "Yes" : ""]) };
    },
  },
  screens: {
    build: async (db) => {
      const rows = await db.select({ a: assets, o: siteOwners.name }).from(assets).leftJoin(siteOwners, eq(siteOwners.id, assets.siteOwnerId)).orderBy(asc(assets.code));
      return {
        name: "Screens",
        columns: ["Code", "Name", "Type", "City", "Area", "Address", "Width ft", "Height ft", "Resolution", "Sale mode", "Slots", "Slot sec", "Monthly rate (₹)", "Slot rate (₹)", "Status", "Ownership", "Site owner", "Rent (₹)", "Lease ends", "Permit no.", "Permit expiry"],
        rows: rows.map(({ a, o }) => [a.code, a.name, a.type, a.city, a.area, a.address, a.widthFt, a.heightFt, a.resolution, a.saleMode, a.totalSlots, a.slotSeconds, r(a.monthlyRate), r(a.slotRate), a.status, a.ownership, o, r(a.rentMonthly), a.leaseEnd, a.permitNumber, a.permitExpiry]),
      };
    },
  },
  quotes: {
    build: async (db) => {
      const rows = await db
        .select({ q: quotes, v: quoteVersions, c: clients.name, by: users.name })
        .from(quotes)
        .innerJoin(quoteVersions, eq(quoteVersions.quoteId, quotes.id))
        .innerJoin(clients, eq(clients.id, quotes.clientId))
        .leftJoin(users, eq(users.id, quotes.createdBy));
      return {
        name: "Quotes",
        columns: ["Number", "Version", "Title", "Client", "Status", "By", "Taxable (₹)", "GST (₹)", "Total (₹)", "Max discount %", "Created"],
        rows: rows
          .filter(({ q, v }) => v.version === q.currentVersion)
          .map(({ q, v, c, by }) => [q.number, v.version, q.title, c, q.status, by, r(v.taxable), r(v.cgst + v.sgst + v.igst), r(v.total), v.maxDiscountPct, d(q.createdAt)]),
      };
    },
  },
  bookings: {
    build: async (db) => {
      const rows = await db.select({ b: bookings, c: clients.name }).from(bookings).innerJoin(clients, eq(clients.id, bookings.clientId)).orderBy(asc(bookings.startDate));
      return {
        name: "Bookings",
        columns: ["Number", "Campaign", "Client", "Status", "Start", "End", "RO number", "RO date", "Total (₹)"],
        rows: rows.map(({ b, c }) => [b.number, b.title, c, b.status, b.startDate, b.endDate, b.roNumber, b.roDate, r(b.total)]),
      };
    },
  },
  invoices: {
    finance: true,
    build: async (db) => {
      const p = paidSq(db);
      const rows = await db
        .select({ i: invoices, c: clients, paid: p.paid, tds: p.tds })
        .from(invoices)
        .innerJoin(clients, eq(clients.id, invoices.clientId))
        .leftJoin(p, eq(p.invoiceId, invoices.id))
        .orderBy(asc(invoices.issueDate));
      return {
        name: "Invoices",
        columns: ["Number", "Kind", "Status", "Date", "Due", "Client", "Client GSTIN", "Place of supply", "Gross (₹)", "Commission (₹)", "Taxable (₹)", "CGST (₹)", "SGST (₹)", "IGST (₹)", "Total (₹)", "Received incl. TDS (₹)", "TDS (₹)", "Balance (₹)"],
        rows: rows.map(({ i, c, paid, tds }) => [
          i.number,
          i.kind,
          i.status,
          i.issueDate,
          i.dueDate,
          c.name,
          c.gstin,
          i.placeOfSupply,
          r(i.gross),
          r(i.commission),
          r(i.taxable),
          r(i.cgst),
          r(i.sgst),
          r(i.igst),
          r(i.total),
          r(Number(paid ?? 0)),
          r(Number(tds ?? 0)),
          i.status === "cancelled" ? 0 : r(i.total - Number(paid ?? 0)),
        ]),
      };
    },
  },
  payments: {
    finance: true,
    build: async (db) => {
      const rows = await db
        .select({ p: payments, i: invoices.number, c: clients.name })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .innerJoin(clients, eq(clients.id, payments.clientId))
        .orderBy(asc(payments.date));
      return {
        name: "Payments",
        columns: ["Receipt", "Date", "Client", "Invoice", "Amount (₹)", "TDS (₹)", "Mode", "Reference"],
        rows: rows.map(({ p, i, c }) => [p.receiptNumber, p.date, c, i, r(p.amount), r(p.tds), p.mode, p.reference]),
      };
    },
  },
  activities: {
    build: async (db) => {
      const rows = await db
        .select({ a: activities, c: clients.name, u: users.name })
        .from(activities)
        .innerJoin(clients, eq(clients.id, activities.clientId))
        .leftJoin(users, eq(users.id, activities.userId))
        .orderBy(asc(activities.occurredAt));
      return {
        name: "Activity",
        columns: ["When", "Client", "Who", "Type", "Direction", "Outcome", "Notes"],
        rows: rows.map(({ a, c, u }) => [d(a.occurredAt), c, u, a.type, a.direction, a.outcome, a.notes]),
      };
    },
  },
  tasks: {
    build: async (db) => {
      const rows = await db
        .select({ t: tasks, c: clients.name, u: users.name })
        .from(tasks)
        .leftJoin(clients, eq(clients.id, tasks.clientId))
        .leftJoin(users, eq(users.id, tasks.assignedTo))
        .orderBy(asc(tasks.dueAt));
      return {
        name: "Tasks",
        columns: ["Due", "Title", "Client", "Assigned to", "Priority", "Status", "Outcome"],
        rows: rows.map(({ t, c, u }) => [d(t.dueAt), t.title, c, u, t.priority, t.status, t.outcome]),
      };
    },
  },
};

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { kind } = await ctx.params;
  const keys = kind === "all" ? Object.keys(BUILDERS) : [kind];
  if (kind === "all" && !can(user, "admin")) return new Response("Only the owner can export everything", { status: 403 });
  const db = await getDb();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Reklama CRM";
  for (const k of keys) {
    const b = BUILDERS[k];
    if (!b) return new Response("Not found", { status: 404 });
    if (b.finance && !(can(user, "finance") || can(user, "team"))) return new Response("Forbidden", { status: 403 });
    const sheet = await b.build(db);
    const ws = wb.addWorksheet(sheet.name);
    ws.addRow(sheet.columns);
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2640" } };
    for (const row of sheet.rows) ws.addRow(row);
    ws.columns.forEach((col, i) => {
      col.width = Math.min(45, Math.max(10, sheet.columns[i]!.length + 2, ...sheet.rows.slice(0, 200).map((r2) => String(r2[i] ?? "").length + 2)));
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  const buf = await wb.xlsx.writeBuffer();
  const name = `reklama-${kind}-${today()}.xlsx`;
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
