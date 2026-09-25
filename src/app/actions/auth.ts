"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { endSession, startSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import type { ActionResult } from "@/components/forms";

export async function loginAction(fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return { ok: false, error: "That email and password don't match." };
  }
  await startSession(user.id);
  redirect("/");
}

export async function demoLoginAction(fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") ?? "");
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !user.active) return { ok: false, error: "Demo user not found." };
  await startSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
