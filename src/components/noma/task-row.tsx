import { AlarmClock, Bell, Check, Link2, Repeat } from "lucide-react";
import type { ReminderAlertType, Task, TaskPriority } from "@/lib/noma/types";
import { cn } from "@/lib/utils";
import { formatTaskDue, isTaskOverdue } from "./task-format";

const PRIORITY_DOT: Record<TaskPriority, string | null> = {
  high: "bg-red-500/80",
  medium: "bg-amber-500/80",
  low: "bg-sky-500/80",
  none: null,
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority",
  none: "No priority",
};

interface TaskRowProps {
  task: Task;
  /** Shown subtly when the row appears in a cross-list view. */
  listName?: string | undefined;
  subtaskProgress?: { done: number; total: number } | undefined;
  /** Alert type of the task's reminder, when one is set. */
  reminderAlertType?: ReminderAlertType | null | undefined;
  onOpen: (task: Task) => void;
  onToggle: (task: Task, completed: boolean) => void;
}

export function TaskRow({
  task,
  listName,
  subtaskProgress,
  reminderAlertType,
  onOpen,
  onToggle,
}: TaskRowProps) {
  const completed = task.completed;
  const overdue = isTaskOverdue(task);
  const priorityDot = PRIORITY_DOT[task.priority];
  const hasSubtasks = subtaskProgress != null && subtaskProgress.total > 0;

  const meta: React.ReactNode[] = [];
  if (task.dueAt != null) {
    meta.push(
      <span
        key="due"
        className={cn(
          "inline-flex items-center gap-1",
          overdue ? "font-medium text-destructive" : "text-muted-foreground",
        )}
      >
        {formatTaskDue(task.dueAt)}
      </span>,
    );
  }
  if (task.reminderAt != null) {
    meta.push(
      <span key="reminder" className="inline-flex items-center gap-1 text-muted-foreground">
        {reminderAlertType === "phone-alarm" ? (
          <AlarmClock className="size-3" aria-label="Phone alarm reminder" />
        ) : (
          <Bell className="size-3" aria-label="Reminder set" />
        )}
      </span>,
    );
  }
  if (task.recurrence) {
    meta.push(
      <span key="recurrence" className="inline-flex items-center gap-1 text-muted-foreground">
        <Repeat className="size-3" aria-label={`Repeats ${task.recurrence.freq}`} />
      </span>,
    );
  }
  if (hasSubtasks) {
    meta.push(
      <span key="subtasks" className="tabular-nums text-muted-foreground">
        {subtaskProgress.done}/{subtaskProgress.total}
      </span>,
    );
  }
  if (task.noteId) {
    meta.push(
      <span key="note" className="inline-flex items-center gap-1 text-muted-foreground">
        <Link2 className="size-3" aria-label="Linked note" />
      </span>,
    );
  }
  if (listName) {
    meta.push(
      <span key="list" className="truncate text-muted-foreground">
        {listName}
      </span>,
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(task);
        }
      }}
      className={cn(
        "group flex cursor-pointer items-start gap-1 rounded-lg px-1 transition-colors",
        "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        completed && "opacity-55",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={completed}
        aria-label={
          completed
            ? `Mark "${task.title || "Untitled task"}" as not done`
            : `Mark "${task.title || "Untitled task"}" as done`
        }
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task, !completed);
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full border transition-colors",
            completed
              ? "border-primary bg-primary"
              : "border-muted-foreground/40 group-hover:border-muted-foreground",
          )}
        >
          {completed && <Check className="size-3.5 text-primary-foreground" aria-hidden="true" />}
        </span>
      </button>

      <div className="min-w-0 flex-1 py-2.5 pr-2">
        <p
          className={cn(
            "truncate text-[15px] leading-snug",
            completed ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {task.title || "Untitled task"}
        </p>
        {(meta.length > 0 || task.labelIds.length > 0 || priorityDot) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
            {priorityDot && (
              <span
                className={cn("size-1.5 rounded-full", priorityDot)}
                role="img"
                aria-label={PRIORITY_LABEL[task.priority]}
              />
            )}
            {meta.map((m, i) => (
              <span key={i} className="inline-flex items-center">
                {m}
              </span>
            ))}
            {task.labelIds.slice(0, 3).map((label) => (
              <span
                key={label}
                className="rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground"
              >
                {label}
              </span>
            ))}
            {task.labelIds.length > 3 && (
              <span className="text-[11px] text-muted-foreground">+{task.labelIds.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
