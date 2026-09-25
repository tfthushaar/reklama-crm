import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ActionForm } from "@/components/forms";
import { ClientFields } from "@/components/client-form";
import { Card, Field, PageHeader, Select } from "@/components/ui";
import { createClientAction } from "@/app/actions/clients";

export const metadata = { title: "Add lead" };

export default async function NewClientPage() {
  const user = await requireUser();
  const db = await getDb();
  const team = can(user, "assign")
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.role, ["sales_exec", "sales_manager", "owner"]))
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a lead" subtitle="Only the company name is required — you can fill the rest later." back={{ href: "/leads", label: "Leads" }} />
      <Card className="p-5 sm:p-6">
        <ActionForm action={createClientAction} submitLabel="Add lead" resetOnSuccess={false}>
          <ClientFields />
          {team.length > 0 && (
            <Field label="Assign to">
              <Select name="ownerId" defaultValue={String(user.id)}>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.id === user.id ? " (me)" : ""}
                  </option>
                ))}
                <option value="none">Leave unassigned</option>
              </Select>
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" name="force" className="size-4 rounded border-neutral-300" />
            Create anyway, even if it looks like a duplicate
          </label>
        </ActionForm>
      </Card>
    </div>
  );
}
