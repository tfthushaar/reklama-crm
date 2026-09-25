"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
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
    <div className="scrollbar-thin -mx-5 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
      <div className="flex min-w-max gap-4">
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
              className={cn("flex w-[17rem] shrink-0 flex-col rounded-2xl transition-colors", over === col.key ? "bg-neutral-200/60" : "bg-neutral-100")}
            >
              <div className="flex items-baseline justify-between px-4 pt-4 pb-3">
                <span className="text-sm font-medium text-neutral-900">{col.label}</span>
                <span className="text-[13px] text-neutral-400 tabular-nums">{list.length}</span>
              </div>
              <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {list.map((c) => (
                  <Link
                    key={c.id}
                    href={`/clients/${c.id}`}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    className={cn(
                      "block cursor-grab rounded-xl bg-white p-3.5 ring-1 ring-black/[0.04] transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:cursor-grabbing",
                      dragId === c.id && "opacity-40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm leading-snug font-medium text-neutral-900">{c.name}</p>
                      {c.ownerName ? <Avatar name={c.ownerName} size="sm" /> : <span className="text-[11px] text-neutral-500">Unassigned</span>}
                    </div>
                    {c.requirement && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-neutral-500">{c.requirement}</p>}
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-neutral-500">
                      <span className={cn(c.nextOverdue && "text-red-600")}>{c.nextTask ? `Next: ${c.nextTask}` : c.lastContact}</span>
                      {c.budget && <span className="font-medium text-neutral-900">{c.budget}</span>}
                    </div>
                  </Link>
                ))}
                {list.length === 0 && <p className="px-2 py-8 text-center text-xs text-neutral-400">Drag a lead here</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
