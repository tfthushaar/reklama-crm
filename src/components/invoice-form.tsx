"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { addDays, inr } from "@/lib/format";
import { invoiceTotals } from "@/lib/pricing";
import { SubmitButton, type ActionResult } from "./forms";
import { Card, CardHeader, Field, Input, Select, Textarea, cn } from "./ui";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "./forms";

type Line = { key: string; description: string; amount: number; isMedia: boolean };

export function InvoiceForm({
  action,
  clientId,
  clientName,
  isAgency,
  bookingId,
  bookingTitle,
  defaultLines,
  commissionPct,
  creditDays,
  gstRate,
  interState,
  alreadyBilled,
  bookingTotal,
  issueDate,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  clientId: number;
  clientName: string;
  isAgency: boolean;
  bookingId: number | null;
  bookingTitle: string;
  defaultLines: { description: string; amount: number; isMedia: boolean }[];
  commissionPct: number;
  creditDays: number;
  gstRate: number;
  interState: boolean;
  alreadyBilled: number;
  bookingTotal: number;
  issueDate: string;
}) {
  const router = useRouter();
  const mk = (l: Omit<Line, "key">, i: number): Line => ({ key: `k${i}${Math.random().toString(36).slice(2, 6)}`, ...l });
  const [kind, setKind] = useState<"tax" | "proforma">(alreadyBilled === 0 && bookingId ? "tax" : "tax");
  const [lines, setLines] = useState<Line[]>(defaultLines.map(mk));
  const [commission, setCommission] = useState(commissionPct);
  const [date, setDate] = useState(issueDate);
  const [due, setDue] = useState(addDays(issueDate, creditDays));
  const [notes, setNotes] = useState("");
  const [state, formAction] = useActionState<ActionResult | null, FormData>(async (_p, fd) => action(fd), null);

  useEffect(() => {
    if (state?.ok) {
      if (state.message) toast(state.message);
      if (state.redirectTo) router.push(state.redirectTo);
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = invoiceTotals(
    lines.map((l) => ({ ...l, amount: Math.round(l.amount * 100) })),
    isAgency ? commission : 0,
    gstRate,
    interState,
  );

  function billPercent(pct: number) {
    const full = defaultLines.reduce((s, l) => s + l.amount, 0);
    setLines([mk({ description: `${pct}% advance for ${bookingTitle}`, amount: Math.round((full * pct) / 100), isMedia: true }, 0)]);
    setKind("proforma");
  }

  const payload = JSON.stringify({
    clientId,
    bookingId,
    kind,
    issueDate: date,
    dueDate: due,
    commissionPct: isAgency ? commission : 0,
    notes,
    lines: lines.map(({ key: _k, ...l }) => l),
  });

  return (
    <form action={formAction} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <input type="hidden" name="payload" value={payload} />
      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader title="What kind of invoice?" />
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {(
              [
                ["tax", "Tax invoice", "The GST invoice for display charges. Counts towards outstanding."],
                ["proforma", "Proforma (advance request)", "Ask for an advance before the campaign. Convert it to a tax invoice later."],
              ] as const
            ).map(([k, l, d]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn("rounded-xl border p-4 text-left", kind === k ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-neutral-200 hover:border-neutral-300")}
              >
                <p className="font-medium text-neutral-900">{l}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{d}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Lines"
            description={bookingId ? `Taken from the booking — edit if you're billing part of it.` : undefined}
            action={
              bookingId && (
                <div className="flex flex-wrap gap-1.5">
                  {[25, 50, 100].map((pct) =>
                    pct === 100 ? (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setLines(defaultLines.map(mk))}
                        className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium hover:border-neutral-400"
                      >
                        Full booking
                      </button>
                    ) : (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => billPercent(pct)}
                        className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium hover:border-neutral-400"
                      >
                        {pct}% advance
                      </button>
                    ),
                  )}
                </div>
              )
            }
          />
          <div className="space-y-2 p-4">
            {lines.map((l) => (
              <div key={l.key} className="grid items-center gap-2 sm:grid-cols-[1fr_160px_auto]">
                <Input
                  value={l.description}
                  onChange={(e) => setLines((xs) => xs.map((x) => (x.key === l.key ? { ...x, description: e.target.value } : x)))}
                  placeholder="Description"
                />
                <Input
                  type="number"
                  min="0"
                  value={l.amount}
                  onChange={(e) => setLines((xs) => xs.map((x) => (x.key === l.key ? { ...x, amount: Number(e.target.value) } : x)))}
                  className="text-right"
                />
                <button
                  type="button"
                  onClick={() => setLines((xs) => xs.filter((x) => x.key !== l.key))}
                  className="justify-self-end rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove line"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setLines((xs) => [...xs, mk({ description: "", amount: 0, isMedia: false }, xs.length)])}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
            >
              <Plus className="size-4" /> Add line
            </button>
            {alreadyBilled > 0 && (
              <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-800">
                {inr(alreadyBilled)} of this booking&apos;s {inr(bookingTotal)} has already been invoiced. Adjust the amounts so you don&apos;t bill twice.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader title={kind === "tax" ? "Tax invoice" : "Proforma invoice"} description={clientName} />
          <div className="space-y-3 px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={due} min={date} onChange={(e) => setDue(e.target.value)} />
              </Field>
            </div>
            <div className="space-y-1.5 border-t border-neutral-100 pt-3 text-sm">
              <Row k="Amount" v={inr(t.gross)} />
              {isAgency && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-neutral-600">
                    Agency commission
                    <input
                      type="number"
                      value={commission}
                      step="0.5"
                      min="0"
                      max="30"
                      onChange={(e) => setCommission(Number(e.target.value))}
                      className="w-14 rounded border border-neutral-300 px-1.5 py-0.5 text-right text-xs"
                    />
                    %
                  </span>
                  <span className="tabular-nums">− {inr(t.commission)}</span>
                </div>
              )}
              <Row k="Taxable value" v={inr(t.taxable)} />
              {interState ? (
                <Row k={`IGST ${gstRate}%`} v={inr(t.igst)} muted />
              ) : (
                <>
                  <Row k={`CGST ${gstRate / 2}%`} v={inr(t.cgst)} muted />
                  <Row k={`SGST ${gstRate / 2}%`} v={inr(t.sgst)} muted />
                </>
              )}
              <div className="flex items-baseline justify-between border-t border-neutral-200 pt-2">
                <span className="font-semibold">Total</span>
                <span className="text-2xl font-semibold tabular-nums">{inr(t.total)}</span>
              </div>
            </div>
            <Field label="Notes on invoice (optional)">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. PO no. / campaign reference" />
            </Field>
            {state && !state.ok && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
            <div className="flex flex-col gap-2 pt-1">
              <SubmitButton name="issue" value="1" className="w-full">
                Issue {kind === "tax" ? "invoice" : "proforma"} now
              </SubmitButton>
              <SubmitButton name="issue" value="0" variant="secondary" className="w-full">
                Save as draft
              </SubmitButton>
              <p className="text-center text-xs text-neutral-500">Issuing gives it the next number in the series. Drafts don&apos;t use up numbers.</p>
            </div>
          </div>
        </Card>
      </div>
    </form>
  );
}

function Row({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", muted ? "text-neutral-500" : "text-neutral-700")}>
      <span>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}
