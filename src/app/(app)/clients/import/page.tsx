import { inArray } from "drizzle-orm";
import { Download, FileSpreadsheet } from "lucide-react";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ActionForm } from "@/components/forms";
import { Card, Field, Input, Notice, PageHeader, Select, buttonClass } from "@/components/ui";
import { importClientsAction } from "@/app/actions/clients";

export const metadata = { title: "Import leads" };

export default async function ImportClientsPage() {
  const user = await requireUser();
  const db = await getDb();
  const team = can(user, "assign")
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.role, ["sales_exec", "sales_manager", "owner"]))
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Import leads" subtitle="Upload an Excel or CSV list. Duplicates are detected automatically." back={{ href: "/leads", label: "Leads" }} />
      <Card className="p-5 sm:p-6">
        <Notice icon={<FileSpreadsheet />} className="mb-5">
          Columns we understand: <b>Company</b> (required), Contact, Designation, Phone, Email, Industry, City, Address, Website, Source,
          Requirement, Budget, GSTIN. Column names don&apos;t need to match exactly.
          <div className="mt-2">
            <a href="/api/templates/leads" className={buttonClass("secondary", "sm")}>
              <Download /> Download template
            </a>
          </div>
        </Notice>
        <ActionForm action={importClientsAction} submitLabel="Import leads">
          <Field label="File" required>
            <Input type="file" name="file" accept=".csv,.xlsx" required className="h-auto py-2" />
          </Field>
          <Field label="Assign imported leads to">
            <Select name="ownerId" defaultValue={String(user.id)}>
              <option value={user.id}>Me</option>
              {team
                .filter((u) => u.id !== user.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              <option value="none">Nobody yet (manager assigns later)</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="skipDuplicates" defaultChecked className="size-4 rounded border-neutral-300" />
            Skip companies that already exist (matched by name, phone, email or GSTIN)
          </label>
        </ActionForm>
      </Card>
    </div>
  );
}
