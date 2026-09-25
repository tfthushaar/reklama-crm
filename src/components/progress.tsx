import { cn } from "./ui";

export type Step = { label: string; state: "done" | "current" | "todo" | "failed" };

/** Read-only progress track that matches the client stage bar. */
export function ProgressTrack({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s) => (
        <li key={s.label} className="min-w-0">
          <span
            className={cn(
              "block h-1 rounded-full",
              s.state === "done" || s.state === "current" ? "bg-neutral-900" : s.state === "failed" ? "bg-red-500" : "bg-neutral-200",
            )}
          />
          <span
            className={cn(
              "mt-2 block truncate text-xs",
              s.state === "current" ? "font-medium text-neutral-900" : s.state === "done" ? "text-neutral-600" : s.state === "failed" ? "font-medium text-red-600" : "text-neutral-400",
            )}
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
