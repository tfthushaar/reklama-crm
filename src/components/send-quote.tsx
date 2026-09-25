"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileDown, Mail, MessageCircle } from "lucide-react";
import { SubmitButton, useModal, type ActionResult } from "./forms";
import { Field, Input, buttonClass, cn } from "./ui";

export function SendQuoteForm({
  action,
  quoteId,
  phone,
  email,
  waText,
  mailSubject,
  mailBody,
  printHref,
  holdHours,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  quoteId: number;
  phone: string | null;
  email: string | null;
  waText: string;
  mailSubject: string;
  mailBody: string;
  printHref: string;
  holdHours: number;
}) {
  const modal = useModal();
  const router = useRouter();
  const [via, setVia] = useState<"whatsapp" | "email" | "in_person">(phone ? "whatsapp" : "email");
  const [to, setTo] = useState(via === "whatsapp" ? (phone ?? "") : (email ?? ""));
  const sent = useRef(false);
  // Refresh only once the dialog closes, so the share links stay on screen.
  useEffect(
    () => () => {
      if (sent.current) router.refresh();
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [state, formAction] = useActionState<ActionResult | null, FormData>(async (_p, fd) => {
    const r = await action(fd);
    if (r.ok) sent.current = true;
    return r;
  }, null);

  const digits = to.replace(/\D/g, "");
  const wa = `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}?text=${encodeURIComponent(waText)}`;
  const mail = `mailto:${to}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;

  if (state?.ok) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto size-10 text-neutral-900" />
        <div>
          <p className="font-semibold text-neutral-900">Marked as sent</p>
          <p className="text-sm text-neutral-500">The screens are held for {holdHours} hours and a follow-up reminder has been set.</p>
        </div>
        <div className="flex flex-col gap-2">
          <a href={printHref} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <FileDown /> Download PDF to attach
          </a>
          {via === "whatsapp" && (
            <a href={wa} target="_blank" rel="noreferrer" className={buttonClass("success")}>
              <MessageCircle /> Open WhatsApp with message
            </a>
          )}
          {via === "email" && (
            <a href={mail} className={buttonClass("primary")}>
              <Mail /> Open email with message
            </a>
          )}
          <button type="button" onClick={modal?.close} className={buttonClass("ghost")}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={quoteId} />
      <input type="hidden" name="via" value={via} />
      <div>
        <p className="mb-1.5 text-sm font-medium text-neutral-700">How are you sending it?</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["whatsapp", "WhatsApp", MessageCircle],
              ["email", "Email", Mail],
              ["in_person", "In person", CheckCircle2],
            ] as const
          ).map(([k, l, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setVia(k);
                setTo(k === "whatsapp" ? (phone ?? "") : k === "email" ? (email ?? "") : "");
              }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-sm font-medium",
                via === k ? "border-brand-600 bg-brand-50 text-brand-800" : "border-neutral-200 text-neutral-600 hover:border-neutral-300",
              )}
            >
              <Icon className="size-5" />
              {l}
            </button>
          ))}
        </div>
      </div>
      {via !== "in_person" && (
        <Field label={via === "whatsapp" ? "WhatsApp number" : "Email address"}>
          <Input name="to" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      )}
      <div className="rounded-lg bg-neutral-50 p-3 text-xs whitespace-pre-line text-neutral-600">{via === "email" ? mailBody : waText}</div>
      <p className="text-xs text-neutral-500">After saving you&apos;ll get a button to open {via === "email" ? "your email" : "WhatsApp"} with this message ready, plus the PDF.</p>
      {state && !state.ok && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={modal?.close} className={buttonClass("ghost")}>
          Cancel
        </button>
        <SubmitButton>Mark as sent & hold screens</SubmitButton>
      </div>
    </form>
  );
}
