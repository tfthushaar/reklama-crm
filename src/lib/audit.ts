import { eq } from "drizzle-orm";
import type { Executor } from "@/db";
import { activities, auditLog, clients } from "@/db/schema";

export async function audit(
  db: Executor,
  userId: number | null,
  action: string,
  entity: string,
  entityId: number | null,
  summary: string,
) {
  await db.insert(auditLog).values({ userId, action, entity, entityId, summary });
}

type ActivityInput = {
  clientId: number;
  userId: number | null;
  type: "call" | "whatsapp" | "email" | "meeting" | "note" | "system";
  outcome?: string | null;
  notes?: string | null;
  direction?: string | null;
  durationMin?: number | null;
  refType?: string | null;
  refId?: number | null;
  occurredAt?: Date;
};

const CONTACT_TYPES = ["call", "whatsapp", "email", "meeting"];

export async function logActivity(db: Executor, a: ActivityInput) {
  const occurredAt = a.occurredAt ?? new Date();
  await db.insert(activities).values({ ...a, occurredAt });
  if (CONTACT_TYPES.includes(a.type)) {
    await db.update(clients).set({ lastActivityAt: occurredAt, updatedAt: new Date() }).where(eq(clients.id, a.clientId));
  }
}
