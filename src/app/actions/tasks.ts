"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { form, run } from "@/lib/action";
import { logActivity } from "@/lib/audit";
import { istDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { UserError } from "@/lib/services/common";

export async function createTaskAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const title = form.req(fd, "title", "What needs to be done");
    const day = form.req(fd, "dueDate", "Due date");
    const assignedTo = form.int(fd, "assignedTo") ?? user.id;
    if (assignedTo !== user.id && !can(user, "assign") && !can(user, "admin"))
      throw new UserError("Only managers can assign tasks to others.");
    await db.insert(tasks).values({
      title,
      notes: form.str(fd, "notes"),
      dueAt: istDateTime(day, form.str(fd, "dueTime") ?? "10:00"),
      priority: (form.str(fd, "priority") as "low" | "normal" | "high") ?? "normal",
      assignedTo,
      createdBy: user.id,
      clientId: form.int(fd, "clientId"),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Reminder set" };
  });
}

export async function completeTaskAction(fd: FormData) {
  return run(async () => {
    const user = await requireUser();
    const db = await getDb();
    const id = form.id(fd);
    const outcome = form.req(fd, "outcome", "Outcome");
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) throw new UserError("Task not found");
    if (task.assignedTo !== user.id && !can(user, "team")) throw new UserError("This task belongs to someone else.");

    await db
      .update(tasks)
      .set({ status: "done", outcome, completedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.status, "open")));

    if (task.clientId) {
      await logActivity(db, {
        clientId: task.clientId,
        userId: user.id,
        type: "note",
        outcome: "Task done",
        notes: `${task.title} — ${outcome}`,
      });
    }

    const nextDate = form.str(fd, "nextDate");
    if (nextDate) {
      await db.insert(tasks).values({
        title: form.str(fd, "nextTitle") ?? `Follow up: ${task.title}`,
        dueAt: istDateTime(nextDate, form.str(fd, "nextTime") ?? "10:00"),
        assignedTo: task.assignedTo,
        createdBy: user.id,
        clientId: task.clientId,
        refType: task.refType,
        refId: task.refId,
      });
    }
    revalidatePath("/", "layout");
    return { ok: true, message: nextDate ? "Done — next follow-up scheduled" : "Task completed" };
  });
}
