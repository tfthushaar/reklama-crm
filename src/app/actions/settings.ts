"use server";

import { eq, ne, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, resetDemoData } from "@/db";
import { companySettings, users } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { form, run } from "@/lib/action";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { GSTIN_RE, stateCodeFromGstin, stateName } from "@/lib/pricing";
import { UserError } from "@/lib/services/common";
import { runHousekeeping } from "@/lib/services/housekeeping";

const ROLES = ["owner", "sales_manager", "sales_exec", "operations", "accounts"] as const;

export async function updateCompanyAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("admin");
    const db = await getDb();
    const gstin = form.str(fd, "gstin")?.toUpperCase() ?? null;
    if (gstin && !GSTIN_RE.test(gstin)) throw new UserError("That GSTIN doesn't look right.");
    const stateCode = stateCodeFromGstin(gstin) ?? form.str(fd, "stateCode");
    await db
      .update(companySettings)
      .set({
        companyName: form.req(fd, "companyName", "Company name"),
        legalName: form.str(fd, "legalName"),
        address: form.str(fd, "address"),
        city: form.str(fd, "city"),
        stateCode,
        state: stateName(stateCode),
        gstin,
        pan: form.str(fd, "pan")?.toUpperCase() ?? null,
        phone: form.str(fd, "phone"),
        email: form.str(fd, "email"),
        website: form.str(fd, "website"),
        bankName: form.str(fd, "bankName"),
        bankAccount: form.str(fd, "bankAccount"),
        bankIfsc: form.str(fd, "bankIfsc")?.toUpperCase() ?? null,
        upiId: form.str(fd, "upiId"),
      })
      .where(eq(companySettings.id, 1));
    await audit(db, user.id, "update", "settings", 1, "Updated company details");
    revalidatePath("/settings");
    return { ok: true, message: "Company details saved" };
  });
}

export async function updateRulesAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("admin");
    const db = await getDb();
    const num = (k: string, label: string, min: number, max: number) => {
      const v = form.num(fd, k);
      if (v === null || v < min || v > max) throw new UserError(`${label} must be between ${min} and ${max}.`);
      return v;
    };
    await db
      .update(companySettings)
      .set({
        gstRate: num("gstRate", "GST rate", 0, 28),
        sacCode: form.req(fd, "sacCode", "SAC code"),
        holdHours: Math.round(num("holdHours", "Hold time", 1, 720)),
        quoteValidityDays: Math.round(num("quoteValidityDays", "Quote validity", 1, 180)),
        execDiscountLimit: num("execDiscountLimit", "Executive discount limit", 0, 100),
        managerDiscountLimit: num("managerDiscountLimit", "Manager discount limit", 0, 100),
        paymentTermsDays: Math.round(num("paymentTermsDays", "Payment terms", 0, 180)),
        quoteTerms: form.str(fd, "quoteTerms"),
        invoiceTerms: form.str(fd, "invoiceTerms"),
      })
      .where(eq(companySettings.id, 1));
    await audit(db, user.id, "update", "settings", 1, "Updated business rules");
    revalidatePath("/settings");
    return { ok: true, message: "Rules saved" };
  });
}

export async function createUserAction(fd: FormData) {
  return run(async () => {
    const user = await requirePerm("admin");
    const db = await getDb();
    const email = form.req(fd, "email", "Email").toLowerCase();
    const role = form.req(fd, "role", "Role") as (typeof ROLES)[number];
    if (!ROLES.includes(role)) throw new UserError("Pick a role.");
    const password = form.req(fd, "password", "Password");
    if (password.length < 6) throw new UserError("Use a password of at least 6 characters.");
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists) throw new UserError("Someone already uses that email.");
    const [u] = await db
      .insert(users)
      .values({ name: form.req(fd, "name", "Name"), email, phone: form.str(fd, "phone"), role, passwordHash: hashPassword(password) })
      .returning();
    await audit(db, user.id, "create", "user", u!.id, `Added user ${u!.name} (${role})`);
    revalidatePath("/settings");
    return { ok: true, message: `${u!.name} can now sign in` };
  });
}

export async function updateUserAction(fd: FormData) {
  return run(async () => {
    const admin = await requirePerm("admin");
    const db = await getDb();
    const id = form.id(fd);
    const role = form.req(fd, "role", "Role") as (typeof ROLES)[number];
    const active = form.bool(fd, "active");
    if (id === admin.id && (!active || role !== "owner")) throw new UserError("You can't remove your own owner access.");
    if (role !== "owner" || !active) {
      const others = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "owner"), eq(users.active, true), ne(users.id, id)));
      if (others.length === 0) throw new UserError("There must be at least one active owner.");
    }
    const password = form.str(fd, "password");
    await db
      .update(users)
      .set({ role, active, phone: form.str(fd, "phone"), ...(password ? { passwordHash: hashPassword(password) } : {}) })
      .where(eq(users.id, id));
    await audit(db, admin.id, "update", "user", id, `Updated user ${id}: role ${role}, ${active ? "active" : "deactivated"}${password ? ", password reset" : ""}`);
    revalidatePath("/settings");
    return { ok: true, message: "User updated" };
  });
}

export async function resetDemoAction() {
  return run(async () => {
    await requirePerm("admin");
    const db = await getDb();
    await resetDemoData(db);
    await runHousekeeping(db, true);
    revalidatePath("/", "layout");
    return { ok: true, message: "Demo data has been reset", redirectTo: "/" };
  });
}
