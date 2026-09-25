import Link from "next/link";
import { Check, Clock, Plus } from "lucide-react";
import { completeTaskAction, createTaskAction } from "@/app/actions/tasks";
import { addDays, dueLabel, today } from "@/lib/format";
import { ActionForm, Modal } from "./forms";
import { ChipInput, DateQuick } from "./inputs";
import { Avatar, Badge, Field, Input, Select, Textarea, cn } from "./ui";

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
    <li className="flex items-start gap-3 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium text-slate-900", task.status === "done" && "text-slate-500 line-through")}>
          {refHref ? (
            <Link href={refHref} className="hover:underline">
              {task.title}
            </Link>
          ) : (
            task.title
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-red-600")}>
            <Clock className="size-3.5" />
            {overdue ? "Overdue · " : ""}
            {dueLabel(task.dueAt)}
          </span>
          {task.clientName && task.clientId && (
            <Link href={`/clients/${task.clientId}`} className="text-brand-700 hover:underline">
              {task.clientName}
            </Link>
          )}
          {task.priority === "high" && task.status === "open" && <Badge tone="red">High priority</Badge>}
          {showAssignee && task.assigneeName && (
            <span className="inline-flex items-center gap-1">
              <Avatar name={task.assigneeName} size="sm" /> {task.assigneeName}
            </span>
          )}
          {task.status === "done" && task.outcome && <span>Outcome: {task.outcome}</span>}
        </div>
      </div>
      {task.status === "open" && <CompleteTask task={task} />}
    </li>
  );
}

export function CompleteTask({ task }: { task: TaskView }) {
  return (
    <Modal label="Done" icon={<Check />} size="sm" title="Mark as done" description={task.title}>
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
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-sm font-medium text-slate-700">Next follow-up (optional)</p>
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
}: {
  clientId?: number;
  clientName?: string;
  users?: { id: number; name: string }[];
  clients?: { id: number; name: string }[];
  variant?: "primary" | "secondary";
  label?: string;
}) {
  return (
    <Modal label={label} icon={<Plus />} variant={variant} title="Set a reminder" description={clientName ? `For ${clientName}` : undefined}>
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
