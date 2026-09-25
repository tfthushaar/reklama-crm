import Link from "next/link";
import { asc, desc, eq, ne } from "drizzle-orm";
import { Plus, Wrench } from "lucide-react";
import { getDb } from "@/db";
import { assets, maintenanceTickets, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { TICKET_STATUS } from "@/lib/constants";
import { relTime } from "@/lib/format";
import { ActionForm, Modal } from "@/components/forms";
import { ScreensNav } from "@/components/screens-nav";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Textarea, cn, table } from "@/components/ui";
import { createTicketAction, updateTicketAction } from "@/app/actions/screens";

export const metadata = { title: "Maintenance" };

export default async function MaintenancePage() {
  await requireUser();
  const db = await getDb();
  const rows = await db
    .select({ t: maintenanceTickets, asset: assets.name, assetId: assets.id, who: users.name })
    .from(maintenanceTickets)
    .innerJoin(assets, eq(assets.id, maintenanceTickets.assetId))
    .leftJoin(users, eq(users.id, maintenanceTickets.assignedTo))
    .orderBy(asc(maintenanceTickets.status), desc(maintenanceTickets.createdAt));
  const screens = await db.select({ id: assets.id, name: assets.name }).from(assets).where(ne(assets.status, "inactive")).orderBy(asc(assets.name));
  const open = rows.filter((r) => r.t.status !== "resolved").length;

  return (
    <div>
      <PageHeader
        title="Screens"
        subtitle="Faults, repairs and downtime across your screens."
        actions={
          <Modal label="Report issue" icon={<Plus />} variant="primary" title="Report a problem">
            <ActionForm action={createTicketAction} submitLabel="Report issue">
              <Field label="Screen" required>
                <Select name="assetId" required defaultValue="">
                  <option value="" disabled>
                    Choose a screen…
                  </option>
                  {screens.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="What's wrong?" required>
                <Input name="title" required placeholder="e.g. Flex torn at bottom-left corner" />
              </Field>
              <Field label="Priority">
                <Select name="priority" defaultValue="normal">
                  <option value="high">High — screen is down</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </Select>
              </Field>
              <Field label="Details">
                <Textarea name="notes" rows={2} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" name="takeOffline" className="size-4" /> Mark screen as under maintenance
              </label>
            </ActionForm>
          </Modal>
        }
      />
      <ScreensNav active="maintenance" counts={{ maintenance: open }} />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Wrench />} title="No issues reported" text="When a screen has a problem, report it here so the team can track the fix." />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>Issue</th>
                  <th className={table.th}>Priority</th>
                  <th className={table.th}>Assigned</th>
                  <th className={table.th}>Status</th>
                  <th className={table.th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ t, asset, assetId, who }) => (
                  <tr key={t.id} className={cn(table.tr, t.status === "resolved" && "opacity-60")}>
                    <td className={table.td}>
                      <p className="font-medium text-neutral-900">{t.title}</p>
                      <p className="text-xs text-neutral-500">
                        <Link href={`/screens/${assetId}`} className="hover:underline">
                          {asset}
                        </Link>{" "}
                       , reported {relTime(t.createdAt)}
                      </p>
                    </td>
                    <td className={table.td}>
                      <Badge tone={t.priority === "high" ? "red" : t.priority === "low" ? "gray" : "blue"}>{t.priority}</Badge>
                    </td>
                    <td className={cn(table.td, "text-neutral-600")}>{who ?? "—"}</td>
                    <td className={table.td}>
                      <Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge>
                    </td>
                    <td className={cn(table.td, "text-right")}>
                      {t.status !== "resolved" && (
                        <Modal label="Update" size="sm" title="Update issue" description={t.title}>
                          <ActionForm action={updateTicketAction} submitLabel="Save">
                            <input type="hidden" name="id" value={t.id} />
                            <Field label="Status">
                              <Select name="status" defaultValue={t.status}>
                                <option value="open">Open</option>
                                <option value="in_progress">Being fixed</option>
                                <option value="resolved">Fixed</option>
                              </Select>
                            </Field>
                            <Field label="Repair cost (₹)">
                              <Input name="cost" inputMode="numeric" defaultValue={t.cost ? Math.round(t.cost / 100) : ""} />
                            </Field>
                          </ActionForm>
                        </Modal>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
