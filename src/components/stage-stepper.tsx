import { setStageAction } from "@/app/actions/clients";
import { LOST_REASONS, STAGES } from "@/lib/constants";
import { ActionButton, ActionForm, Modal } from "./forms";
import { ChipInput } from "./inputs";
import { Field, cn } from "./ui";

/** A slim progress track: filled segments for stages reached, labels underneath, click a stage to move there. */
export function StageStepper({ clientId, stage, lostReason, canEdit }: { clientId: number; stage: string; lostReason: string | null; canEdit: boolean }) {
  const flow = STAGES.filter((s) => s.key !== "lost");
  const idx = flow.findIndex((s) => s.key === stage);
  const lost = stage === "lost";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-[13px] text-neutral-500">
          {lost ? (
            <>
              <span className="font-medium text-red-600">Lost</span>
              {lostReason ? `: ${lostReason.toLowerCase()}` : ""}
            </>
          ) : (
            <>
              Stage <span className="ml-1 font-medium text-neutral-900">{flow[idx]?.label}</span>
            </>
          )}
        </p>
        {!lost && canEdit && (
          <Modal label="Mark as lost" variant="ghost" size="sm" title="Why was this lead lost?" description="Knowing why helps spot patterns in lost deals.">
            <ActionForm action={setStageAction} submitLabel="Mark as lost" submitVariant="danger">
              <input type="hidden" name="id" value={clientId} />
              <input type="hidden" name="stage" value="lost" />
              <Field label="Reason" required group>
                <ChipInput name="lostReason" options={LOST_REASONS} required />
              </Field>
            </ActionForm>
          </Modal>
        )}
      </div>
      <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${flow.length}, minmax(0, 1fr))` }}>
        {flow.map((s, i) => {
          const reached = !lost && i <= idx;
          const current = !lost && i === idx;
          const segment = (
            <span className="block w-full text-left">
              <span className={cn("block h-1 rounded-full transition-colors", reached ? "bg-neutral-900" : "bg-neutral-200 group-hover:bg-neutral-400")} />
              <span
                className={cn(
                  "mt-2 hidden truncate text-xs sm:block",
                  current ? "font-medium text-neutral-900" : reached ? "text-neutral-600" : "text-neutral-400 group-hover:text-neutral-700",
                )}
              >
                {s.label}
              </span>
            </span>
          );
          return (
            <li key={s.key} className="min-w-0" title={canEdit && !current ? `Move to ${s.label}` : s.label}>
              {canEdit && !current ? (
                <ActionButton
                  action={setStageAction}
                  fields={{ id: clientId, stage: s.key }}
                  variant="ghost"
                  size="sm"
                  full
                  className="group h-auto w-full justify-start rounded-none bg-transparent px-0 py-0 font-normal hover:bg-transparent"
                >
                  {segment}
                </ActionButton>
              ) : (
                segment
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
