import Link from "next/link";
import { asc } from "drizzle-orm";
import { Plus, Store } from "lucide-react";
import { getDb } from "@/db";
import { assets, siteOwners } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { OWNERSHIP_LABEL } from "@/lib/constants";
import { addDays, fmtDay, inr, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ActionForm, Modal } from "@/components/forms";
import { ScreensNav } from "@/components/screens-nav";
import { Card, EmptyState, Field, Input, PageHeader, Textarea, cn } from "@/components/ui";
import { createSiteOwnerAction } from "@/app/actions/screens";

export const metadata = { title: "Site owners" };

export default async function OwnersPage() {
  const user = await requireUser();
  const db = await getDb();
  const owners = await db.select().from(siteOwners).orderBy(asc(siteOwners.name));
  const list = await db.select().from(assets).orderBy(asc(assets.code));
  const t = today();

  return (
    <div>
      <PageHeader
        title="Screens"
        subtitle="Landlords and media owners whose sites you use, with rent and agreement dates."
        actions={
          can(user, "inventory") && (
            <Modal label="Add site owner" icon={<Plus />} variant="primary" title="Add a site owner">
              <ActionForm action={createSiteOwnerAction} submitLabel="Add">
                <Field label="Name" required>
                  <Input name="name" required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone">
                    <Input name="phone" type="tel" />
                  </Field>
                  <Field label="Email">
                    <Input name="email" type="email" />
                  </Field>
                </div>
                <Field label="Address">
                  <Textarea name="address" rows={2} />
                </Field>
                <Field label="Notes">
                  <Textarea name="notes" rows={2} />
                </Field>
              </ActionForm>
            </Modal>
          )
        }
      />
      <ScreensNav active="owners" />
      {owners.length === 0 ? (
        <Card>
          <EmptyState icon={<Store />} title="No site owners yet" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {owners.map((o) => {
            const sites = list.filter((a) => a.siteOwnerId === o.id);
            const rent = sites.reduce((s, a) => s + (a.rentMonthly ?? 0), 0);
            return (
              <Card key={o.id}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div>
                    <p className="font-semibold text-slate-900">{o.name}</p>
                    <p className="text-sm text-slate-500">{[o.phone, o.email].filter(Boolean).join(" · ")}</p>
                    {o.notes && <p className="mt-1 text-xs text-slate-500">{o.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Monthly payout</p>
                    <p className="font-semibold tabular-nums">{rent ? inr(rent) : "—"}</p>
                  </div>
                </div>
                {sites.length === 0 ? (
                  <p className="px-5 py-3 text-sm text-slate-500">No screens linked yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {sites.map((a) => {
                      const soon = a.leaseEnd && a.leaseEnd <= addDays(t, 60);
                      return (
                        <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                          <div>
                            <Link href={`/screens/${a.id}`} className="font-medium text-slate-800 hover:underline">
                              {a.name}
                            </Link>
                            <p className="text-xs text-slate-500">{OWNERSHIP_LABEL[a.ownership]}</p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="font-medium text-slate-700 tabular-nums">{a.rentMonthly ? `${inr(a.rentMonthly)}/mo` : "—"}</p>
                            <p className={cn("text-slate-500", soon && "font-medium text-amber-700")}>{a.leaseEnd ? `Ends ${fmtDay(a.leaseEnd)}` : ""}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
