"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { assetPhotos, assets, maintenanceTickets, siteOwners, tasks } from "@/db/schema";
import { requirePerm, requireUser } from "@/lib/auth";
import { form, run } from "@/lib/action";
import { audit } from "@/lib/audit";
import { toPaise } from "@/lib/format";
import { firstUserWithRole, UserError } from "@/lib/services/common";
import { mapHeader, readSheet } from "@/lib/sheets";
import { saveUpload } from "@/lib/uploads";

function assetFields(fd: FormData) {
  const type = form.req(fd, "type", "Type") as "led" | "hoarding";
  const led = type === "led";
  const totalSlots = led ? Math.max(1, form.int(fd, "totalSlots") ?? 1) : 1;
  const saleMode = led ? ((form.str(fd, "saleMode") as "both" | "slots" | "exclusive") ?? "both") : "exclusive";
  const slotSeconds = led ? form.int(fd, "slotSeconds") : null;
  const monthlyRate = form.money(fd, "monthlyRate") ?? 0;
  const slotRate = led ? form.money(fd, "slotRate") : null;
  if (saleMode !== "slots" && monthlyRate <= 0) throw new UserError("Enter the monthly rate for booking the whole screen.");
  if (saleMode !== "exclusive" && !slotRate) throw new UserError("Enter the monthly rate for one slot.");
  const ownership = (form.str(fd, "ownership") as "owned" | "leased" | "third_party") ?? "owned";
  return {
    code: form.req(fd, "code", "Screen code").toUpperCase(),
    name: form.req(fd, "name", "Name"),
    type,
    city: form.req(fd, "city", "City"),
    area: form.str(fd, "area"),
    address: form.str(fd, "address"),
    landmark: form.str(fd, "landmark"),
    mapLink: form.str(fd, "mapLink"),
    widthFt: form.num(fd, "widthFt"),
    heightFt: form.num(fd, "heightFt"),
    resolution: led ? form.str(fd, "resolution") : null,
    illumination: led ? "digital" : form.str(fd, "illumination"),
    totalSlots,
    slotSeconds,
    loopSeconds: led ? (form.int(fd, "loopSeconds") ?? (slotSeconds ? slotSeconds * totalSlots : null)) : null,
    saleMode,
    monthlyRate,
    slotRate,
    minDays: form.int(fd, "minDays") ?? 7,
    dailyTraffic: form.int(fd, "dailyTraffic"),
    operatingHours: form.str(fd, "operatingHours"),
    status: (form.str(fd, "status") as "active" | "maintenance" | "inactive") ?? "active",
    ownership,
    siteOwnerId: ownership === "owned" ? null : form.int(fd, "siteOwnerId"),
    rentMonthly: ownership === "owned" ? null : form.money(fd, "rentMonthly"),
    leaseEnd: ownership === "owned" ? null : form.str(fd, "leaseEnd"),
    permitNumber: form.str(fd, "permitNumber"),
    permitExpiry: form.str(fd, "permitExpiry"),
    notes: form.str(fd, "notes"),
  };
}

export async function createAssetAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("inventory");
    const db = await getDb();
    const data = assetFields(fd);
    const [dup] = await db.select({ id: assets.id }).from(assets).where(eq(assets.code, data.code));
    if (dup) throw new UserError(`Code ${data.code} is already used by another screen.`);
    const [a] = await db.insert(assets).values(data).returning();
    await audit(db, user.id, "create", "asset", a!.id, `Added screen ${a!.code} ${a!.name}`);
    revalidatePath("/screens");
    return { ok: true, message: "Screen added", redirectTo: `/screens/${a!.id}` };
  });
}

export async function updateAssetAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("inventory");
    const db = await getDb();
    const id = form.id(fd);
    const data = assetFields(fd);
    const [dup] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.code, data.code), ne(assets.id, id)));
    if (dup) throw new UserError(`Code ${data.code} is already used by another screen.`);
    await db.update(assets).set(data).where(eq(assets.id, id));
    await audit(db, user.id, "update", "asset", id, `Edited screen ${data.code}`);
    revalidatePath(`/screens/${id}`);
    revalidatePath("/screens");
    return { ok: true, message: "Screen updated" };
  });
}

export async function uploadAssetPhotoAction(fd: FormData) {
  return run(async () => {
    await requireUser();
    const db = await getDb();
    const assetId = form.id(fd, "assetId");
    const file = fd.get("file") as File;
    const saved = await saveUpload(file, { imagesOnly: true });
    await db.insert(assetPhotos).values({ assetId, url: saved.url, kind: form.str(fd, "kind") ?? "day" });
    revalidatePath(`/screens/${assetId}`);
    return { ok: true, message: "Photo uploaded" };
  });
}

export async function deleteAssetPhotoAction(fd: FormData) {
  return run(async () => {
    await requirePerm("inventory");
    const db = await getDb();
    const id = form.id(fd);
    const [p] = await db.delete(assetPhotos).where(eq(assetPhotos.id, id)).returning();
    if (p) revalidatePath(`/screens/${p.assetId}`);
    return { ok: true, message: "Photo removed" };
  });
}

export async function createSiteOwnerAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("inventory");
    const db = await getDb();
    const [o] = await db
      .insert(siteOwners)
      .values({
        name: form.req(fd, "name", "Name"),
        phone: form.str(fd, "phone"),
        email: form.str(fd, "email"),
        address: form.str(fd, "address"),
        notes: form.str(fd, "notes"),
      })
      .returning();
    await audit(db, user.id, "create", "site_owner", o!.id, `Added site owner ${o!.name}`);
    revalidatePath("/screens/owners");
    return { ok: true, message: "Site owner added" };
  });
}

export async function createTicketAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const assetId = form.id(fd, "assetId");
    const ops = await firstUserWithRole(db, "operations");
    const priority = (form.str(fd, "priority") as "low" | "normal" | "high") ?? "normal";
    const [t] = await db
      .insert(maintenanceTickets)
      .values({
        assetId,
        title: form.req(fd, "title", "What's wrong"),
        notes: form.str(fd, "notes"),
        priority,
        assignedTo: form.int(fd, "assignedTo") ?? ops?.id ?? null,
        createdBy: user.id,
      })
      .returning();
    if (form.bool(fd, "takeOffline")) await db.update(assets).set({ status: "maintenance" }).where(eq(assets.id, assetId));
    if (t!.assignedTo) {
      const [a] = await db.select({ name: assets.name }).from(assets).where(eq(assets.id, assetId));
      await db.insert(tasks).values({
        assignedTo: t!.assignedTo,
        createdBy: user.id,
        title: `Fix: ${t!.title} (${a?.name})`,
        dueAt: new Date(Date.now() + (priority === "high" ? 4 : 24) * 3600_000),
        priority,
        refType: "asset",
        refId: assetId,
      });
    }
    await audit(db, user.id, "create", "ticket", t!.id, `Reported issue on screen ${assetId}: ${t!.title}`);
    revalidatePath("/screens", "layout");
    return { ok: true, message: "Issue reported" };
  });
}

export async function updateTicketAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const id = form.id(fd);
    const status = form.req(fd, "status", "Status") as "open" | "in_progress" | "resolved";
    const cost = form.money(fd, "cost");
    const [t] = await db
      .update(maintenanceTickets)
      .set({ status, resolvedAt: status === "resolved" ? new Date() : null, ...(cost !== null ? { cost } : {}) })
      .where(eq(maintenanceTickets.id, id))
      .returning();
    if (t && status === "resolved") {
      const [{ open }] = await db
        .select({ open: sql<number>`count(*)` })
        .from(maintenanceTickets)
        .where(and(eq(maintenanceTickets.assetId, t.assetId), ne(maintenanceTickets.status, "resolved")));
      if (open === 0) await db.update(assets).set({ status: "active" }).where(and(eq(assets.id, t.assetId), eq(assets.status, "maintenance")));
    }
    await audit(db, user.id, "update", "ticket", id, `Ticket → ${status}`);
    revalidatePath("/screens", "layout");
    return { ok: true, message: status === "resolved" ? "Marked fixed — screen is back in service" : "Updated" };
  });
}

const ASSET_HEADERS: Record<string, string> = {
  code: "code",
  assetid: "code",
  id: "code",
  name: "name",
  screen: "name",
  sitename: "name",
  type: "type",
  format: "type",
  city: "city",
  area: "area",
  locality: "area",
  location: "area",
  address: "address",
  widthft: "widthFt",
  width: "widthFt",
  heightft: "heightFt",
  height: "heightFt",
  resolution: "resolution",
  illumination: "illumination",
  lighting: "illumination",
  salemode: "saleMode",
  totalslots: "totalSlots",
  slots: "totalSlots",
  slotseconds: "slotSeconds",
  slotduration: "slotSeconds",
  loopseconds: "loopSeconds",
  looplength: "loopSeconds",
  monthlyrate: "monthlyRate",
  rate: "monthlyRate",
  ratepermonth: "monthlyRate",
  slotrate: "slotRate",
  dailytraffic: "dailyTraffic",
  traffic: "dailyTraffic",
};

export async function importAssetsAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("inventory");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a CSV or Excel file.");
    const rows = await readSheet(file);
    if (rows.length < 2) throw new UserError("The file has no data rows.");
    const header = mapHeader(rows[0]!, ASSET_HEADERS);
    if (!header.includes("name")) throw new UserError('Couldn\'t find a "Name" column. Download the template to see the expected columns.');
    const db = await getDb();
    const existing = new Set((await db.select({ code: assets.code }).from(assets)).map((a) => a.code));
    let n = 0;
    let seq = existing.size + 1;
    const skipped: string[] = [];
    for (const r of rows.slice(1)) {
      const rec: Record<string, string> = {};
      header.forEach((k, i) => {
        if (k && r[i]?.trim()) rec[k] = r[i]!.trim();
      });
      if (!rec.name) continue;
      let code = rec.code?.toUpperCase();
      if (!code) {
        while (existing.has(`RG-${String(seq).padStart(3, "0")}`)) seq++;
        code = `RG-${String(seq).padStart(3, "0")}`;
      }
      if (existing.has(code)) {
        skipped.push(code);
        continue;
      }
      existing.add(code);
      const led = /led|digital|dooh|screen/i.test(rec.type ?? "");
      const totalSlots = led ? Math.max(1, Number(rec.totalSlots) || 12) : 1;
      const slotSeconds = led ? Number(rec.slotSeconds) || 10 : null;
      await db.insert(assets).values({
        code,
        name: rec.name,
        type: led ? "led" : "hoarding",
        city: rec.city ?? "Bengaluru",
        area: rec.area ?? null,
        address: rec.address ?? null,
        widthFt: Number(rec.widthFt) || null,
        heightFt: Number(rec.heightFt) || null,
        resolution: led ? rec.resolution ?? null : null,
        illumination: led ? "digital" : (rec.illumination?.toLowerCase() ?? "frontlit"),
        totalSlots,
        slotSeconds,
        loopSeconds: led ? Number(rec.loopSeconds) || (slotSeconds ?? 10) * totalSlots : null,
        saleMode: led ? ((["both", "slots", "exclusive"].includes(rec.saleMode ?? "") ? rec.saleMode : "both") as "both") : "exclusive",
        monthlyRate: toPaise(rec.monthlyRate ?? 0),
        slotRate: led && rec.slotRate ? toPaise(rec.slotRate) : null,
        dailyTraffic: Number(rec.dailyTraffic) || null,
      });
      n++;
    }
    await audit(db, user.id, "import", "asset", null, `Imported ${n} screens from ${file.name}`);
    revalidatePath("/screens");
    return {
      ok: true,
      message: `Imported ${n} screen${n === 1 ? "" : "s"}.${skipped.length ? ` Skipped ${skipped.length} with codes that already exist.` : ""}`,
      redirectTo: "/screens",
    };
  });
}
