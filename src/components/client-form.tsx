import type { Client } from "@/db/schema";
import { INDUSTRIES, LEAD_SOURCES } from "@/lib/constants";
import { toRupees } from "@/lib/format";
import { INDIAN_STATES } from "@/lib/pricing";
import { Field, Input, Select, Textarea } from "./ui";

/** Shared fields for adding and editing a client. The essentials come first; the rest sit under "More details". */
export function ClientFields({ client, compact }: { client?: Client; compact?: boolean }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company / brand name" required className="sm:col-span-2">
          <Input name="name" required defaultValue={client?.name} placeholder="e.g. Aurum Jewellers" autoFocus={!client} />
        </Field>
        {!client && (
          <>
            <Field label="Contact person">
              <Input name="contactName" placeholder="Who do you talk to?" />
            </Field>
            <Field label="Designation">
              <Input name="designation" placeholder="e.g. Marketing Head" />
            </Field>
          </>
        )}
        <Field label="Phone">
          <Input name="phone" type="tel" defaultValue={client?.phone ?? ""} placeholder="98450 12345" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={client?.email ?? ""} placeholder="name@company.com" />
        </Field>
        <Field label="Industry">
          <Select name="industry" defaultValue={client?.industry ?? ""}>
            <option value="">Choose…</option>
            {INDUSTRIES.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </Select>
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={client?.city ?? "Bengaluru"} />
        </Field>
        {!compact && (
          <>
            <Field label="How did we find them?">
              <Select name="source" defaultValue={client?.source ?? ""}>
                <option value="">Choose…</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Approx. budget (₹)">
              <Input name="budget" inputMode="numeric" defaultValue={client?.budget ? toRupees(client.budget) : ""} placeholder="e.g. 500000" />
            </Field>
            <Field label="What are they looking for?" className="sm:col-span-2">
              <Textarea
                name="requirement"
                rows={2}
                defaultValue={client?.requirement ?? ""}
                placeholder="e.g. Diwali campaign on 2–3 LED screens in central Bengaluru"
              />
            </Field>
          </>
        )}
      </div>

      <details className="group rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3" open={!!client}>
        <summary className="cursor-pointer text-sm font-medium text-slate-700 select-none">More details (billing, GST, agency)</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Type of client">
            <Select name="type" defaultValue={client?.type ?? "advertiser"}>
              <option value="advertiser">Brand / direct advertiser</option>
              <option value="agency">Media agency</option>
              <option value="government">Government / PSU</option>
            </Select>
          </Field>
          <Field label="Agency commission %" hint="Only for agencies. Usually 15%.">
            <Input name="agencyCommission" type="number" step="0.5" min="0" max="30" defaultValue={client?.agencyCommission ?? 0} />
          </Field>
          <Field label="GSTIN" hint="State is picked up automatically from the GSTIN.">
            <Input name="gstin" defaultValue={client?.gstin ?? ""} placeholder="29ABCDE1234F1Z5" className="uppercase" />
          </Field>
          <Field label="State (for GST)">
            <Select name="stateCode" defaultValue={client?.stateCode ?? ""}>
              <option value="">Same as GSTIN / Karnataka</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="PAN">
            <Input name="pan" defaultValue={client?.pan ?? ""} className="uppercase" />
          </Field>
          <Field label="Credit period (days)">
            <Input name="creditDays" type="number" min="0" defaultValue={client?.creditDays ?? ""} placeholder="15" />
          </Field>
          <Field label="Billing address" className="sm:col-span-2">
            <Textarea name="address" rows={2} defaultValue={client?.address ?? ""} />
          </Field>
          <Field label="Website">
            <Input name="website" defaultValue={client?.website ?? ""} />
          </Field>
          <Field label="Preferred locations">
            <Input name="preferredLocations" defaultValue={client?.preferredLocations ?? ""} placeholder="e.g. MG Road, Koramangala" />
          </Field>
          <Field label="Timing">
            <Input name="timing" defaultValue={client?.timing ?? ""} placeholder="e.g. Next month, Diwali" />
          </Field>
          <Field label="Internal notes" className="sm:col-span-2">
            <Textarea name="notes" rows={2} defaultValue={client?.notes ?? ""} />
          </Field>
        </div>
      </details>
    </>
  );
}
