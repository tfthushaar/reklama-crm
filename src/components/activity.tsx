import { Mail, MessageCircle, Phone, StickyNote, Users, Zap } from "lucide-react";
import { logActivityAction } from "@/app/actions/clients";
import { ACTIVITY_TYPES, CALL_OUTCOMES, MEETING_OUTCOMES, MESSAGE_OUTCOMES } from "@/lib/constants";
import { addDays, fmtTime, today } from "@/lib/format";
import { ActionForm, Modal } from "./forms";
import { ChipInput, DateQuick, Segmented } from "./inputs";
import { Badge, Field, Input, Textarea, buttonClass, cn } from "./ui";

type Kind = "call" | "whatsapp" | "email" | "meeting" | "note";

export const ACTIVITY_ICON = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: Users,
  note: StickyNote,
  system: Zap,
};

const ICON_BG: Record<string, string> = {
  call: "bg-blue-100 text-blue-700",
  whatsapp: "bg-emerald-100 text-emerald-700",
  email: "bg-violet-100 text-violet-700",
  meeting: "bg-amber-100 text-amber-800",
  note: "bg-slate-100 text-slate-600",
  system: "bg-teal-50 text-teal-700",
};

const CONFIG: Record<Kind, { label: string; title: string; outcomes: string[] }> = {
  call: { label: "Log call", title: "Log a call", outcomes: CALL_OUTCOMES },
  whatsapp: { label: "WhatsApp", title: "Log a WhatsApp conversation", outcomes: MESSAGE_OUTCOMES },
  email: { label: "Email", title: "Log an email", outcomes: MESSAGE_OUTCOMES },
  meeting: { label: "Meeting", title: "Log a meeting", outcomes: MEETING_OUTCOMES },
  note: { label: "Note", title: "Add a note", outcomes: [] },
};

function presets() {
  const t = today();
  return [
    { label: "Tomorrow", value: addDays(t, 1) },
    { label: "In 3 days", value: addDays(t, 3) },
    { label: "Next week", value: addDays(t, 7) },
  ];
}

export function waLink(phone: string | null | undefined, text?: string) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return null;
  const num = d.length === 10 ? `91${d}` : d;
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function LogActivityButton({
  kind,
  clientId,
  clientName,
  phone,
  email,
  variant = "secondary",
}: {
  kind: Kind;
  clientId: number;
  clientName: string;
  phone?: string | null;
  email?: string | null;
  variant?: "secondary" | "primary" | "ghost";
}) {
  const cfg = CONFIG[kind];
  const Icon = ACTIVITY_ICON[kind];
  const wa = kind === "whatsapp" ? waLink(phone, `Hello, this is from Reklama Global regarding your outdoor advertising requirement.`) : null;
  const mail = kind === "email" && email ? `mailto:${email}` : null;
  const tel = kind === "call" && phone ? `tel:${phone.replace(/\s/g, "")}` : null;

  return (
    <Modal label={cfg.label} icon={<Icon />} variant={variant} title={cfg.title} description={clientName}>
      {(wa || mail || tel) && (
        <a
          href={(wa || mail || tel)!}
          target={wa ? "_blank" : undefined}
          rel="noreferrer"
          className={cn(buttonClass(kind === "whatsapp" ? "success" : "primary", "md"), "mb-4 w-full")}
        >
          <Icon />
          {kind === "whatsapp" ? `Open WhatsApp chat (${phone})` : kind === "email" ? `Write email to ${email}` : `Call ${phone}`}
        </a>
      )}
      <ActionForm action={logActivityAction} submitLabel="Save to timeline">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="type" value={kind} />
        {(kind === "call" || kind === "whatsapp" || kind === "email") && (
          <Segmented
            name="direction"
            options={[
              { value: "out", label: kind === "call" ? "I called" : "I sent" },
              { value: "in", label: kind === "call" ? "They called" : "They sent" },
            ]}
          />
        )}
        {cfg.outcomes.length > 0 && (
          <Field label="Outcome" group>
            <ChipInput name="outcome" options={cfg.outcomes} placeholder="Pick one or type your own" />
          </Field>
        )}
        <Field label={kind === "note" ? "Note" : "Notes"}>
          <Textarea name="notes" rows={3} placeholder={kind === "note" ? "Anything the team should know" : "What was discussed?"} required={kind === "note"} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="When">
            <Input type="date" name="date" defaultValue={today()} />
          </Field>
          {kind === "call" || kind === "meeting" ? (
            <Field label="Duration (minutes)">
              <Input type="number" name="duration" min="0" placeholder={kind === "call" ? "5" : "30"} />
            </Field>
          ) : (
            <Field label="Time">
              <Input type="time" name="time" defaultValue={fmtTime24()} />
            </Field>
          )}
        </div>
        {kind !== "note" && (
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="mb-2 text-sm font-medium text-slate-700">Set a follow-up reminder?</p>
            <DateQuick name="nextDate" presets={presets()} />
            <Input name="nextTitle" className="mt-2" placeholder={`e.g. Call ${clientName} back with rates`} />
          </div>
        )}
      </ActionForm>
    </Modal>
  );
}

function fmtTime24() {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date());
}

export type TimelineItem = {
  id: number;
  type: keyof typeof ACTIVITY_TYPES;
  direction: string | null;
  outcome: string | null;
  notes: string | null;
  durationMin: number | null;
  occurredAt: Date;
  who: string | null;
};

const VERB: Record<string, [string, string]> = {
  call: ["called", "received a call"],
  whatsapp: ["sent a WhatsApp", "got a WhatsApp reply"],
  email: ["sent an email", "received an email"],
  meeting: ["had a meeting", "had a meeting"],
  note: ["added a note", "added a note"],
  system: ["", ""],
};

export function TimelineEntry({ a }: { a: TimelineItem }) {
  const Icon = ACTIVITY_ICON[a.type];
  const verb = VERB[a.type]![a.direction === "in" ? 1 : 0];
  return (
    <li className="group relative flex gap-3 pb-5 last:pb-0">
      <span className="absolute top-9 bottom-0 left-4 w-px bg-slate-200 group-last:hidden" aria-hidden />
      <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white", ICON_BG[a.type])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {a.type === "system" ? (
            <span className="text-slate-700">{a.notes}</span>
          ) : (
            <>
              <span className="font-medium text-slate-900">{a.who ?? "Someone"}</span>
              <span className="text-slate-600">{verb}</span>
              {a.durationMin ? <span className="text-slate-400">· {a.durationMin} min</span> : null}
              {a.outcome && <Badge tone={ACTIVITY_TYPES[a.type].tone}>{a.outcome}</Badge>}
            </>
          )}
          <span className="ml-auto text-xs whitespace-nowrap text-slate-400">{fmtTime(a.occurredAt)}</span>
        </div>
        {a.type !== "system" && a.notes && <p className="mt-1 text-sm whitespace-pre-line text-slate-600">{a.notes}</p>}
        {a.type === "system" && a.who && <p className="mt-0.5 text-xs text-slate-400">by {a.who}</p>}
      </div>
    </li>
  );
}
