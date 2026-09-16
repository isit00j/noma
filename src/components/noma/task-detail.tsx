import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import {
  AlarmClock,
  Bell,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Link2,
  Plus,
  Repeat,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDatabase } from "@/lib/noma/DatabaseContext";
import { noteTitle } from "@/lib/noma/notes";
import {
  checkNotificationCapability,
  requestNotificationPermission,
  type NotificationCapability,
} from "@/lib/noma/notifications";
import {
  buildPhoneAlarmSetOptions,
  isPhoneAlarmSupported,
  NomaAlarm,
  phoneAlarmErrorCode,
  resolveAlertType,
  type PhoneAlarmSaveOptions,
} from "@/lib/noma/phone-alarm";
import { deleteTaskReminder, setTaskReminder } from "@/lib/noma/task-reminders";
import {
  completeTask,
  createSubtask,
  deleteTaskForever,
  moveTask,
  normalizeLabel,
  updateTask,
} from "@/lib/noma/tasks";
import {
  INBOX_LIST_ID,
  type Note,
  type RecurrenceFreq,
  type ReminderAlertType,
  type Task,
  type TaskList,
  type TaskPriority,
} from "@/lib/noma/types";
import { cn } from "@/lib/utils";
import { formatTaskDue, isTaskOverdue } from "./task-format";
import { TaskDuePicker } from "./task-due-picker";

const DAY_MS = 86_400_000;

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string; dot: string | null }> = [
  { value: "none", label: "None", dot: null },
  { value: "low", label: "Low", dot: "bg-sky-500/80" },
  { value: "medium", label: "Medium", dot: "bg-amber-500/80" },
  { value: "high", label: "High", dot: "bg-red-500/80" },
];

const RECURRENCE_OPTIONS: Array<{ value: RecurrenceFreq | "none"; label: string }> = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function atTime(date: Date, time: string | null): number {
  const d = new Date(date);
  if (time) {
    const parts = time.split(":").map(Number);
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.getTime();
}

function Section({
  title,
  badge,
  defaultOpen,
  children,
}: {
  title: string;
  badge?: string | undefined;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen ?? false} className="rounded-lg border border-border/60">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground"
        >
          <span className="flex-1">{title}</span>
          {badge && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {badge}
            </span>
          )}
          <ChevronDown className="size-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

interface TaskDetailProps {
  taskId: string | null;
  lists: TaskList[];
  onClose: () => void;
  onOpenNote?: ((note: Note) => void) | undefined;
}

export function TaskDetail({ taskId, lists, onClose, onOpenNote }: TaskDetailProps) {
  const { db } = useDatabase();
  const open = taskId != null;
  const task = useLiveQuery(
    async () => (db && taskId ? ((await db.tasks.get(taskId)) ?? null) : null),
    [db, taskId],
  );
  const existingReminder = useLiveQuery(
    async () =>
      db && taskId ? ((await db.reminders.where("taskId").equals(taskId).first()) ?? null) : null,
    [db, taskId],
  );
  const subtasks = useLiveQuery(
    async () =>
      db && taskId
        ? db.tasks
            .where("parentTaskId")
            .equals(taskId)
            .filter((t) => !t.deleted)
            .toArray()
        : [],
    [db, taskId],
  );
  const linkedNote = useLiveQuery(
    async () => (db && task?.noteId ? ((await db.notes.get(task.noteId)) ?? null) : null),
    [db, task?.noteId],
  );

  const phoneAlarmSupported = isPhoneAlarmSupported();

  // ---- Draft text state (debounced save) ----
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Initialise from the live task row only once it has loaded; the guard stops
  // later live updates (e.g. our own debounced saves) clobbering what the
  // user is typing.
  const titleInitialisedFor = useRef<string | null>(null);
  useEffect(() => {
    if (taskId == null) {
      titleInitialisedFor.current = null;
      return;
    }
    if (task === undefined) return; // still loading
    if (titleInitialisedFor.current === taskId) return;
    titleInitialisedFor.current = taskId;
    setTitle(task?.title ?? "");
    setDetails(task?.details ?? "");
    setDetailsOpen(Boolean(task?.details));
  }, [taskId, task]);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );
  const queueSave = (patch: Partial<Task>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (db && taskId) void updateTask(db, taskId, patch).catch(() => {});
    }, 500);
  };

  // ---- Due date state ----
  const [duePickerOpen, setDuePickerOpen] = useState(false);

  // ---- Reminder form state ----
  const [reminderFormOpen, setReminderFormOpen] = useState(false);
  const [reminderDate, setReminderDate] = useState<Date | undefined>(undefined);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [reminderAlertType, setReminderAlertType] = useState<ReminderAlertType>("notification");
  const [reminderSaving, setReminderSaving] = useState(false);
  const [capability, setCapability] = useState<NotificationCapability | null>(null);
  const reminderInitialisedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      reminderInitialisedFor.current = null;
      return;
    }
    // Wait for the live reminder row before initialising, otherwise the form
    // would be seeded with defaults and never pick up the saved reminder.
    if (taskId == null || existingReminder === undefined) return;
    if (reminderInitialisedFor.current === taskId) return;
    reminderInitialisedFor.current = taskId;
    void checkNotificationCapability()
      .then(setCapability)
      .catch(() => {});
    if (existingReminder) {
      setReminderDate(new Date(existingReminder.scheduledAt));
      const d = new Date(existingReminder.scheduledAt);
      setReminderTime(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      );
      setReminderAlertType(resolveAlertType(existingReminder));
      setReminderFormOpen(false);
    } else {
      const next = new Date();
      next.setHours(next.getHours() + 1, 0, 0, 0);
      setReminderDate(next);
      setReminderTime(
        `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`,
      );
      setReminderAlertType("notification");
      setReminderFormOpen(false);
    }
  }, [open, taskId, existingReminder]);

  // ---- Labels / subtasks / note linking ----
  const [labelDraft, setLabelDraft] = useState("");
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [noteQuery, setNoteQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const noteMatches = useLiveQuery(async () => {
    if (!db || !noteQuery.trim()) return [];
    const q = noteQuery.trim().toLowerCase();
    return db.notes
      .filter((n) => !n.deleted && !n.archived && noteTitle(n).toLowerCase().includes(q))
      .limit(8)
      .toArray();
  }, [db, noteQuery]);

  const listName = useMemo(() => {
    if (!task) return "";
    if (task.listId === INBOX_LIST_ID) return "Inbox";
    return lists.find((l) => l.id === task.listId)?.name ?? "Inbox";
  }, [task, lists]);

  if (!open) return null;

  const saveDue = (dueAt: number | null) => {
    if (db && taskId) {
      void updateTask(db, taskId, { dueAt }).catch(() =>
        toast.error("Couldn't save the due date."),
      );
    }
  };

  const handleToggle = () => {
    if (!db || !task) return;
    void completeTask(db, task.id, !task.completed).catch(() =>
      toast.error("Couldn't update the task."),
    );
  };

  const handleSaveReminder = async () => {
    if (!db || !task || !reminderDate) return;
    const ts = atTime(reminderDate, reminderTime || "09:00");
    if (ts <= Date.now()) {
      toast.error("Choose a future date and time for the reminder.");
      return;
    }
    setReminderSaving(true);
    try {
      if (phoneAlarmSupported && reminderAlertType === "phone-alarm") {
        const options: PhoneAlarmSaveOptions = {
          alertType: "phone-alarm",
          alarmToneMode: "system",
          alarmVibrate: true,
        };
        await setTaskReminder(db, task.id, ts, options);
        setReminderFormOpen(false);
        try {
          const avail = await NomaAlarm.checkAlarmCapability();
          if (!avail.available) {
            toast.error(
              "No alarm-clock app found. The reminder was saved — open it in your Clock app manually, or switch it to a Noma notification.",
            );
            return;
          }
          await NomaAlarm.setAlarm(
            buildPhoneAlarmSetOptions(ts, task.title || "Untitled task", options),
          );
          toast.success("Reminder saved — confirm the alarm in your Clock app.");
        } catch (e) {
          if (phoneAlarmErrorCode(e) === "NO_ALARM_APP") {
            toast.error(
              "No alarm-clock app found. The reminder was saved — switch it to a Noma notification if needed.",
            );
          } else {
            toast.error("Reminder saved, but your Clock app couldn't be opened.");
          }
        }
      } else {
        // Same permission flow as the note reminder dialog: ask before saving
        // so the scheduled notification is actually allowed to fire.
        if (
          capability &&
          !capability.permissionGranted &&
          capability.permissionState === "prompt"
        ) {
          const granted = await requestNotificationPermission();
          if (granted) {
            setCapability(await checkNotificationCapability().catch(() => capability));
          }
        }
        await setTaskReminder(db, task.id, ts, { alertType: "notification" });
        setReminderFormOpen(false);
        toast.success("Reminder saved as a Noma notification.");
      }
    } catch {
      toast.error("Couldn't save the reminder.");
    } finally {
      setReminderSaving(false);
    }
  };

  const handleDeleteReminder = async () => {
    if (!db || !task) return;
    await deleteTaskReminder(db, task.id);
    toast.success("Reminder removed.");
  };

  const handleAddLabel = () => {
    const label = normalizeLabel(labelDraft);
    if (!db || !task || !label) return;
    if (task.labelIds.includes(label)) {
      setLabelDraft("");
      return;
    }
    setLabelDraft("");
    void updateTask(db, task.id, { labelIds: [...task.labelIds, label] }).catch(() =>
      toast.error("Couldn't add the label."),
    );
  };

  const handleAddSubtask = async () => {
    const value = subtaskDraft.trim();
    if (!db || !task || !value) return;
    setSubtaskDraft("");
    try {
      await createSubtask(db, task.id, value);
    } catch {
      toast.error("Couldn't add the subtask.");
    }
  };

  const handleDeleteTask = async () => {
    if (!db || !task) return;
    setConfirmDelete(false);
    await deleteTaskForever(db, task.id);
    toast.success("Task deleted.");
    onClose();
  };

  const priority =
    PRIORITY_OPTIONS.find((p) => p.value === task?.priority) ??
    ({ value: "none", label: "None", dot: null } as const);
  const recurrenceLabel =
    RECURRENCE_OPTIONS.find((r) => r.value === (task?.recurrence?.freq ?? "none"))?.label ??
    "Does not repeat";
  const subtaskDone = (subtasks ?? []).filter((s) => s.completed).length;
  const showPermissionNotice =
    capability && !capability.permissionGranted && reminderAlertType === "notification";

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">Task details</DialogTitle>
          </DialogHeader>

          <div className="-mt-2 flex items-start gap-1">
            <button
              type="button"
              role="checkbox"
              aria-checked={task?.completed ?? false}
              aria-label={task?.completed ? "Mark as not done" : "Mark as done"}
              onClick={handleToggle}
              className="flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border transition-colors",
                  task?.completed
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/40 hover:border-muted-foreground",
                )}
              >
                {task?.completed && (
                  <Check className="size-4 text-primary-foreground" aria-hidden="true" />
                )}
              </span>
            </button>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                queueSave({ title: e.target.value });
              }}
              placeholder="Task title"
              aria-label="Task title"
              className="h-11 border-0 bg-transparent px-1 font-serif text-lg font-medium shadow-none focus-visible:ring-0"
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={onClose}
              aria-label="Close task details"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="space-y-3">
            {detailsOpen || task?.details ? (
              <Textarea
                value={details}
                onChange={(e) => {
                  setDetails(e.target.value);
                  queueSave({ details: e.target.value });
                }}
                placeholder="Add details…"
                aria-label="Task details"
                rows={3}
                className="resize-none bg-muted/40"
              />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground"
                onClick={() => setDetailsOpen(true)}
              >
                <Plus className="size-3.5" /> Add details
              </Button>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Popover open={duePickerOpen} onOpenChange={setDuePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 gap-1.5 text-xs",
                      task?.dueAt == null && "text-muted-foreground",
                      task && isTaskOverdue(task) && "border-destructive/40 text-destructive",
                    )}
                  >
                    <CalendarIcon className="size-3.5" />
                    {task?.dueAt != null ? formatTaskDue(task.dueAt) : "Set due date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="start">
                  <TaskDuePicker
                    value={task?.dueAt ?? null}
                    onChange={(v) => {
                      saveDue(v);
                      if (v == null) setDuePickerOpen(false);
                    }}
                    idPrefix="task-detail-due"
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    {priority.dot && <span className={cn("size-1.5 rounded-full", priority.dot)} />}
                    {priority.label}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-1.5" align="start">
                  {PRIORITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        if (db && taskId)
                          void updateTask(db, taskId, { priority: option.value }).catch(() => {});
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-muted",
                        task?.priority === option.value && "bg-muted",
                      )}
                    >
                      {option.dot ? (
                        <span className={cn("size-1.5 rounded-full", option.dot)} />
                      ) : (
                        <span className="size-1.5" />
                      )}
                      {option.label}
                      {task?.priority === option.value && (
                        <Check className="ml-auto size-4 text-primary" />
                      )}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground">
                {listName}
              </span>
            </div>

            <Section
              title="Reminder"
              badge={
                existingReminder ? format(existingReminder.scheduledAt, "d MMM, p") : undefined
              }
              defaultOpen={!existingReminder}
            >
              {existingReminder && !reminderFormOpen ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm">
                    {resolveAlertType(existingReminder) === "phone-alarm" ? (
                      <AlarmClock className="size-4 text-muted-foreground" />
                    ) : (
                      <Bell className="size-4 text-muted-foreground" />
                    )}
                    {format(existingReminder.scheduledAt, "PPP 'at' p")}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {resolveAlertType(existingReminder) === "phone-alarm"
                        ? "Phone alarm"
                        : "Notification"}
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setReminderFormOpen(true)}
                    >
                      Change
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => void handleDeleteReminder()}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {showPermissionNotice && (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
                      Notifications are not enabled — the reminder will be saved, but alerts
                      won&apos;t fire until you allow them.
                    </p>
                  )}
                  <div className="flex gap-1.5">
                    {(["today", "tomorrow", "week"] as const).map((preset) => (
                      <Button
                        key={preset}
                        variant={
                          reminderDate &&
                          Math.abs(reminderDate.getTime() - presetDate(preset).getTime()) < DAY_MS
                            ? "secondary"
                            : "ghost"
                        }
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setReminderDate(presetDate(preset))}
                      >
                        {preset === "today"
                          ? "Today"
                          : preset === "tomorrow"
                            ? "Tomorrow"
                            : "Next week"}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar
                      mode="single"
                      selected={reminderDate}
                      onSelect={setReminderDate}
                      className="rounded-md border"
                    />
                    <div className="space-y-2">
                      <Label htmlFor="task-reminder-time" className="text-xs text-muted-foreground">
                        Time
                      </Label>
                      <Input
                        id="task-reminder-time"
                        type="time"
                        value={reminderTime}
                        onChange={(e) => setReminderTime(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>
                  {phoneAlarmSupported && (
                    <RadioGroup
                      value={reminderAlertType}
                      onValueChange={(v) => setReminderAlertType(v as ReminderAlertType)}
                      className="grid grid-cols-2 gap-2"
                    >
                      <Label
                        htmlFor="task-alert-notification"
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm",
                          reminderAlertType === "notification" && "border-primary bg-primary/5",
                        )}
                      >
                        <RadioGroupItem value="notification" id="task-alert-notification" />
                        <Bell className="size-4 text-muted-foreground" />
                        Notification
                      </Label>
                      <Label
                        htmlFor="task-alert-phone-alarm"
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm",
                          reminderAlertType === "phone-alarm" && "border-primary bg-primary/5",
                        )}
                      >
                        <RadioGroupItem value="phone-alarm" id="task-alert-phone-alarm" />
                        <AlarmClock className="size-4 text-muted-foreground" />
                        Phone alarm
                      </Label>
                    </RadioGroup>
                  )}
                  {phoneAlarmSupported && reminderAlertType === "phone-alarm" && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Your Clock app will open so you can confirm the alarm. Noma can&apos;t change
                      or cancel alarms once they&apos;re in your Clock app.
                    </p>
                  )}
                  {task?.recurrence &&
                    phoneAlarmSupported &&
                    reminderAlertType === "phone-alarm" && (
                      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
                        This task repeats — when it does, set the next alarm in your Clock app
                        yourself. Noma can&apos;t recreate phone alarms automatically.
                      </p>
                    )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={reminderSaving || !reminderDate}
                      onClick={() => void handleSaveReminder()}
                    >
                      {reminderSaving
                        ? "Saving…"
                        : existingReminder
                          ? "Update reminder"
                          : "Set reminder"}
                    </Button>
                    {existingReminder && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setReminderFormOpen(false)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Section>

            <Section
              title="Subtasks"
              badge={
                subtasks && subtasks.length > 0 ? `${subtaskDone}/${subtasks.length}` : undefined
              }
              defaultOpen={(subtasks?.length ?? 0) > 0}
            >
              <div className="space-y-1">
                {(subtasks ?? []).map((sub) => (
                  <div key={sub.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={sub.completed}
                      aria-label={`Mark subtask "${sub.title || "Untitled"}" as ${sub.completed ? "not done" : "done"}`}
                      onClick={() => {
                        if (db) void completeTask(db, sub.id, !sub.completed).catch(() => {});
                      }}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          "flex size-4.5 items-center justify-center rounded-full border transition-colors",
                          sub.completed
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {sub.completed && (
                          <Check className="size-3 text-primary-foreground" aria-hidden="true" />
                        )}
                      </span>
                    </button>
                    <span
                      className={cn(
                        "flex-1 truncate text-sm",
                        sub.completed && "text-muted-foreground line-through",
                      )}
                    >
                      {sub.title || "Untitled"}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-1 pt-1">
                  <Input
                    value={subtaskDraft}
                    onChange={(e) => setSubtaskDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddSubtask();
                      }
                    }}
                    placeholder="Add a subtask…"
                    aria-label="New subtask title"
                    className="h-9 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    onClick={() => void handleAddSubtask()}
                    aria-label="Add subtask"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            </Section>

            <Section
              title="Labels"
              badge={task && task.labelIds.length > 0 ? String(task.labelIds.length) : undefined}
              defaultOpen={(task?.labelIds.length ?? 0) > 0}
            >
              <div className="flex flex-wrap gap-1.5">
                {(task?.labelIds ?? []).map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                  >
                    {label}
                    <button
                      type="button"
                      aria-label={`Remove label ${label}`}
                      onClick={() => {
                        if (db && taskId && task)
                          void updateTask(db, taskId, {
                            labelIds: task.labelIds.filter((l) => l !== label),
                          }).catch(() => {});
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1">
                <Input
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddLabel();
                    }
                  }}
                  placeholder="Add a label…"
                  aria-label="New label"
                  className="h-9 text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  onClick={handleAddLabel}
                  aria-label="Add label"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </Section>

            <Section title="More options" defaultOpen={false}>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm text-muted-foreground">List</Label>
                  <Select
                    value={task?.listId ?? INBOX_LIST_ID}
                    onValueChange={(v) => {
                      if (db && taskId)
                        void moveTask(db, taskId, v).catch(() =>
                          toast.error("Couldn't move the task."),
                        );
                    }}
                  >
                    <SelectTrigger className="h-9 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={INBOX_LIST_ID}>Inbox</SelectItem>
                      {lists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Repeat className="size-3.5" /> Repeat
                  </Label>
                  <Select
                    value={task?.recurrence?.freq ?? "none"}
                    onValueChange={(v) => {
                      if (!db || !taskId) return;
                      const freq = v as RecurrenceFreq | "none";
                      void updateTask(db, taskId, {
                        recurrence: freq === "none" ? null : { freq },
                      }).catch(() => toast.error("Couldn't save recurrence."));
                    }}
                  >
                    <SelectTrigger className="h-9 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Link2 className="size-3.5" /> Linked note
                  </Label>
                  {linkedNote ? (
                    <span className="flex min-w-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenNote?.(linkedNote);
                        }}
                        className="max-w-40 truncate text-sm text-primary hover:underline"
                      >
                        {noteTitle(linkedNote) || "Untitled note"}
                      </button>
                      <button
                        type="button"
                        aria-label="Unlink note"
                        onClick={() => {
                          if (db && taskId)
                            void updateTask(db, taskId, { noteId: null }).catch(() => {});
                        }}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        <Unlink className="size-3.5" />
                      </button>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </div>
                {!linkedNote && (
                  <div className="space-y-1.5">
                    <Input
                      value={noteQuery}
                      onChange={(e) => setNoteQuery(e.target.value)}
                      placeholder="Search notes to link…"
                      aria-label="Search notes to link"
                      className="h-9 text-sm"
                    />
                    {(noteMatches ?? []).length > 0 && (
                      <div className="divide-y divide-border/60 rounded-md border">
                        {noteMatches!.map((note) => (
                          <button
                            key={note.id}
                            type="button"
                            onClick={() => {
                              if (db && taskId) {
                                void updateTask(db, taskId, { noteId: note.id }).catch(() => {});
                                setNoteQuery("");
                                toast.success("Note linked.");
                              }
                            }}
                            className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-muted/60"
                          >
                            {noteTitle(note) || "Untitled note"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <Label className="text-sm text-muted-foreground">Delete task</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              </div>
            </Section>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              “{task?.title || "Untitled task"}” and its subtasks will be permanently deleted. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteTask()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function presetDate(preset: "today" | "tomorrow" | "week"): Date {
  const d = new Date();
  if (preset === "tomorrow") d.setDate(d.getDate() + 1);
  if (preset === "week") d.setDate(d.getDate() + 7);
  return d;
}
