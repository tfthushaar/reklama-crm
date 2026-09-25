"use client";

import { useState } from "react";
import { PAYMENT_MODES } from "@/lib/constants";
import { today } from "@/lib/format";
import { Field, Input, Select, cn } from "./ui";

/** Amount + TDS inputs with one-tap TDS presets (TDS is calculated on the taxable value). */
export function PaymentFields({ balance, taxable }: { balance: number; taxable: number }) {
  const [tds, setTds] = useState(0);
  const [amount, setAmount] = useState(balance);
  const [pct, setPct] = useState<number | null>(null);

  function applyTds(p: number | null) {
    setPct(p);
    const t = p ? Math.round((taxable * p) / 100) : 0;
    setTds(t);
    setAmount(Math.max(0, balance - t));
  }

  return (
    <>
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Did the client deduct TDS?</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            [null, "No TDS"],
            [1, "1% TDS"],
            [2, "2% TDS"],
            [10, "10% TDS"],
          ].map(([p, l]) => (
            <button
              key={String(l)}
              type="button"
              onClick={() => applyTds(p as number | null)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                pct === p ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount received (₹)" required>
          <Input name="amount" type="number" min="0" required value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="TDS deducted (₹)">
          <Input name="tds" type="number" min="0" value={tds} onChange={(e) => setTds(Number(e.target.value))} />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        Settles ₹{(amount + tds).toLocaleString("en-IN")} of the ₹{balance.toLocaleString("en-IN")} balance
        {amount + tds < balance ? ` — ₹${(balance - amount - tds).toLocaleString("en-IN")} will still be due.` : "."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Received on">
          <Input type="date" name="date" defaultValue={today()} />
        </Field>
        <Field label="Mode">
          <Select name="mode" defaultValue="Bank transfer">
            {PAYMENT_MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Reference (UTR / cheque no.)">
        <Input name="reference" placeholder="e.g. NEFT HDFC000123" />
      </Field>
    </>
  );
}
