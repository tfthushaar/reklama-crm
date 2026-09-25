"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { clients, contacts, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { form, run } from "@/lib/action";
import { audit, logActivity } from "@/lib/audit";
import { STAGES, stageInfo } from "@/lib/constants";
import { istDateTime, toPaise } from "@/lib/format";
import { can } from "@/lib/permissions";
import { GSTIN_RE, stateCodeFromGstin, stateName } from "@/lib/pricing";
import { UserError } from "@/lib/services/common";
import { duplicateIndex } from "@/lib/services/clients";
import { mapHeader, readSheet } from "@/lib/sheets";

type Stage = (typeof STAGES)[number]["key"];
type ActType = "call" | "whatsapp" | "email" | "meeting" | "note";

function clientFields(fd: FormData) {
  const gstin = form.str(fd, "gstin")?.toUpperCase() ?? null;
  if (gstin && !GSTIN_RE.test(gstin)) throw new UserError("That GSTIN doesn't look right — it should be 15 characters like 29ABCDE1234F1Z5.");
  const stateCode = form.str(fd, "stateCode") ?? stateCodeFromGstin(gstin);
  return {
    name: form.req(fd, "name", "Company name"),
    type: (form.str(fd, "type") as "advertiser" | "agency" | "government") ?? "advertiser",
    industry: form.str(fd, "industry"),
    website: form.str(fd, "website"),
    phone: form.str(fd, "phone"),
    email: form.str(fd, "email"),
    address: form.str(fd, "address"),
    city: form.str(fd, "city"),
    stateCode,
    state: stateName(stateCode),
    gstin,
    pan: form.str(fd, "pan")?.toUpperCase() ?? null,
    source: form.str(fd, "source"),
    requirement: form.str(fd, "requirement"),
    preferredLocations: form.str(fd, "preferredLocations"),
    budget: form.money(fd, "budget"),
    timing: form.str(fd, "timing"),
    agencyCommission: form.num(fd, "agencyCommission") ?? 0,
    creditDays: form.int(fd, "creditDays"),
    notes: form.str(fd, "notes"),
  };
}

export async function createClientAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    if (!can(user, "sales") && !can(user, "admin")) throw new UserError("Only the sales team can add leads.");
    const db = await getDb();
    const data = clientFields(fd);
    const contactName = form.str(fd, "contactName");

    if (!form.bool(fd, "force")) {
      const dups = (await duplicateIndex(db))({ name: data.name, phone: data.phone, email: data.email, gstin: data.gstin });
      if (dups.length)
        throw new UserError(
          `This looks like an existing record: ${dups.map((d) => `${d.name} (${d.why})`).join(", ")}. Open it instead, or tick "Create anyway".`,
        );
    }

    const ownerRaw = form.str(fd, "ownerId");
    const ownerId = ownerRaw === "none" ? null : ownerRaw ? Number(ownerRaw) : user.id;
    const [c] = await db
      .insert(clients)
      .values({ ...data, ownerId, stage: "new" })
      .returning();
    if (contactName) {
      await db.insert(contacts).values({
        clientId: c!.id,
        name: contactName,
        designation: form.str(fd, "designation"),
        phone: data.phone,
        email: data.email,
        isPrimary: true,
      });
    }
    await logActivity(db, { clientId: c!.id, userId: user.id, type: "system", notes: `Lead added${data.source ? ` (source: ${data.source})` : ""}` });
    await audit(db, user.id, "create", "client", c!.id, `Added lead ${c!.name}`);
    revalidatePath("/", "layout");
    return { ok: true, message: "Lead added", redirectTo: `/clients/${c!.id}` };
  });
}

export async function updateClientAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const id = form.id(fd);
    const data = clientFields(fd);
    await db.update(clients).set({ ...data, updatedAt: new Date() }).where(eq(clients.id, id));
    await audit(db, user.id, "update", "client", id, `Edited details of ${data.name}`);
    revalidatePath(`/clients/${id}`);
    return { ok: true, message: "Details saved" };
  });
}

export async function setStageAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const id = form.id(fd);
    const stage = form.req(fd, "stage", "Stage") as Stage;
    if (!STAGES.some((s) => s.key === stage)) throw new UserError("Unknown stage");
    const lostReason = stage === "lost" ? form.req(fd, "lostReason", "Reason for losing") : null;
    const [c] = await db.select().from(clients).where(eq(clients.id, id));
    if (!c) throw new UserError("Client not found");
    if (c.stage === stage) return { ok: true };
    await db.update(clients).set({ stage, lostReason, updatedAt: new Date() }).where(eq(clients.id, id));
    await logActivity(db, {
      clientId: id,
      userId: user.id,
      type: "system",
      notes: `Stage changed: ${stageInfo(c.stage).label} → ${stageInfo(stage).label}${lostReason ? ` (${lostReason})` : ""}`,
    });
    await audit(db, user.id, "stage", "client", id, `${c.name}: ${c.stage} → ${stage}`);
    revalidatePath("/", "layout");
    return { ok: true, message: `Moved to ${stageInfo(stage).label}` };
  });
}

export async function assignOwnerAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    if (!can(user, "assign")) throw new UserError("Only managers can reassign leads.");
    const db = await getDb();
    const id = form.id(fd);
    const ownerRaw = form.str(fd, "ownerId");
    const ownerId = ownerRaw && ownerRaw !== "none" ? Number(ownerRaw) : null;
    const [c] = await db.select().from(clients).where(eq(clients.id, id));
    if (!c) throw new UserError("Client not found");
    await db.update(clients).set({ ownerId, updatedAt: new Date() }).where(eq(clients.id, id));
    if (ownerId && ownerId !== user.id) {
      await db.insert(tasks).values({
        clientId: id,
        assignedTo: ownerId,
        createdBy: user.id,
        title: `New lead assigned to you: ${c.name} — make first contact`,
        dueAt: new Date(Date.now() + 4 * 3600_000),
        priority: "high",
      });
    }
    await logActivity(db, { clientId: id, userId: user.id, type: "system", notes: ownerId ? "Lead reassigned" : "Lead unassigned" });
    await audit(db, user.id, "assign", "client", id, `Assigned ${c.name} to user ${ownerId ?? "nobody"}`);
    revalidatePath("/", "layout");
    return { ok: true, message: "Owner updated" };
  });
}

export async function addContactAction(fd: FormData) {
  return run(async () => {
    await requireUser();
    const db = await getDb();
    const clientId = form.id(fd, "clientId");
    const isPrimary = form.bool(fd, "isPrimary");
    if (isPrimary) await db.update(contacts).set({ isPrimary: false }).where(eq(contacts.clientId, clientId));
    await db.insert(contacts).values({
      clientId,
      name: form.req(fd, "name", "Name"),
      designation: form.str(fd, "designation"),
      phone: form.str(fd, "phone"),
      email: form.str(fd, "email"),
      isPrimary,
    });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, message: "Contact added" };
  });
}

export async function logActivityAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const clientId = form.id(fd, "clientId");
    const type = form.req(fd, "type", "Type") as ActType;
    const outcome = form.str(fd, "outcome");
    const notes = form.str(fd, "notes");
    if (!outcome && !notes) throw new UserError("Add what happened — pick an outcome or write a note.");
    const when = form.str(fd, "date");
    await logActivity(db, {
      clientId,
      userId: user.id,
      type,
      direction: form.str(fd, "direction") ?? (type === "note" ? null : "out"),
      outcome,
      notes,
      durationMin: form.int(fd, "duration"),
      occurredAt: when ? istDateTime(when, form.str(fd, "time") ?? "10:00") : new Date(),
    });

    const [c] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (c?.stage === "new" && type !== "note") {
      await db.update(clients).set({ stage: "contacted" }).where(eq(clients.id, clientId));
    }

    const nextDate = form.str(fd, "nextDate");
    if (nextDate) {
      await db.insert(tasks).values({
        clientId,
        assignedTo: user.id,
        createdBy: user.id,
        title: form.str(fd, "nextTitle") ?? `Follow up with ${c?.name ?? "client"}`,
        dueAt: istDateTime(nextDate, form.str(fd, "nextTime") ?? "11:00"),
      });
    }
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/", "layout");
    return { ok: true, message: nextDate ? "Logged — follow-up reminder set" : "Logged to timeline" };
  });
}

// ---------- import ----------

const HEADER_MAP: Record<string, string> = {
  company: "name",
  companyname: "name",
  name: "name",
  client: "name",
  clientname: "name",
  brand: "name",
  contact: "contactName",
  contactname: "contactName",
  contactperson: "contactName",
  person: "contactName",
  designation: "designation",
  title: "designation",
  phone: "phone",
  mobile: "phone",
  phonenumber: "phone",
  contactnumber: "phone",
  mobilenumber: "phone",
  email: "email",
  emailid: "email",
  mail: "email",
  industry: "industry",
  category: "industry",
  sector: "industry",
  city: "city",
  location: "city",
  address: "address",
  website: "website",
  source: "source",
  leadsource: "source",
  requirement: "requirement",
  remarks: "requirement",
  notes: "requirement",
  budget: "budget",
  gstin: "gstin",
  gst: "gstin",
  gstnumber: "gstin",
};

export async function importClientsAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    if (!can(user, "sales")) throw new UserError("Only the sales team can import leads.");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a CSV or Excel file.");
    const rows = await readSheet(file);
    if (rows.length < 2) throw new UserError("The file has no data rows.");
    const header = mapHeader(rows[0]!, HEADER_MAP);
    if (!header.includes("name")) throw new UserError('Couldn\'t find a "Company" column. Download the template to see the expected columns.');

    const db = await getDb();
    const find = await duplicateIndex(db);
    const ownerRaw = form.str(fd, "ownerId");
    const ownerId = ownerRaw === "none" ? null : ownerRaw ? Number(ownerRaw) : user.id;
    const skipDups = form.bool(fd, "skipDuplicates");
    const seenInFile = new Set<string>();
    let imported = 0;
    const skipped: string[] = [];

    for (const r of rows.slice(1)) {
      const rec: Record<string, string> = {};
      header.forEach((k, i) => {
        if (k && r[i]?.trim()) rec[k] = r[i]!.trim();
      });
      if (!rec.name) continue;
      const key = rec.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const dups = find({ name: rec.name, phone: rec.phone, email: rec.email, gstin: rec.gstin });
      if (seenInFile.has(key) || (skipDups && dups.length)) {
        skipped.push(rec.name);
        continue;
      }
      seenInFile.add(key);
      const gstin = rec.gstin?.toUpperCase() ?? null;
      const stateCode = stateCodeFromGstin(gstin);
      const [c] = await db
        .insert(clients)
        .values({
          name: rec.name,
          industry: rec.industry ?? null,
          city: rec.city ?? null,
          address: rec.address ?? null,
          website: rec.website ?? null,
          phone: rec.phone ?? null,
          email: rec.email ?? null,
          source: rec.source ?? "Imported list",
          requirement: rec.requirement ?? null,
          budget: rec.budget ? toPaise(rec.budget) : null,
          gstin: gstin && GSTIN_RE.test(gstin) ? gstin : null,
          stateCode,
          state: stateName(stateCode),
          ownerId,
          stage: "new",
        })
        .returning();
      if (rec.contactName) {
        await db.insert(contacts).values({
          clientId: c!.id,
          name: rec.contactName,
          designation: rec.designation ?? null,
          phone: rec.phone ?? null,
          email: rec.email ?? null,
          isPrimary: true,
        });
      }
      imported++;
    }
    await audit(db, user.id, "import", "client", null, `Imported ${imported} leads from ${file.name}`);
    revalidatePath("/", "layout");
    const skippedText = skipped.length
      ? ` Skipped ${skipped.length} duplicate${skipped.length > 1 ? "s" : ""}: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}.`
      : "";
    return { ok: true, message: `Imported ${imported} lead${imported === 1 ? "" : "s"}.${skippedText}`, redirectTo: "/leads" };
  });
}
