"use client";

import { useState } from "react";
import type { Asset } from "@/db/schema";
import { Segmented } from "./inputs";
import { Field, Input, Select, Textarea } from "./ui";

const rupees = (p: number | null | undefined) => (p ? Math.round(p / 100) : "");

export function ScreenFields({
  asset,
  owners,
  suggestedCode,
}: {
  asset?: Asset;
  owners: { id: number; name: string }[];
  suggestedCode?: string;
}) {
  const [type, setType] = useState<string>(asset?.type ?? "led");
  const [saleMode, setSaleMode] = useState<string>(asset?.saleMode ?? "both");
  const [ownership, setOwnership] = useState<string>(asset?.ownership ?? "owned");
  const [slots, setSlots] = useState<number>(asset?.totalSlots ?? 12);
  const [slotSec, setSlotSec] = useState<number>(asset?.slotSeconds ?? 10);
  const led = type === "led";

  return (
    <div className="space-y-5">
      <Section title="What and where">
        <div className="sm:col-span-2">
          <Segmented
            name="type"
            defaultValue={type}
            onChange={setType}
            options={[
              { value: "led", label: "LED screen" },
              { value: "hoarding", label: "Hoarding / billboard" },
            ]}
          />
        </div>
        <Field label="Name" required>
          <Input name="name" required defaultValue={asset?.name} placeholder="e.g. MG Road Metro LED" />
        </Field>
        <Field label="Code" required hint="Your internal ID for this screen">
          <Input name="code" required defaultValue={asset?.code ?? suggestedCode} className="uppercase" />
        </Field>
        <Field label="City" required>
          <Input name="city" required defaultValue={asset?.city ?? "Bengaluru"} />
        </Field>
        <Field label="Area">
          <Input name="area" defaultValue={asset?.area ?? ""} placeholder="e.g. Koramangala" />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input name="address" defaultValue={asset?.address ?? ""} />
        </Field>
        <Field label="Landmark / facing">
          <Input name="landmark" defaultValue={asset?.landmark ?? ""} placeholder="e.g. Facing traffic towards airport" />
        </Field>
        <Field label="Google Maps link">
          <Input name="mapLink" defaultValue={asset?.mapLink ?? ""} placeholder="https://maps.google.com/…" />
        </Field>
      </Section>

      <Section title="Size and display">
        <Field label="Width (ft)">
          <Input name="widthFt" type="number" step="0.5" defaultValue={asset?.widthFt ?? ""} />
        </Field>
        <Field label="Height (ft)">
          <Input name="heightFt" type="number" step="0.5" defaultValue={asset?.heightFt ?? ""} />
        </Field>
        {led ? (
          <>
            <Field label="Resolution (pixels)">
              <Input name="resolution" defaultValue={asset?.resolution ?? ""} placeholder="1920 × 1080" />
            </Field>
            <Field label="Operating hours">
              <Input name="operatingHours" defaultValue={asset?.operatingHours ?? ""} placeholder="6 AM – 12 AM" />
            </Field>
          </>
        ) : (
          <Field label="Lighting">
            <Select name="illumination" defaultValue={asset?.illumination ?? "frontlit"}>
              <option value="frontlit">Front-lit</option>
              <option value="backlit">Back-lit</option>
              <option value="nonlit">Non-lit</option>
            </Select>
          </Field>
        )}
        <Field label="Daily traffic (approx.)" hint="Used to estimate impressions and CPM">
          <Input name="dailyTraffic" type="number" defaultValue={asset?.dailyTraffic ?? ""} placeholder="150000" />
        </Field>
      </Section>

      <Section title="How it's sold and priced">
        {led && (
          <>
            <Field label="Sell this screen by" className="sm:col-span-2" group>
              <Segmented
                name="saleMode"
                defaultValue={saleMode}
                onChange={setSaleMode}
                options={[
                  { value: "both", label: "Slots or whole screen" },
                  { value: "slots", label: "Slots only" },
                  { value: "exclusive", label: "Whole screen only" },
                ]}
              />
            </Field>
            <Field label="Slots in the loop" hint="How many advertisers can share it">
              <Input name="totalSlots" type="number" min="1" value={slots} onChange={(e) => setSlots(Number(e.target.value))} />
            </Field>
            <Field label="Seconds per slot">
              <Input name="slotSeconds" type="number" min="1" value={slotSec} onChange={(e) => setSlotSec(Number(e.target.value))} />
            </Field>
            <p className="-mt-2 text-xs text-slate-500 sm:col-span-2">
              Loop length: <b>{slots * slotSec} seconds</b> — each advertiser shows about {Math.round(3600 / Math.max(1, slots * slotSec))} times an hour.
            </p>
            <input type="hidden" name="loopSeconds" value={slots * slotSec} />
          </>
        )}
        {(!led || saleMode !== "slots") && (
          <Field label={led ? "Whole screen — rate per month (₹)" : "Rate per month (₹)"} required>
            <Input name="monthlyRate" inputMode="numeric" defaultValue={rupees(asset?.monthlyRate)} placeholder="400000" />
          </Field>
        )}
        {led && saleMode !== "exclusive" && (
          <Field label="One slot — rate per month (₹)" required>
            <Input name="slotRate" inputMode="numeric" defaultValue={rupees(asset?.slotRate)} placeholder="38000" />
          </Field>
        )}
        <Field label="Minimum booking (days)">
          <Input name="minDays" type="number" min="1" defaultValue={asset?.minDays ?? 7} />
        </Field>
      </Section>

      <details className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3" open={!!asset && asset.ownership !== "owned"}>
        <summary className="cursor-pointer text-sm font-medium text-slate-700 select-none">Site owner, lease and permit</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Ownership">
            <Select name="ownership" value={ownership} onChange={(e) => setOwnership(e.target.value)}>
              <option value="owned">We own it</option>
              <option value="leased">Leased from a site owner</option>
              <option value="third_party">Another media owner&apos;s site (we resell)</option>
            </Select>
          </Field>
          {ownership !== "owned" && (
            <>
              <Field label="Site owner">
                <Select name="siteOwnerId" defaultValue={asset?.siteOwnerId ?? ""}>
                  <option value="">Choose…</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={ownership === "leased" ? "Rent per month (₹)" : "Our buying cost per month (₹)"}>
                <Input name="rentMonthly" inputMode="numeric" defaultValue={rupees(asset?.rentMonthly)} />
              </Field>
              <Field label="Agreement ends on">
                <Input name="leaseEnd" type="date" defaultValue={asset?.leaseEnd ?? ""} />
              </Field>
            </>
          )}
          <Field label="Permit / licence number">
            <Input name="permitNumber" defaultValue={asset?.permitNumber ?? ""} />
          </Field>
          <Field label="Permit valid until">
            <Input name="permitExpiry" type="date" defaultValue={asset?.permitExpiry ?? ""} />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={asset?.status ?? "active"}>
              <option value="active">Active — can be sold</option>
              <option value="maintenance">Under maintenance</option>
              <option value="inactive">Inactive — hidden from quotes</option>
            </Select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea name="notes" rows={2} defaultValue={asset?.notes ?? ""} />
          </Field>
        </div>
      </details>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold text-slate-900">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
