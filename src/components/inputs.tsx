"use client";

import { useState } from "react";
import { cn, Input } from "./ui";

/** Text input with one-tap suggestion chips. */
export function ChipInput({
  name,
  options,
  placeholder,
  required,
  defaultValue,
}: {
  name: string;
  options: string[];
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setValue(o)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              value === o ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400",
            )}
          >
            {o}
          </button>
        ))}
      </div>
      <Input name={name} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} required={required} />
    </div>
  );
}

/** Segmented control backed by a hidden input. */
export function Segmented({
  name,
  options,
  defaultValue,
  onChange,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  onChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(defaultValue ?? options[0]?.value ?? "");
  return (
    <div className="inline-flex rounded-full bg-neutral-100 p-1">
      <input type="hidden" name={name} value={value} />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            setValue(o.value);
            onChange?.(o.value);
          }}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Quick date presets next to a date input. */
export function DateQuick({ name, defaultValue, presets }: { name: string; defaultValue?: string; presets: { label: string; value: string }[] }) {
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setValue(p.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              value === p.value ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Input type="date" name={name} value={value} onChange={(e) => setValue(e.target.value)} />
    </div>
  );
}
