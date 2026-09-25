import { asc, desc, eq } from "drizzle-orm";
import { Download, RotateCcw, ShieldCheck, UserPlus } from "lucide-react";
import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { INDIAN_STATES } from "@/lib/pricing";
import { getSettings } from "@/lib/services/common";
import { ActionButton, ActionForm, Modal } from "@/components/forms";
import { Avatar, Badge, Card, CardHeader, Field, Input, Notice, PageHeader, Select, Tabs, Textarea, buttonClass, cn, table } from "@/components/ui";
import { createUserAction, resetDemoAction, updateCompanyAction, updateRulesAction, updateUserAction } from "@/app/actions/settings";

export const metadata = { title: "Settings" };

const ROLE_HELP: Record<string, string> = {
  owner: "Everything, including settings, approvals and all reports",
  sales_manager: "All leads and quotes, assigns leads, approves discounts up to their limit",
  sales_exec: "Their leads, conversations, reminders and quotes",
  operations: "Screens, bookings, creatives, proof of display and maintenance",
  accounts: "Invoices, payments, receipts and outstanding",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePerm("admin");
  const sp = await searchParams;
  const tab = (["company", "rules", "team", "audit", "data"] as const).find((x) => x === sp.tab) ?? "company";
  const db = await getDb();
  const s = await getSettings(db);

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Company details, business rules and who can do what." />
      <Tabs
        items={[
          { label: "Company", href: "/settings?tab=company", active: tab === "company" },
          { label: "Rules & pricing", href: "/settings?tab=rules", active: tab === "rules" },
          { label: "Team & access", href: "/settings?tab=team", active: tab === "team" },
          { label: "Audit log", href: "/settings?tab=audit", active: tab === "audit" },
          { label: "Data & backup", href: "/settings?tab=data", active: tab === "data" },
        ]}
      />

      {tab === "company" && (
        <Card className="p-5 sm:p-6">
          <p className="mb-4 text-sm text-neutral-500">These details appear on quotations, invoices and receipts.</p>
          <ActionForm action={updateCompanyAction} submitLabel="Save company details" resetOnSuccess={false}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand name" required>
                <Input name="companyName" defaultValue={s.companyName} required />
              </Field>
              <Field label="Legal name">
                <Input name="legalName" defaultValue={s.legalName ?? ""} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input name="address" defaultValue={s.address ?? ""} />
              </Field>
              <Field label="City">
                <Input name="city" defaultValue={s.city ?? ""} />
              </Field>
              <Field label="State">
                <Select name="stateCode" defaultValue={s.stateCode ?? ""}>
                  {INDIAN_STATES.map((x) => (
                    <option key={x.code} value={x.code}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="GSTIN" hint="Decides CGST+SGST vs IGST on every invoice">
                <Input name="gstin" defaultValue={s.gstin ?? ""} className="uppercase" />
              </Field>
              <Field label="PAN">
                <Input name="pan" defaultValue={s.pan ?? ""} className="uppercase" />
              </Field>
              <Field label="Phone">
                <Input name="phone" defaultValue={s.phone ?? ""} />
              </Field>
              <Field label="Email">
                <Input name="email" defaultValue={s.email ?? ""} />
              </Field>
              <Field label="Website">
                <Input name="website" defaultValue={s.website ?? ""} />
              </Field>
            </div>
            <p className="pt-2 text-sm font-semibold text-neutral-900">Bank details for payments</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bank & branch">
                <Input name="bankName" defaultValue={s.bankName ?? ""} />
              </Field>
              <Field label="Account number">
                <Input name="bankAccount" defaultValue={s.bankAccount ?? ""} />
              </Field>
              <Field label="IFSC">
                <Input name="bankIfsc" defaultValue={s.bankIfsc ?? ""} className="uppercase" />
              </Field>
              <Field label="UPI ID">
                <Input name="upiId" defaultValue={s.upiId ?? ""} />
              </Field>
            </div>
          </ActionForm>
        </Card>
      )}

      {tab === "rules" && (
        <Card className="p-5 sm:p-6">
          <ActionForm action={updateRulesAction} submitLabel="Save rules" resetOnSuccess={false}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="GST rate (%)">
                <Input name="gstRate" type="number" step="0.5" defaultValue={s.gstRate} />
              </Field>
              <Field label="SAC code" hint="Confirm with your CA">
                <Input name="sacCode" defaultValue={s.sacCode} />
              </Field>
              <Field label="Default credit period (days)">
                <Input name="paymentTermsDays" type="number" defaultValue={s.paymentTermsDays} />
              </Field>
              <Field label="Hold screens for (hours)" hint="After a quote is sent">
                <Input name="holdHours" type="number" defaultValue={s.holdHours} />
              </Field>
              <Field label="Quotes valid for (days)">
                <Input name="quoteValidityDays" type="number" defaultValue={s.quoteValidityDays} />
              </Field>
              <div />
              <Field label="Sales executive can give up to (%)" hint="Above this, a manager approves">
                <Input name="execDiscountLimit" type="number" step="0.5" defaultValue={s.execDiscountLimit} />
              </Field>
              <Field label="Sales manager can give up to (%)" hint="Above this, the owner approves">
                <Input name="managerDiscountLimit" type="number" step="0.5" defaultValue={s.managerDiscountLimit} />
              </Field>
            </div>
            <Field label="Quotation terms & conditions">
              <Textarea name="quoteTerms" rows={6} defaultValue={s.quoteTerms ?? ""} />
            </Field>
            <Field label="Invoice terms">
              <Textarea name="invoiceTerms" rows={4} defaultValue={s.invoiceTerms ?? ""} />
            </Field>
          </ActionForm>
        </Card>
      )}

      {tab === "team" && <Team />}
      {tab === "audit" && <Audit />}

      {tab === "data" && (
        <div className="space-y-5">
          <Card className="p-5">
            <p className="font-semibold text-neutral-900">Export everything</p>
            <p className="mt-1 text-sm text-neutral-600">
              One Excel workbook with clients, contacts, screens, quotes, bookings, invoices, payments, activity and tasks — your data, in a format any
              system can import.
            </p>
            <a href="/api/export/all" className={cn(buttonClass("secondary"), "mt-3")}>
              <Download /> Download full export
            </a>
          </Card>
          <Card className="p-5">
            <p className="font-semibold text-neutral-900">Reset demo data</p>
            <p className="mt-1 text-sm text-neutral-600">
              Wipes everything and reloads the sample clients, screens and campaigns (dates move to today). Use this before a demo.
            </p>
            <div className="mt-3">
              <ActionButton action={resetDemoAction} variant="danger" confirm="This deletes all data and reloads the demo. Continue?">
                <RotateCcw /> Reset demo data
              </ActionButton>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

async function Team() {
  const db = await getDb();
  const list = await db.select().from(users).orderBy(asc(users.id));
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="People"
          description={`${list.filter((u) => u.active).length} active users`}
          action={
            <Modal label="Add person" icon={<UserPlus />} variant="primary" title="Add a team member">
              <ActionForm action={createUserAction} submitLabel="Add">
                <Field label="Name" required>
                  <Input name="name" required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email (login)" required>
                    <Input name="email" type="email" required />
                  </Field>
                  <Field label="Phone">
                    <Input name="phone" />
                  </Field>
                </div>
                <Field label="Role" required>
                  <Select name="role" defaultValue="sales_exec">
                    {Object.entries(ROLE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Temporary password" required hint="At least 6 characters. Ask them to change it.">
                  <Input name="password" required minLength={6} />
                </Field>
              </ActionForm>
            </Modal>
          }
        />
        <div className={table.wrap}>
          <table className={table.table}>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className={cn(table.tr, !u.active && "opacity-50")}>
                  <td className={table.td}>
                    <span className="flex items-center gap-3">
                      <Avatar name={u.name} />
                      <span>
                        <span className="block font-medium text-neutral-900">{u.name}</span>
                        <span className="text-xs text-neutral-500">{u.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className={table.td}>
                    <Badge tone={u.role === "owner" ? "purple" : "gray"}>{ROLE_LABEL[u.role]}</Badge>
                    {!u.active && <Badge tone="red" className="ml-1">Deactivated</Badge>}
                  </td>
                  <td className={cn(table.td, "text-right")}>
                    <Modal label="Edit" size="sm" variant="ghost" title={`Edit ${u.name}`}>
                      <ActionForm action={updateUserAction} submitLabel="Save" resetOnSuccess={false}>
                        <input type="hidden" name="id" value={u.id} />
                        <Field label="Role">
                          <Select name="role" defaultValue={u.role}>
                            {Object.entries(ROLE_LABEL).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Phone">
                          <Input name="phone" defaultValue={u.phone ?? ""} />
                        </Field>
                        <Field label="New password" hint="Leave empty to keep the current one">
                          <Input name="password" minLength={6} />
                        </Field>
                        <label className="flex items-center gap-2 text-sm text-neutral-700">
                          <input type="checkbox" name="active" defaultChecked={u.active} className="size-4" /> Can sign in
                        </label>
                      </ActionForm>
                    </Modal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title="What each role can do" />
        <ul className="divide-y divide-neutral-100">
          {Object.entries(ROLE_HELP).map(([k, v]) => (
            <li key={k} className="flex items-start gap-3 px-5 py-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
              <span>
                <b className="text-neutral-900">{ROLE_LABEL[k as keyof typeof ROLE_LABEL]}</b> — <span className="text-neutral-600">{v}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

async function Audit() {
  const db = await getDb();
  const rows = await db
    .select({ a: auditLog, who: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(300);
  return (
    <Card>
      <CardHeader title="Who changed what" description="Every create, edit, approval, payment and cancellation is recorded here." />
      {rows.length === 0 ? (
        <Notice className="m-5">Nothing recorded yet.</Notice>
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th className={table.th}>When</th>
                <th className={table.th}>Who</th>
                <th className={table.th}>What</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, who }) => (
                <tr key={a.id} className={table.tr}>
                  <td className={cn(table.td, "whitespace-nowrap text-neutral-500")}>{fmtDateTime(a.createdAt)}</td>
                  <td className={cn(table.td, "whitespace-nowrap")}>{who ?? "System"}</td>
                  <td className={table.td}>
                    <Badge tone="gray" className="mr-2">
                      {a.action}
                    </Badge>
                    {a.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
