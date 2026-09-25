import { eq } from "drizzle-orm";
import type { Executor } from "@/db";
import { companySettings, users, type Settings } from "@/db/schema";

export class UserError extends Error {}

export async function getSettings(db: Executor): Promise<Settings> {
  const [s] = await db.select().from(companySettings).where(eq(companySettings.id, 1));
  if (!s) throw new Error("Company settings missing");
  return s;
}

export async function getUser(db: Executor, id: number) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) throw new UserError("User not found");
  return u;
}

export async function firstUserWithRole(db: Executor, role: "owner" | "sales_manager" | "operations" | "accounts") {
  const [u] = await db.select().from(users).where(eq(users.role, role)).limit(1);
  return u ?? null;
}
