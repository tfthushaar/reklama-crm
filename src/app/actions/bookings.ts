"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { bookingFiles, bookings } from "@/db/schema";
import { requirePerm, requireUser } from "@/lib/auth";
import { form, run } from "@/lib/action";
import { audit, logActivity } from "@/lib/audit";
import { advanceBooking, cancelBooking, extendBooking } from "@/lib/services/bookings";
import { UserError } from "@/lib/services/common";
import { saveUpload } from "@/lib/uploads";

export async function advanceBookingAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("operations");
    const db = await getDb();
    const id = form.id(fd);
    await db.transaction((tx) => advanceBooking(tx, user.id, id));
    revalidatePath("/", "layout");
    return { ok: true, message: "Campaign updated" };
  });
}

export async function extendBookingAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const id = form.id(fd);
    await db.transaction((tx) => extendBooking(tx, user.id, id, form.req(fd, "endDate", "New end date")));
    revalidatePath("/", "layout");
    return { ok: true, message: "Booking extended" };
  });
}

export async function cancelBookingAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("approve");
    const db = await getDb();
    const id = form.id(fd);
    await db.transaction((tx) => cancelBooking(tx, user.id, id, form.req(fd, "reason", "Reason")));
    revalidatePath("/", "layout");
    return { ok: true, message: "Booking cancelled — screens released" };
  });
}

const KIND_LABEL = { ro: "Release order", creative: "Creative", pop: "Proof of display", other: "Document" } as const;

export async function uploadBookingFileAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const bookingId = form.id(fd, "bookingId");
    const kind = form.req(fd, "kind", "Type") as keyof typeof KIND_LABEL;
    if (!(kind in KIND_LABEL)) throw new UserError("Unknown file type");
    const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    if (!b) throw new UserError("Booking not found");
    const file = fd.get("file") as File;
    const saved = await saveUpload(file, { imagesOnly: kind === "pop" });
    const label = form.str(fd, "label");
    await db.insert(bookingFiles).values({
      bookingId,
      assetId: form.int(fd, "assetId"),
      kind,
      url: saved.url,
      name: label ? `${label} — ${saved.name}` : saved.name,
      uploadedBy: user.id,
    });
    await logActivity(db, {
      clientId: b.clientId,
      userId: user.id,
      type: "system",
      notes: `${KIND_LABEL[kind]} uploaded for ${b.number}: ${saved.name}`,
      refType: "booking",
      refId: bookingId,
    });
    revalidatePath(`/bookings/${bookingId}`);
    return { ok: true, message: `${KIND_LABEL[kind]} uploaded` };
  });
}

export async function updateBookingInfoAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const id = form.id(fd);
    await db
      .update(bookings)
      .set({
        roNumber: form.str(fd, "roNumber"),
        roDate: form.str(fd, "roDate"),
        advanceAmount: form.money(fd, "advance"),
        paymentTerms: form.str(fd, "paymentTerms"),
        ownerId: form.int(fd, "ownerId"),
        notes: form.str(fd, "notes"),
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, id));
    await audit(db, user.id, "update", "booking", id, "Edited booking details");
    revalidatePath(`/bookings/${id}`);
    return { ok: true, message: "Details saved" };
  });
}
