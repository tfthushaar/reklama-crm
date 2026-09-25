import Link from "next/link";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ChevronLeft } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import type { Tone } from "@/lib/constants";
import { initials } from "@/lib/format";

export const cn = (...args: ClassValue[]) => twMerge(clsx(args));

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "accent";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-700",
  accent: "bg-neutral-900 text-white hover:bg-neutral-700",
  success: "bg-neutral-900 text-white hover:bg-neutral-700",
  secondary: "bg-white text-neutral-900 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50 hover:ring-neutral-300",
  ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
  danger: "bg-white text-red-600 ring-1 ring-inset ring-neutral-200 hover:bg-red-50 hover:ring-red-200",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors select-none disabled:opacity-40 disabled:pointer-events-none cursor-pointer [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/** A grouped panel: white surface, hairline edge, no shadow. */
export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("rounded-2xl border border-line bg-white", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-6 pt-5 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-neutral-900">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-neutral-500">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
    </div>
  );
}

// Monochrome status language: solid ink = done, outline = in progress,
// grey = neutral, red = something is wrong.
const TONES: Record<Tone, string> = {
  gray: "bg-neutral-100 text-neutral-600",
  teal: "bg-neutral-100 text-neutral-600",
  purple: "bg-neutral-100 text-neutral-700",
  blue: "bg-white text-neutral-700 ring-1 ring-inset ring-neutral-300",
  amber: "bg-white text-neutral-900 ring-1 ring-inset ring-neutral-900",
  green: "bg-neutral-900 text-white",
  red: "bg-white text-red-600 ring-1 ring-inset ring-red-200",
};

export function Badge({ tone = "gray", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Labelled form field. Use `group` when it wraps several controls (chips, segmented buttons) — a <label> would hijack clicks. */
export function Field({
  label,
  hint,
  children,
  required,
  className,
  group,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  required?: boolean;
  className?: string;
  group?: boolean;
}) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className={cn("block", className)} {...(group ? { role: "group" } : {})}>
      <span className="mb-1.5 block text-[13px] font-medium text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-neutral-400">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-neutral-500">{hint}</span>}
    </Tag>
  );
}

const inputBase =
  "block w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 transition-[border,box-shadow] outline-none focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/5 disabled:bg-neutral-50 disabled:text-neutral-500";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputBase, "h-10", className)} {...props} />;
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(inputBase, "py-2.5", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(inputBase, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ml-1 mb-3 inline-flex items-center gap-0.5 text-[13px] text-neutral-500 transition-colors hover:text-neutral-900">
      <ChevronLeft className="size-4 stroke-[1.75]" />
      {label}
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  badge,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  badge?: ReactNode;
}) {
  return (
    <div className="mb-8">
      {back && <BackLink href={back.href} label={back.label} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] text-neutral-900">{title}</h1>
            {badge}
          </div>
          {subtitle && <div className="mt-1.5 max-w-2xl text-[15px] text-neutral-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** A row of headline figures in one panel, divided by hairlines. */
export function StatRow({ children, className, cols = 4 }: { children: ReactNode; className?: string; cols?: 3 | 4 }) {
  return (
    <Card
      className={cn(
        "grid grid-cols-2 overflow-hidden",
        cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4",
        "[&>*]:border-line max-lg:[&>*:nth-child(even)]:border-l max-lg:[&>*:nth-child(n+3)]:border-t lg:[&>*+*]:border-l",
        className,
      )}
    >
      {children}
    </Card>
  );
}

export function Stat({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "red" | "green" | "amber";
  icon?: ReactNode;
}) {
  const body = (
    <>
      <p className="text-[13px] text-neutral-500">{label}</p>
      <p className={cn("mt-1 text-[26px] leading-tight font-semibold tracking-[-0.02em]", tone === "red" ? "text-red-600" : "text-neutral-900")}>{value}</p>
      {hint && <p className="mt-1 text-[13px] text-neutral-500">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block px-6 py-5 transition-colors hover:bg-neutral-50">
      {body}
    </Link>
  ) : (
    <div className="px-6 py-5">{body}</div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-neutral-300 [&_svg]:size-7 [&_svg]:stroke-[1.5]">{icon}</div>}
      <p className="text-[15px] font-medium text-neutral-900">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[13px] text-neutral-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Tabs({ items }: { items: { label: string; href: string; active: boolean; count?: number }[] }) {
  return (
    <div className="scrollbar-thin -mx-1 mb-6 flex gap-6 overflow-x-auto border-b border-line px-1">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px inline-flex items-center gap-1.5 border-b-2 py-3 text-sm whitespace-nowrap transition-colors",
            t.active ? "border-neutral-900 font-medium text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="tabular text-neutral-400">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string | null | undefined; size?: "sm" | "md" }) {
  return (
    <span
      title={name ?? undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-100 font-medium text-neutral-600",
        size === "sm" ? "size-6 text-[10px]" : "size-8 text-[11px]",
      )}
    >
      {initials(name)}
    </span>
  );
}

export const table = {
  wrap: "overflow-x-auto scrollbar-thin",
  table: "w-full text-sm",
  th: "px-4 py-3 text-left text-[13px] font-normal text-neutral-500 border-b border-line whitespace-nowrap first:pl-6 last:pr-6",
  td: "px-4 py-3.5 border-b border-neutral-100 align-middle first:pl-6 last:pr-6",
  tr: "hover:bg-neutral-50/80 transition-colors [&:last-child>td]:border-b-0",
};

export function Notice({ tone = "blue", children, icon, className }: { tone?: "blue" | "amber" | "red" | "green"; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl px-4 py-3.5 text-sm",
        tone === "red" ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-700",
        className,
      )}
    >
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4 [&_svg]:stroke-[1.75]">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-neutral-100">
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-6 py-3 text-[13px]">
          <dt className="shrink-0 text-neutral-500">{k}</dt>
          <dd className="text-right text-neutral-900">{v || <span className="text-neutral-300">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Small status dot used in lists: filled = active, ring = pending, red = problem. */
export function StatusDot({ state }: { state: "on" | "pending" | "off" | "problem" }) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        state === "on" && "bg-neutral-900",
        state === "pending" && "ring-[1.5px] ring-neutral-900 ring-inset",
        state === "off" && "bg-neutral-300",
        state === "problem" && "bg-red-500",
      )}
    />
  );
}

/** Quiet status for list rows: a dot plus the label, keyed off the same tones as Badge. */
export function StatusLabel({ tone, label, className }: { tone: Tone; label: ReactNode; className?: string }) {
  const state = tone === "green" ? "on" : tone === "red" ? "problem" : tone === "blue" || tone === "amber" ? "pending" : "off";
  return (
    <span className={cn("inline-flex items-center gap-2 text-[13px] whitespace-nowrap", tone === "red" ? "text-red-600" : "text-neutral-700", className)}>
      <StatusDot state={state} />
      {label}
    </span>
  );
}
