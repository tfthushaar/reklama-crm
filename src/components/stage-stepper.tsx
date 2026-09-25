import { Check } from "lucide-react";
import { setStageAction } from "@/app/actions/clients";
import { LOST_REASONS, STAGES } from "@/lib/constants";
import { ActionButton, ActionForm, Modal } from "./forms";
import { ChipInput } from "./inputs";
import { Field, cn } from "./ui";

export function StageStepper({ clientId, stage, lostReason, canEdit }: { clientId: number; stage: string; lostReason: string | null; canEdit: boolean }) {
  const flow = STAGES.filter((s) => s.key !== "lost");
  const idx = flow.findIndex((s) => s.key === stage);
  const lost = stage === "lost";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ol className="flex flex-1 flex-wrap items-center gap-1">
        {flow.map((s, i) => {
          const done = !lost && i < idx;
          const current = !lost && i === idx;
          const pill = (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                current && (s.key === "won" ? "bg-emerald-600 text-white ring-emerald-600" : "bg-brand-700 text-white ring-brand-700"),
                done && "bg-brand-50 text-brand-700 ring-brand-200",
                !current && !done && "bg-white text-slate-500 ring-slate-200",
              )}
            >
              {done && <Check className="size-3" />}
              {s.label}
            </span>
          );
          return (
            <li key={s.key} className="flex items-center gap-1">
              {canEdit && !current ? (
                <ActionButton action={setStageAction} fields={{ id: clientId, stage: s.key }} variant="ghost" size="sm" className="h-auto rounded-full p-0 hover:bg-transparent">
                  {pill}
                </ActionButton>
              ) : (
                pill
              )}
              {i < flow.length - 1 && <span className="h-px w-3 bg-slate-300" />}
            </li>
          );
        })}
      </ol>
      {lost ? (
        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">Lost · {lostReason}</span>
      ) : (
        canEdit && (
          <Modal label="Mark as lost" variant="ghost" size="sm" title="Why was this lead lost?" description="This helps spot patterns in lost deals.">
            <ActionForm action={setStageAction} submitLabel="Mark as lost" submitVariant="danger">
              <input type="hidden" name="id" value={clientId} />
              <input type="hidden" name="stage" value="lost" />
              <Field label="Reason" required group>
                <ChipInput name="lostReason" options={LOST_REASONS} required />
              </Field>
            </ActionForm>
          </Modal>
        )
      )}
    </div>
  );
}
