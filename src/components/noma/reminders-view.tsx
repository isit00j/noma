import { format } from "date-fns";
import { AlarmClock, Bell, CheckCircle2, Clock, Trash2, AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDatabase } from "@/lib/noma/DatabaseContext";
import { noteTitle, updateReminderStatus, deleteNoteReminder } from "@/lib/noma/notes";
import {
  buildPhoneAlarmSetOptions,
  isPhoneAlarmSupported,
  isUserCancelled,
  NomaAlarm,
  resolveToneMode,
} from "@/lib/noma/phone-alarm";
import type { Note, Reminder } from "@/lib/noma/types";

interface RemindersViewProps {
  reminders: Reminder[];
  notes: Note[];
  onOpenNote: (note: Note) => void;
}

export function RemindersView({ reminders, notes, onOpenNote }: RemindersViewProps) {
  const { db } = useDatabase();
  const now = Date.now();
  const phoneAlarmSupported = isPhoneAlarmSupported();

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
    if (reminder.alertType === "phone-alarm" && newStatus !== "pending") {
      // Noma cannot cancel the alarm already handed to the Clock app.
      toast.success("Reminder updated — dismiss or delete the alarm in your Clock app too");
    } else {
      toast.success(
        newStatus === "completed" ? "Reminder marked as completed" : "Reminder updated",
      );
    }
  };

  const handleDelete = async (reminder: Reminder) => {
    if (!db) return;
    await deleteNoteReminder(db, reminder.noteId);
    if (reminder.alertType === "phone-alarm") {
      toast.success(
        "Reminder deleted — the alarm in your Clock app stays until you remove it there",
      );
    } else {
      toast.success("Reminder deleted");
    }
  };

  /**
   * Re-open the Clock app for a phone-alarm reminder. Needed because
   * ACTION_SET_ALARM is fire-and-forget: Noma can't tell whether the user
   * completed the alarm setup in the Clock app, so this offers a manual retry.
   */
  const handleOpenInClockApp = async (reminder: Reminder) => {
    const note = noteMap.get(reminder.noteId);
    try {
      const avail = await NomaAlarm.checkAlarmCapability();
      if (!avail.available) {
        toast.error("No alarm-clock app found on this device.");
        return;
      }
      let ringtoneUri = reminder.alarmToneUri;
      if (ringtoneUri) {
        const v = await NomaAlarm.validateToneUri({ uri: ringtoneUri }).catch(() => null);
        if (!v?.accessible) {
          ringtoneUri = undefined;
          toast.warning("Saved alarm tone is no longer available — using the system default.");
        }
      }
      await NomaAlarm.setAlarm(
        buildPhoneAlarmSetOptions(reminder.scheduledAt, note ? noteTitle(note) : "Untitled note", {
          alertType: "phone-alarm",
          alarmToneMode: resolveToneMode(reminder),
          alarmToneUri: ringtoneUri,
          alarmToneName: reminder.alarmToneName,
          alarmVibrate: reminder.alarmVibrate ?? true,
        }),
      );
    } catch (e) {
      if (!isUserCancelled(e)) {
        toast.error("Couldn't open your Clock app.");
      }
    }
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
                    {reminder.alertType === "phone-alarm" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
                        <AlarmClock className="size-3" aria-hidden="true" />
                        Phone alarm
                      </span>
                    )}
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" />
                    {dateStr}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  {phoneAlarmSupported &&
                    reminder.alertType === "phone-alarm" &&
                    reminder.status === "pending" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => void handleOpenInClockApp(reminder)}
                        title="Open this alarm in your Clock app"
                      >
                        <AlarmClock className="size-3.5 text-violet-500" />
                        Clock app
                      </Button>
                    )}
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
