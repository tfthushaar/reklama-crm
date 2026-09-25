import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { completeTaskAction, createTaskAction } from "@/app/actions/tasks";
import { addDays, dueLabel, today } from "@/lib/format";
import { ActionForm, Modal } from "./forms";
import { ChipInput, DateQuick } from "./inputs";
import { Avatar, Field, Input, Select, Textarea, cn } from "./ui";

export type TaskView = {
  id: number;
  title: string;
  dueAt: Date;
  priority: "low" | "normal" | "high";
  status: "open" | "done";
  outcome: string | null;
  clientId: number | null;
  clientName: string | null;
  assigneeName?: string | null;
  refType: string | null;
  refId: number | null;
};

const REF_HREF: Record<string, string> = { quote: "/quotes/", booking: "/bookings/", invoice: "/invoices/", asset: "/screens/" };

function datePresets() {
  const t = today();
  return [
    { label: "Tomorrow", value: addDays(t, 1) },
    { label: "In 3 days", value: addDays(t, 3) },
    { label: "Next week", value: addDays(t, 7) },
  ];
}

export function TaskRow({ task, showAssignee }: { task: TaskView; showAssignee?: boolean }) {
  const overdue = task.status === "open" && new Date(task.dueAt).getTime() < Date.now();
  const refHref = task.refType && task.refId ? `${REF_HREF[task.refType] ?? ""}${task.refId}` : null;
  return (
    <li className="flex items-start gap-3.5 px-6 py-3.5">
      {task.status === "open" ? (
        <CompleteTask task={task} />
      ) : (
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
          <Check className="size-3 stroke-[2.5]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm text-neutral-900", task.status === "done" && "text-neutral-400 line-through")}>
          {refHref ? (
            <Link href={refHref} className="hover:underline">
              {task.title}
            </Link>
          ) : (
            task.title
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-neutral-500">
          <span className={cn(overdue && "text-red-600")}>
            {overdue ? "Overdue, " : ""}
            {dueLabel(task.dueAt)}
          </span>
          {task.clientName && task.clientId && (
            <Link href={`/clients/${task.clientId}`} className="hover:text-neutral-900 hover:underline">
              {task.clientName}
            </Link>
          )}
          {task.priority === "high" && task.status === "open" && <span className="font-medium text-neutral-900">High priority</span>}
          {showAssignee && task.assigneeName && (
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={task.assigneeName} size="sm" /> {task.assigneeName}
            </span>
          )}
          {task.status === "done" && task.outcome && <span>{task.outcome}</span>}
        </div>
      </div>
    </li>
  );
}

export function CompleteTask({ task }: { task: TaskView }) {
  return (
    <Modal
      label={<span className="sr-only">Mark as done</span>}
      icon={<Check className="opacity-0 transition-opacity group-hover/done:opacity-100" />}
      variant="ghost"
      size="sm"
      triggerClassName="group/done mt-0.5 size-5 h-5 shrink-0 rounded-full p-0 px-0 text-neutral-900 ring-[1.5px] ring-neutral-300 ring-inset hover:bg-transparent hover:ring-neutral-900 [&_svg]:size-3 [&_svg]:stroke-[2.5]"
      title="Mark as done"
      description={task.title}
    >
      <ActionForm action={completeTaskAction} submitLabel="Complete task" submitVariant="success">
        <input type="hidden" name="id" value={task.id} />
        <Field label="What happened?" required group>
          <ChipInput
            name="outcome"
            required
            placeholder="e.g. Client will confirm by Friday"
            options={["Spoke to client", "Sent details", "Client confirmed", "No answer", "Not interested"]}
          />
        </Field>
        <div className="rounded-2xl bg-neutral-50 p-4">
          <p className="mb-2 text-[13px] font-medium text-neutral-700">Next follow-up, if any</p>
          <DateQuick name="nextDate" presets={datePresets()} />
          <Input name="nextTitle" className="mt-2" placeholder="What to do next (optional)" />
        </div>
      </ActionForm>
    </Modal>
  );
}

export function NewTaskButton({
  clientId,
  clientName,
  users,
  clients,
  variant = "primary",
  label = "New reminder",
  size = "md",
}: {
  clientId?: number;
  clientName?: string;
  users?: { id: number; name: string }[];
  clients?: { id: number; name: string }[];
  variant?: "primary" | "secondary";
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <Modal label={label} icon={<Plus />} variant={variant} size={size} title="Set a reminder" description={clientName ? `For ${clientName}` : undefined}>
      <ActionForm action={createTaskAction} submitLabel="Save reminder">
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        <Field label="What needs to be done?" required>
          <Input name="title" required placeholder="e.g. Call back about MG Road rates" autoFocus />
        </Field>
        {!clientId && clients && (
          <Field label="Client (optional)">
            <Select name="clientId" defaultValue="">
              <option value="">— None —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" required>
            <Input type="date" name="dueDate" required defaultValue={addDays(today(), 1)} />
          </Field>
          <Field label="Time">
            <Input type="time" name="dueTime" defaultValue="11:00" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <Select name="priority" defaultValue="normal">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </Select>
          </Field>
          {users && (
            <Field label="Assign to">
              <Select name="assignedTo" defaultValue="">
                <option value="">Me</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label="Notes">
          <Textarea name="notes" rows={2} />
        </Field>
      </ActionForm>
    </Modal>
  );
}
