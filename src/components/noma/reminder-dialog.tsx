import { Bell, Calendar as CalendarIcon, Clock, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDatabase } from "@/lib/noma/DatabaseContext";
import {
  checkNotificationCapability,
  rehydrateReminders,
  requestNotificationPermission,
  type NotificationCapability,
} from "@/lib/noma/notifications";
import type { Reminder } from "@/lib/noma/types";

interface ReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteTitle: string;
  existingReminder?: Reminder | null | undefined;
  onSave: (scheduledAt: number) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function ReminderDialog({
  open,
  onOpenChange,
  noteTitle,
  existingReminder,
  onSave,
  onDelete,
}: ReminderDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [timeString, setTimeString] = useState<string>("09:00");
  const { db } = useDatabase();
  const [saving, setSaving] = useState(false);
  const [capability, setCapability] = useState<NotificationCapability | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValidationError(null);
      void checkNotificationCapability().then(setCapability);
      if (existingReminder) {
        const d = new Date(existingReminder.scheduledAt);
        setSelectedDate(d);
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        setTimeString(`${hours}:${minutes}`);
      } else {
        // Default to today 1 hr from now
        const next = new Date();
        next.setHours(next.getHours() + 1, 0, 0, 0);
        setSelectedDate(next);
        const hours = String(next.getHours()).padStart(2, "0");
        const minutes = String(next.getMinutes()).padStart(2, "0");
        setTimeString(`${hours}:${minutes}`);
      }
    }
  }, [open, existingReminder]);

  // Compute scheduled timestamp in local timezone whenever date or time changes
  const getScheduledTimestamp = (d: Date | undefined, tStr: string): number | null => {
    if (!d) return null;
    const [h, m] = tStr.split(":").map(Number);
    const scheduled = new Date(d);
    scheduled.setHours(h || 0, m || 0, 0, 0);
    return scheduled.getTime();
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date) {
      const ts = getScheduledTimestamp(date, timeString);
      if (ts && ts <= Date.now()) {
        setValidationError("Please choose a future date and time.");
      } else {
        setValidationError(null);
      }
    } else {
      setValidationError(null);
    }
  };

  const handleTimeChange = (newTime: string) => {
    setTimeString(newTime);
    if (selectedDate) {
      const ts = getScheduledTimestamp(selectedDate, newTime);
      if (ts && ts <= Date.now()) {
        setValidationError("Please choose a future date and time.");
      } else {
        setValidationError(null);
      }
    }
  };

  const handleSave = async () => {
    if (!selectedDate) return;

    const ts = getScheduledTimestamp(selectedDate, timeString);
    if (!ts || ts <= Date.now()) {
      setValidationError("Please choose a future date and time.");
      return;
    }

    setSaving(true);
    try {
      if (capability && !capability.permissionGranted && capability.permissionState === "prompt") {
        const granted = await requestNotificationPermission();
        if (granted && db) {
          void rehydrateReminders(db);
        }
      }
      await onSave(ts);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-lg">
            <Bell className="size-5 text-primary" />
            {existingReminder ? "Edit Reminder" : "Set Reminder"}
          </DialogTitle>
          <DialogDescription className="truncate">
            For note: <span className="font-medium text-foreground">“{noteTitle}”</span>
          </DialogDescription>
        </DialogHeader>

        {capability && !capability.permissionGranted && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
            <p className="font-medium">Notification Permission Notice</p>
            <p className="mt-0.5 text-muted-foreground">
              {capability.permissionState === "denied"
                ? "Notifications are currently blocked by browser or system settings. The reminder will be saved in Noma, but push alerts will not fire."
                : capability.reason ||
                  "Noma will request notification permission when saving to deliver timely alerts."}
            </p>
          </div>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarIcon className="size-3.5" /> Select Date
            </Label>
            <div className="flex justify-center rounded-md border p-2">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                className="rounded-md border-0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="reminder-time"
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <Clock className="size-3.5" /> Select Time (Local Timezone)
            </Label>
            <Input
              id="reminder-time"
              type="time"
              value={timeString}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="h-10"
            />
          </div>

          {validationError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs font-medium text-destructive">
              {validationError}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          {existingReminder && onDelete ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={saving}
              className="gap-1.5"
            >
              <Trash2 className="size-4" /> Delete Reminder
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={!selectedDate || saving}>
              {saving ? "Saving…" : "Save Reminder"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
