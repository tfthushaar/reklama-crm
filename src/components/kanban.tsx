"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Clock, IndianRupee } from "lucide-react";
import type { ActionResult } from "./forms";
import { toast } from "./forms";
import { Avatar, cn } from "./ui";

export type LeadCard = {
  id: number;
  name: string;
  stage: string;
  industry: string | null;
  requirement: string | null;
  budget: string | null;
  ownerName: string | null;
  lastContact: string;
  stale: boolean;
  nextTask: string | null;
  nextOverdue: boolean;
};

export function Kanban({
  columns,
  cards,
  moveAction,
}: {
  columns: { key: string; label: string; dot: string }[];
  cards: LeadCard[];
  moveAction: (fd: FormData) => Promise<ActionResult>;
}) {
  const [items, setItems] = useState(cards);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  useEffect(() => setItems(cards), [cards]);

  function drop(stage: string) {
    const id = dragId;
    setOver(null);
    setDragId(null);
    if (id === null) return;
    const card = items.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    const before = items;
    setItems((xs) => xs.map((c) => (c.id === id ? { ...c, stage } : c)));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      fd.set("stage", stage);
      const r = await moveAction(fd);
      if (r.ok) toast(`${card.name}: ${r.message ?? "moved"}`);
      else {
        setItems(before);
        toast(r.error, "error");
      }
    });
  }

  return (
    <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex min-w-max gap-3">
        {columns.map((col) => {
          const list = items.filter((c) => c.stage === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.key);
              }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={() => drop(col.key)}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl border bg-slate-100/70 transition-colors",
                over === col.key ? "border-brand-400 bg-brand-50" : "border-transparent",
              )}
            >
              <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className={cn("size-2 rounded-full", col.dot)} />
                <span className="text-sm font-semibold text-slate-800">{col.label}</span>
                <span className="rounded-full bg-white px-1.5 text-xs text-slate-500 tabular-nums">{list.length}</span>
              </div>
              <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">
                {list.map((c) => (
                  <Link
                    key={c.id}
                    href={`/clients/${c.id}`}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    className={cn(
                      "block cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-xs transition hover:border-brand-300 hover:shadow-sm active:cursor-grabbing",
                      dragId === c.id && "opacity-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm leading-snug font-medium text-slate-900">{c.name}</p>
                      {c.ownerName ? <Avatar name={c.ownerName} size="sm" /> : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">Unassigned</span>}
                    </div>
                    {c.requirement && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{c.requirement}</p>}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      {c.budget && (
                        <span className="inline-flex items-center gap-0.5 font-medium text-slate-700">
                          <IndianRupee className="size-3" />
                          {c.budget.replace("₹", "")}
                        </span>
                      )}
                      <span className={cn(c.stale && "font-medium text-amber-700")}>{c.lastContact}</span>
                    </div>
                    {c.nextTask && (
                      <p className={cn("mt-1.5 inline-flex items-center gap-1 text-[11px]", c.nextOverdue ? "font-medium text-red-600" : "text-slate-500")}>
                        <Clock className="size-3" /> {c.nextTask}
                      </p>
                    )}
                  </Link>
                ))}
                {list.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">Drag leads here</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
