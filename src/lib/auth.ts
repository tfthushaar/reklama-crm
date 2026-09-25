import "server-only";
import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";
import { can, type Perm } from "./permissions";

const COOKIE = "rk_session";
const SECRET = process.env.SESSION_SECRET || "reklama-local-dev-secret";

function sign(value: string) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
}

export async function startSession(userId: number) {
  const value = `${userId}.${sign(String(userId))}`;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, sig] = raw.split(".");
  if (!id || !sig) return null;
  const expected = sign(id);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, Number(id)));
  return user && user.active ? user : null;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePerm(perm: Perm): Promise<User> {
  const user = await requireUser();
  if (!can(user, perm)) throw new Error("You don't have permission to do this.");
  return user;
}
