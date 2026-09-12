import { format } from "date-fns";
import { Bell, CheckCircle2, Clock, Trash2, AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDatabase } from "@/lib/noma/DatabaseContext";
import { noteTitle, updateReminderStatus, deleteNoteReminder } from "@/lib/noma/notes";
import type { Note, Reminder } from "@/lib/noma/types";

interface RemindersViewProps {
  reminders: Reminder[];
  notes: Note[];
  onOpenNote: (note: Note) => void;
}

export function RemindersView({ reminders, notes, onOpenNote }: RemindersViewProps) {
  const { db } = useDatabase();
  const now = Date.now();

  const noteMap = useMemo(() => {
    const map = new Map<string, Note>();
    for (const note of notes) map.set(note.id, note);
    return map;
  }, [notes]);

  const { upcoming, overdue, completed } = useMemo(() => {
    const sorted = [...reminders].sort((a, b) => a.scheduledAt - b.scheduledAt);
    const up: Reminder[] = [];
    const over: Reminder[] = [];
    const comp: Reminder[] = [];

    for (const r of sorted) {
      if (r.status === "completed" || r.status === "dismissed") {
        comp.push(r);
      } else if (r.scheduledAt < now) {
        over.push(r);
      } else {
        up.push(r);
      }
    }

    return { upcoming: up, overdue: over, completed: comp };
  }, [reminders, now]);

  const handleStatusChange = async (
    reminder: Reminder,
    newStatus: "completed" | "dismissed" | "pending",
  ) => {
    if (!db) return;
    await updateReminderStatus(db, reminder.id, newStatus);
    toast.success(newStatus === "completed" ? "Reminder marked as completed" : "Reminder updated");
  };

  const handleDelete = async (reminder: Reminder) => {
    if (!db) return;
    await deleteNoteReminder(db, reminder.noteId);
    toast.success("Reminder deleted");
  };

  const renderSection = (
    title: string,
    list: Reminder[],
    icon: typeof Bell,
    badgeColor: string,
    isOverdue = false,
  ) => {
    if (list.length === 0) return null;

    const Icon = icon;

    return (
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="size-4" />
          {title} ({list.length})
        </h2>
        <div className="divide-y divide-border/60 rounded-lg border bg-card">
          {list.map((reminder) => {
            const note = noteMap.get(reminder.noteId);
            const dateStr = format(reminder.scheduledAt, "PPP 'at' p");

            return (
              <div
                key={reminder.id}
                className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
              >
                <div
                  className="flex flex-1 cursor-pointer flex-col space-y-1"
                  onClick={() => {
                    if (note) onOpenNote(note);
                    else toast.error("Associated note not found.");
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-base font-medium text-foreground hover:underline">
                      {note ? noteTitle(note) : "Untitled Note"}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeColor}`}
                    >
                      {isOverdue ? "Overdue" : reminder.status}
                    </span>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" />
                    {dateStr}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  {reminder.status === "pending" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => handleStatusChange(reminder, "completed")}
                    >
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                      Complete
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => handleStatusChange(reminder, "pending")}
                    >
                      Reopen
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(reminder)}
                    aria-label="Delete reminder"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (reminders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Bell className="size-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 font-serif text-lg font-medium text-foreground">No reminders set</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Create custom reminders on your notes to keep track of tasks, deadlines, and important
          thoughts.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-6">
      {renderSection("Overdue", overdue, AlertCircle, "bg-destructive/10 text-destructive", true)}
      {renderSection("Upcoming", upcoming, Clock, "bg-primary/10 text-primary")}
      {renderSection(
        "Completed / Dismissed",
        completed,
        CheckCircle2,
        "bg-muted text-muted-foreground",
      )}
    </div>
  );
}
