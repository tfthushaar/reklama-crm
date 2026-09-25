"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import { buttonClass, cn } from "./ui";

export type ActionResult = { ok: true; message?: string; redirectTo?: string } | { ok: false; error: string };
type ServerAction = (fd: FormData) => Promise<ActionResult>;

const ModalCtx = createContext<{ close: () => void } | null>(null);

export function toast(message: string, tone: "success" | "error" = "success") {
  window.dispatchEvent(new CustomEvent("rk-toast", { detail: { message, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; tone: string }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const { message, tone } = (e as CustomEvent).detail;
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, message, tone }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500);
    };
    window.addEventListener("rk-toast", on);
    return () => window.removeEventListener("rk-toast", on);
  }, []);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex flex-col items-end gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg",
            t.tone === "error" ? "bg-red-600" : "bg-slate-900",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost" | "accent";
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={buttonClass(variant, size, className)}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </button>
  );
}

/** A form bound to a server action that shows errors inline, toasts on success and closes its modal. */
export function ActionForm({
  action,
  children,
  className,
  submitLabel,
  submitVariant = "primary",
  hideSubmit,
  resetOnSuccess = true,
  successMessage,
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  submitLabel?: ReactNode;
  submitVariant?: "primary" | "secondary" | "danger" | "success" | "accent";
  hideSubmit?: boolean;
  resetOnSuccess?: boolean;
  successMessage?: string;
}) {
  const modal = useContext(ModalCtx);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(async (_prev, fd) => {
    const r = await action(fd);
    // Toast and navigate here rather than in an effect: the form may unmount when the page re-renders.
    if (r.ok) {
      const msg = r.message ?? successMessage;
      if (msg) toast(msg);
      if (r.redirectTo) router.push(r.redirectTo);
    }
    return r;
  }, null);

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      modal?.close();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form ref={formRef} action={formAction} className={cn("space-y-4", className)}>
      {children}
      {state && !state.ok && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{state.error}</div>
      )}
      {!hideSubmit && (
        <div className="flex justify-end gap-2 pt-1">
          {modal && (
            <button type="button" onClick={modal.close} className={buttonClass("ghost")}>
              Cancel
            </button>
          )}
          <SubmitButton variant={submitVariant}>{submitLabel ?? "Save"}</SubmitButton>
        </div>
      )}
    </form>
  );
}

export function Modal({
  label,
  icon,
  title,
  description,
  children,
  variant = "secondary",
  size = "md",
  wide,
  className,
  triggerClassName,
}: {
  label: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "accent";
  size?: "sm" | "md" | "lg";
  wide?: boolean;
  className?: string;
  triggerClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    ref.current?.close();
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className={cn(buttonClass(variant, size), triggerClassName)}
        onClick={() => {
          setOpen(true);
          ref.current?.showModal();
        }}
      >
        {icon}
        {label}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        className={cn(
          "m-auto w-[calc(100%-2rem)] rounded-2xl bg-white p-0 text-left shadow-2xl",
          wide ? "max-w-2xl" : "max-w-md",
          className,
        )}
      >
        <ModalCtx.Provider value={{ close }}>
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            <button type="button" onClick={close} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{open && children}</div>
        </ModalCtx.Provider>
      </dialog>
    </>
  );
}

/** A single button that runs a server action, optionally after a confirm prompt. */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
  size = "md",
  fields,
  className,
  full,
}: {
  action: ServerAction;
  children: ReactNode;
  confirm?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "accent";
  size?: "sm" | "md" | "lg";
  fields?: Record<string, string | number>;
  className?: string;
  full?: boolean;
}) {
  const router = useRouter();
  const [, formAction] = useActionState<ActionResult | null, FormData>(async (_p, fd) => {
    const r = await action(fd);
    if (r.ok) {
      if (r.message) toast(r.message);
      if (r.redirectTo) router.push(r.redirectTo);
    } else toast(r.error, "error");
    return r;
  }, null);
  return (
    <form
      action={formAction}
      className={full ? "flex w-full" : "inline-flex"}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton variant={variant} size={size} className={className}>
        {children}
      </SubmitButton>
    </form>
  );
}

export function useModal() {
  return useContext(ModalCtx);
}
