"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, Minus, Plus, Search, X } from "lucide-react";
import type { LineCheck } from "@/app/actions/quotes";
import { addDays, daysBetween, fmtRange, inr, num } from "@/lib/format";
import { computeTotals, priceLine, type LineInput } from "@/lib/pricing";
import { ActionForm, type ActionResult } from "./forms";
import { Card, CardHeader, Field, Input, Select, StatusDot, Textarea, buttonClass, cn } from "./ui";

export type AssetOpt = {
  id: number;
  code: string;
  name: string;
  type: "led" | "hoarding";
  area: string | null;
  saleMode: "exclusive" | "slots" | "both";
  totalSlots: number;
  slotSeconds: number | null;
  monthlyRate: number; // rupees
  slotRate: number | null; // rupees
  minDays: number;
  dailyTraffic: number | null;
  widthFt: number | null;
  heightFt: number | null;
  photo: string | null;
  maintenance: boolean;
};

export type ClientOpt = { id: number; name: string; type: string; agencyCommission: number; interState: boolean };

type MediaLine = {
  key: string;
  kind: "media";
  assetId: number;
  startDate: string;
  endDate: string;
  mode: "exclusive" | "slots";
  slots: number;
  rate: number;
  discountPct: number;
};
type ProdLine = { key: string; kind: "production"; description: string; qty: number; rate: number; discountPct: number };
export type BuilderLine = MediaLine | ProdLine;

export type BuilderInitial = {
  quoteId?: number;
  clientId: number | null;
  title: string;
  startDate: string;
  endDate: string;
  validUntil: string;
  notes: string;
  terms: string;
  commissionPct: number | null;
  lines: BuilderLine[];
  addAssetId?: number | null;
};

let seq = 0;
const newKey = () => `l${Date.now().toString(36)}${seq++}`;
const capOf = (a: AssetOpt) => (a.type === "hoarding" ? 1 : Math.max(1, a.totalSlots));

export function QuoteBuilder({
  assets,
  clients,
  initial,
  gstRate,
  discountLimit,
  saveAction,
  checkAction,
}: {
  assets: AssetOpt[];
  clients: ClientOpt[];
  initial: BuilderInitial;
  gstRate: number;
  discountLimit: number;
  saveAction: (fd: FormData) => Promise<ActionResult>;
  checkAction: (items: { key: string; assetId: number; start: string; end: string }[], excludeQuoteId?: number) => Promise<Record<string, LineCheck>>;
}) {
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const [clientId, setClientId] = useState<number | null>(initial.clientId);
  const client = clients.find((c) => c.id === clientId) ?? null;
  const [title, setTitle] = useState(initial.title);
  const [start, setStart] = useState(initial.startDate);
  const [end, setEnd] = useState(initial.endDate);
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [notes, setNotes] = useState(initial.notes);
  const [terms, setTerms] = useState(initial.terms);
  const [commission, setCommission] = useState<number>(initial.commissionPct ?? client?.agencyCommission ?? 0);
  const [lines, setLines] = useState<BuilderLine[]>(() => {
    const base = initial.lines.filter((l) => l.kind !== "media" || byId.has(l.assetId));
    const add = initial.addAssetId ? byId.get(initial.addAssetId) : null;
    return add && !base.some((l) => l.kind === "media" && l.assetId === add.id) ? [...base, makeLine(add, initial.startDate, initial.endDate)] : base;
  });
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "led" | "hoarding">("");
  const [pickerChecks, setPickerChecks] = useState<Record<string, LineCheck>>({});
  const [lineChecks, setLineChecks] = useState<Record<string, LineCheck>>({});
  const [checking, startCheck] = useTransition();

  function makeLine(a: AssetOpt, s: string, e: string): MediaLine {
    const mode = a.type === "hoarding" || a.saleMode === "exclusive" ? "exclusive" : "slots";
    return {
      key: newKey(),
      kind: "media",
      assetId: a.id,
      startDate: s,
      endDate: e,
      mode,
      slots: 1,
      rate: mode === "slots" ? (a.slotRate ?? 0) : a.monthlyRate,
      discountPct: 0,
    };
  }

  // availability for the picker (campaign dates)
  useEffect(() => {
    if (!start || !end || end < start) return;
    const t = setTimeout(() => {
      startCheck(async () => {
        const r = await checkAction(
          assets.map((a) => ({ key: `p${a.id}`, assetId: a.id, start, end })),
          initial.quoteId,
        );
        setPickerChecks(r);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [start, end]); // eslint-disable-line react-hooks/exhaustive-deps

  // availability for each selected line
  const lineSig = lines
    .filter((l): l is MediaLine => l.kind === "media")
    .map((l) => `${l.key}:${l.assetId}:${l.startDate}:${l.endDate}`)
    .join("|");
  useEffect(() => {
    const media = lines.filter((l): l is MediaLine => l.kind === "media");
    if (media.length === 0) return;
    const t = setTimeout(async () => {
      const r = await checkAction(
        media.map((l) => ({ key: l.key, assetId: l.assetId, start: l.startDate, end: l.endDate })),
        initial.quoteId,
      );
      setLineChecks(r);
    }, 250);
    return () => clearTimeout(t);
  }, [lineSig]); // eslint-disable-line react-hooks/exhaustive-deps

  function changeCampaignDates(s: string, e: string) {
    setLines((xs) => xs.map((l) => (l.kind === "media" && l.startDate === start && l.endDate === end ? { ...l, startDate: s, endDate: e } : l)));
    setStart(s);
    setEnd(e);
  }

  function update(key: string, patch: Partial<MediaLine> | Partial<ProdLine>) {
    setLines((xs) => xs.map((l) => (l.key === key ? ({ ...l, ...patch } as BuilderLine) : l)));
  }

  function setMode(l: MediaLine, mode: "exclusive" | "slots") {
    const a = byId.get(l.assetId)!;
    update(l.key, { mode, rate: mode === "slots" ? (a.slotRate ?? 0) : a.monthlyRate });
  }

  const hoardingSqft = lines.reduce((s, l) => {
    if (l.kind !== "media") return s;
    const a = byId.get(l.assetId);
    return a?.type === "hoarding" ? s + (a.widthFt ?? 0) * (a.heightFt ?? 0) : s;
  }, 0);

  function addExtra(kind: "print" | "mount" | "design" | "video" | "other") {
    const presets = {
      print: { description: `Flex printing (${num(hoardingSqft)} sq ft)`, qty: hoardingSqft || 1, rate: 12 },
      mount: { description: "Mounting & installation", qty: Math.max(1, lines.filter((l) => l.kind === "media" && byId.get(l.assetId)?.type === "hoarding").length), rate: 5000 },
      design: { description: "Creative design", qty: 1, rate: 15000 },
      video: { description: "Video editing for LED", qty: 1, rate: 10000 },
      other: { description: "", qty: 1, rate: 0 },
    };
    setLines((xs) => [...xs, { key: newKey(), kind: "production", discountPct: 0, ...presets[kind] }]);
  }

  // pricing
  const priced = lines.map((l) => ({
    line: l,
    p: priceLine(
      l.kind === "media"
        ? { ...l, rate: Math.round(l.rate * 100), slots: l.slots }
        : { ...l, rate: Math.round(l.rate * 100) },
    ),
  }));
  const totals = computeTotals(
    priced.map((x) => x.p),
    { commissionPct: client?.type === "agency" ? commission : 0, gstRate, interState: !!client?.interState },
  );
  let impressions = 0;
  for (const { line, p } of priced) {
    if (line.kind !== "media") continue;
    const a = byId.get(line.assetId);
    if (!a?.dailyTraffic) continue;
    const share = line.mode === "exclusive" ? 1 : line.slots / capOf(a);
    impressions += a.dailyTraffic * (p.days ?? 0) * share;
  }
  const cpm = impressions > 0 ? (totals.taxable / 100 / impressions) * 1000 : 0;

  const media = lines.filter((l): l is MediaLine => l.kind === "media");
  const added = new Set(media.map((l) => l.assetId));
  const filtered = assets.filter(
    (a) =>
      (!typeFilter || a.type === typeFilter) &&
      (!q || `${a.name} ${a.code} ${a.area}`.toLowerCase().includes(q.toLowerCase())),
  );
  const problems = media.filter((l) => {
    const c = lineChecks[l.key];
    const a = byId.get(l.assetId)!;
    const need = l.mode === "exclusive" ? capOf(a) : l.slots;
    return c && c.freeMin < need;
  }).length;

  const payload = JSON.stringify({
    quoteId: initial.quoteId,
    clientId,
    title,
    validUntil,
    notes,
    terms,
    commissionPct: client?.type === "agency" ? commission : 0,
    lines: lines.map(({ key: _k, ...rest }) => rest),
  });

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        {/* Step 1 */}
        <Card>
          <CardHeader title={<Step n={1}>Client and campaign</Step>} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Client" required>
              <Select
                value={clientId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value) || null;
                  setClientId(id);
                  const c = clients.find((x) => x.id === id);
                  setCommission(c?.type === "agency" ? c.agencyCommission : 0);
                }}
              >
                <option value="">Choose a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.type === "agency" ? " (agency)" : ""}
                  </option>
                ))}
              </Select>
              <span className="mt-1 block text-xs text-neutral-500">
                Not listed?{" "}
                <Link href="/clients/new" className="text-neutral-900 underline underline-offset-2">
                  Add a lead first
                </Link>
              </span>
            </Field>
            <Field label="Campaign name">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diwali festive campaign" />
            </Field>
          </div>
        </Card>

        {/* Step 2 */}
        <Card>
          <CardHeader title={<Step n={2}>Campaign dates</Step>} description="Every screen you add uses these dates — you can change them per screen later." />
          <div className="flex flex-wrap items-end gap-3 p-5">
            <Field label="Starts">
              <Input type="date" value={start} onChange={(e) => changeCampaignDates(e.target.value, end < e.target.value ? addDays(e.target.value, 29) : end)} />
            </Field>
            <Field label="Ends">
              <Input type="date" value={end} min={start} onChange={(e) => changeCampaignDates(start, e.target.value)} />
            </Field>
            <div className="flex gap-1.5 pb-1">
              {[
                ["2 weeks", 13],
                ["1 month", 29],
                ["2 months", 59],
                ["3 months", 89],
              ].map(([l, d]) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => changeCampaignDates(start, addDays(start, d as number))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    end === addDays(start, d as number) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            {start && end >= start && <p className="pb-2 text-sm text-neutral-500">{daysBetween(start, end)} days</p>}
          </div>
        </Card>

        {/* Step 3 */}
        <Card>
          <CardHeader
            title={<Step n={3}>Choose screens</Step>}
            description={checking ? "Checking availability…" : `Availability shown for ${fmtRange(start, end)}`}
          />
          <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 px-5 py-3">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or area" className="pl-9" />
            </div>
            <div className="flex gap-1 rounded-full bg-neutral-100 p-1">
              {(
                [
                  ["", "All"],
                  ["led", "LED"],
                  ["hoarding", "Hoardings"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTypeFilter(k)}
                  className={cn("rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors", typeFilter === k ? "bg-white shadow-sm" : "text-neutral-600")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <ul className="scrollbar-thin max-h-[420px] divide-y divide-neutral-100 overflow-y-auto">
            {filtered.map((a) => {
              const c = pickerChecks[`p${a.id}`];
              const cap = capOf(a);
              const minNeed = a.type === "hoarding" || a.saleMode === "exclusive" ? cap : 1;
              let status: { text: string; state: "on" | "pending" | "off" | "problem" } = { text: "Checking", state: "off" };
              let disabled = false;
              if (a.maintenance) {
                status = { text: "Under maintenance", state: "problem" };
                disabled = true;
              } else if (c) {
                if (c.freeMin < minNeed) {
                  status = { text: c.bookedBy ? `Booked by ${c.bookedBy}` : "Booked", state: "off" };
                  disabled = true;
                } else if (cap > 1 && c.freeMin < cap) status = { text: `${c.freeMin} of ${cap} slots free`, state: "pending" };
                else if (c.freeMinWithHolds < c.freeMin) status = { text: `On hold for ${c.heldBy ?? "another client"}`, state: "pending" };
                else status = { text: "Free", state: "on" };
              }
              const isAdded = added.has(a.id);
              return (
                <li key={a.id} className={cn("flex items-center gap-4 px-6 py-3", disabled && !isAdded && "opacity-50")}>
                  {a.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.photo} alt="" className="h-11 w-[4.5rem] shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="h-11 w-[4.5rem] shrink-0 rounded-lg bg-neutral-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">{a.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 truncate text-[13px] text-neutral-500">
                      <StatusDot state={status.state} />
                      <span className="truncate">{status.text}</span>
                    </p>
                  </div>
                  <p className="hidden shrink-0 text-right text-[13px] leading-tight text-neutral-900 sm:block">
                    {a.type === "led" && a.saleMode !== "exclusive" ? `₹${num(a.slotRate)}` : `₹${num(a.monthlyRate)}`}
                    <span className="block text-neutral-500">{a.type === "led" && a.saleMode !== "exclusive" ? "per slot, month" : "per month"}</span>
                  </p>
                  {isAdded ? (
                    <span className="inline-flex h-8 w-20 items-center justify-center gap-1 rounded-full bg-neutral-100 text-[13px] font-medium text-neutral-900">
                      <Check className="size-3.5 stroke-[2]" /> Added
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setLines((xs) => [...xs, makeLine(a, start, end)])}
                      className={buttonClass("secondary", "sm", "w-20")}
                    >
                      <Plus /> Add
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Step 4 */}
        <Card>
          <CardHeader
            title={<Step n={4}>Selected screens and pricing</Step>}
            description={media.length ? `${media.length} screen${media.length > 1 ? "s" : ""} in this quote` : "Add screens from the list above"}
          />
          <div className="space-y-3 p-4">
            {media.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">No screens yet.</p>}
            {priced.map(({ line, p }) => {
              if (line.kind !== "media") return null;
              const a = byId.get(line.assetId)!;
              const cap = capOf(a);
              const c = lineChecks[line.key];
              const need = line.mode === "exclusive" ? cap : line.slots;
              const canSlots = a.type === "led" && a.saleMode !== "exclusive";
              const canWhole = a.type === "hoarding" || a.saleMode !== "slots";
              const tooShort = (p.days ?? 0) < a.minDays;
              return (
                <div key={line.key} className="rounded-2xl bg-neutral-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900">{a.name}</p>
                      <p className="text-xs text-neutral-500">
                        {a.code}, {a.area}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines((xs) => xs.filter((x) => x.key !== line.key))}
                      className="rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
                      aria-label="Remove"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-neutral-600">From</span>
                      <Input type="date" value={line.startDate} onChange={(e) => update(line.key, { startDate: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-neutral-600">To ({p.days} days)</span>
                      <Input type="date" value={line.endDate} min={line.startDate} onChange={(e) => update(line.key, { endDate: e.target.value })} />
                    </label>
                    <div className="sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-neutral-600">Booking</span>
                      <div className="flex flex-wrap items-center gap-2">
                        {canSlots && canWhole && (
                          <div className="inline-flex rounded-full bg-neutral-200/70 p-1">
                            {(["slots", "exclusive"] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setMode(line, m)}
                                className={cn(
                                  "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                                  line.mode === m ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600",
                                )}
                              >
                                {m === "slots" ? "Slots" : "Whole screen"}
                              </button>
                            ))}
                          </div>
                        )}
                        {line.mode === "slots" ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => update(line.key, { slots: Math.max(1, line.slots - 1) })}
                              className="rounded-full bg-white p-1.5 ring-1 ring-neutral-200 ring-inset transition-colors hover:ring-neutral-400"
                              aria-label="Fewer slots"
                            >
                              <Minus className="size-3.5" />
                            </button>
                            <span className="w-24 text-center text-sm">
                              <b>{line.slots}</b> of {cap} slots
                            </span>
                            <button
                              type="button"
                              onClick={() => update(line.key, { slots: Math.min(cap, line.slots + 1) })}
                              className="rounded-full bg-white p-1.5 ring-1 ring-neutral-200 ring-inset transition-colors hover:ring-neutral-400"
                              aria-label="More slots"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm text-neutral-600">{a.type === "hoarding" ? "Whole hoarding" : "Whole screen — every slot in the loop"}</span>
                        )}
                      </div>
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-neutral-600">Rate / month{line.mode === "slots" ? " per slot" : ""} (₹)</span>
                      <Input type="number" min="0" value={line.rate} onChange={(e) => update(line.key, { rate: Number(e.target.value) })} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-neutral-600">Discount %</span>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={line.discountPct}
                        onChange={(e) => update(line.key, { discountPct: Number(e.target.value) })}
                        className={cn(line.discountPct > discountLimit && "border-neutral-900 bg-neutral-100")}
                      />
                    </label>
                    <div className="flex flex-col justify-end sm:col-span-2 sm:items-end">
                      <span className="text-xs text-neutral-500">
                        {line.mode === "slots" && a.slotSeconds ? `${line.slots * a.slotSeconds}s in every ${cap * a.slotSeconds}s, ` : ""}
                        {p.gross !== p.amount && <span className="line-through">{inr(p.gross)}</span>}
                      </span>
                      <span className="text-lg font-semibold text-neutral-900 tabular-nums">{inr(p.amount)}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs">
                    {!c ? (
                      <span className="text-neutral-400">Checking availability…</span>
                    ) : c.freeMin < need ? (
                      <span className="inline-flex items-center gap-1 font-medium text-red-600">
                        <AlertTriangle className="size-3.5" />
                        Not available for these dates{c.freeMin > 0 ? ` — only ${c.freeMin} slot${c.freeMin > 1 ? "s" : ""} free` : ""}
                        {c.bookedBy ? ` (booked by ${c.bookedBy})` : ""}. Change dates or slots.
                      </span>
                    ) : c.freeMinWithHolds < need ? (
                      <span className="inline-flex items-center gap-1 font-medium text-neutral-900">
                        <AlertTriangle className="size-3.5" /> On hold for {c.heldBy ?? "another client"} — they get first refusal.
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-neutral-900">
                        <Check className="size-3.5" /> Available
                      </span>
                    )}
                    {tooShort && <span className="ml-3 text-neutral-900">Minimum booking for this screen is {a.minDays} days.</span>}
                  </div>
                </div>
              );
            })}

            {priced
              .filter((x) => x.line.kind === "production")
              .map(({ line, p }) => {
                const l = line as ProdLine;
                return (
                  <div key={l.key} className="grid items-end gap-3 rounded-2xl bg-neutral-50 p-4 sm:grid-cols-[1fr_90px_120px_110px_auto]">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-neutral-600">Extra charge</span>
                      <Input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="Description" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-neutral-600">Qty</span>
                      <Input type="number" min="0" value={l.qty} onChange={(e) => update(l.key, { qty: Number(e.target.value) })} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-neutral-600">Rate (₹)</span>
                      <Input type="number" min="0" value={l.rate} onChange={(e) => update(l.key, { rate: Number(e.target.value) })} />
                    </label>
                    <p className="pb-2 text-right font-semibold tabular-nums">{inr(p.amount)}</p>
                    <button
                      type="button"
                      onClick={() => setLines((xs) => xs.filter((x) => x.key !== l.key))}
                      className="mb-1.5 rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
                      aria-label="Remove"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                );
              })}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-medium text-neutral-500">Add extra:</span>
              {(
                [
                  ["print", "Printing"],
                  ["mount", "Mounting"],
                  ["design", "Creative design"],
                  ["video", "Video editing"],
                  ["other", "Other"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addExtra(k)}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-400"
                >
                  <Plus className="size-3" /> {l}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Summary */}
      <div className="xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader title="Quote summary" description={client ? client.name : "Choose a client"} />
          <div className="space-y-2 px-5 py-4 text-sm">
            <Row label={`Screens (${media.length})`} value={inr(totals.mediaGross)} />
            {totals.discountTotal > 0 && <Row label="Discount" value={`− ${inr(totals.discountTotal)}`} tone="green" />}
            {client?.type === "agency" && (
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-neutral-600">
                  Agency commission
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    value={commission}
                    onChange={(e) => setCommission(Number(e.target.value))}
                    className="w-14 rounded border border-neutral-300 px-1.5 py-0.5 text-right text-xs"
                  />
                  %
                </span>
                <span className="tabular-nums">− {inr(totals.commission)}</span>
              </div>
            )}
            {totals.production > 0 && <Row label="Production & extras" value={inr(totals.production)} />}
            <div className="border-t border-neutral-100 pt-2">
              <Row label="Taxable value" value={inr(totals.taxable)} />
            </div>
            {client?.interState ? (
              <Row label={`IGST ${gstRate}%`} value={inr(totals.igst)} muted />
            ) : (
              <>
                <Row label={`CGST ${gstRate / 2}%`} value={inr(totals.cgst)} muted />
                <Row label={`SGST ${gstRate / 2}%`} value={inr(totals.sgst)} muted />
              </>
            )}
            <div className="flex items-baseline justify-between border-t border-neutral-200 pt-3">
              <span className="font-semibold text-neutral-900">Total</span>
              <span className="text-2xl font-semibold tracking-tight text-neutral-900 tabular-nums">{inr(totals.total)}</span>
            </div>
            {impressions > 0 && (
              <p className="text-xs text-neutral-500">
                ~{num(Math.round(impressions))} estimated impressions, CPM ₹{cpm.toFixed(0)}
              </p>
            )}
          </div>

          {totals.maxDiscountPct > discountLimit && (
            <div className="mx-6 mb-3 rounded-xl bg-neutral-100 px-3.5 py-2.5 text-xs text-neutral-800">
              A {totals.maxDiscountPct}% discount is above your {discountLimit}% limit. Saving will send this quote for approval before it can go to the client.
            </div>
          )}
          {problems > 0 && (
            <div className="mx-6 mb-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {problems} screen{problems > 1 ? "s are" : " is"} not available for the chosen dates. You can save, but it can&apos;t be booked until that&apos;s fixed.
            </div>
          )}

          <div className="space-y-3 border-t border-neutral-100 px-5 py-4">
            <Field label="Valid until">
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </Field>
            <Field label="Note for the client (optional)">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-neutral-600 select-none">Terms & conditions</summary>
              <Textarea rows={6} value={terms} onChange={(e) => setTerms(e.target.value)} className="mt-2 text-xs" />
            </details>
            <ActionForm action={saveAction} submitLabel={initial.quoteId ? "Save changes" : "Save quote"} resetOnSuccess={false} className="pt-1">
              <input type="hidden" name="payload" value={payload} />
            </ActionForm>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-6 items-center justify-center rounded-full bg-neutral-900 text-xs font-medium text-white">{n}</span>
      {children}
    </span>
  );
}

function Row({ label, value, tone, muted }: { label: string; value: string; tone?: "green"; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("text-neutral-600", muted && "text-neutral-500")}>{label}</span>
      <span className={cn("tabular-nums", tone === "green" && "text-neutral-900", muted && "text-neutral-500")}>{value}</span>
    </div>
  );
}
