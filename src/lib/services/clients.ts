import type { Executor } from "@/db";
import { clients, contacts } from "@/db/schema";
import { eq } from "drizzle-orm";

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);
const STOP = /(pvt|private|ltd|limited|llp|inc|co|company|the)$/g;

export type DupCandidate = { name?: string | null; phone?: string | null; email?: string | null; gstin?: string | null };

/** Loads everything needed for duplicate checks once, so bulk imports stay fast. */
export async function duplicateIndex(db: Executor) {
  const rows = await db
    .select({ id: clients.id, name: clients.name, phone: clients.phone, email: clients.email, gstin: clients.gstin })
    .from(clients);
  const contactRows = await db.select({ clientId: contacts.clientId, phone: contacts.phone, email: contacts.email }).from(contacts);
  const byName = new Map<string, { id: number; name: string }>();
  const byPhone = new Map<string, { id: number; name: string }>();
  const byEmail = new Map<string, { id: number; name: string }>();
  const byGstin = new Map<string, { id: number; name: string }>();
  const names = new Map(rows.map((r) => [r.id, r.name]));
  for (const r of rows) {
    const ref = { id: r.id, name: r.name };
    byName.set(norm(r.name).replace(STOP, ""), ref);
    if (digits(r.phone).length === 10) byPhone.set(digits(r.phone), ref);
    if (r.email) byEmail.set(r.email.toLowerCase(), ref);
    if (r.gstin) byGstin.set(r.gstin.toUpperCase(), ref);
  }
  for (const c of contactRows) {
    const ref = { id: c.clientId, name: names.get(c.clientId) ?? "" };
    if (digits(c.phone).length === 10) byPhone.set(digits(c.phone), ref);
    if (c.email) byEmail.set(c.email.toLowerCase(), ref);
  }

  return function find(c: DupCandidate) {
    const hits = new Map<number, { id: number; name: string; why: string }>();
    const add = (ref: { id: number; name: string } | undefined, why: string) => {
      if (ref && !hits.has(ref.id)) hits.set(ref.id, { ...ref, why });
    };
    if (c.gstin) add(byGstin.get(c.gstin.toUpperCase()), "same GSTIN");
    if (digits(c.phone).length === 10) add(byPhone.get(digits(c.phone)), "same phone");
    if (c.email) add(byEmail.get(c.email.toLowerCase()), "same email");
    if (c.name) add(byName.get(norm(c.name).replace(STOP, "")), "same name");
    return [...hits.values()];
  };
}

export async function primaryContact(db: Executor, clientId: number) {
  const rows = await db.select().from(contacts).where(eq(contacts.clientId, clientId));
  return rows.find((r) => r.isPrimary) ?? rows[0] ?? null;
}
