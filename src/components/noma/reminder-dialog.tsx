import { AlarmClock, Bell, Calendar as CalendarIcon, Clock, Music, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDatabase } from "@/lib/noma/DatabaseContext";
import {
  checkNotificationCapability,
  rehydrateReminders,
  requestNotificationPermission,
  type NotificationCapability,
} from "@/lib/noma/notifications";
import {
  buildPhoneAlarmSetOptions,
  isPhoneAlarmSupported,
  isUserCancelled,
  NomaAlarm,
  phoneAlarmErrorCode,
  resolveAlertType,
  resolveToneMode,
  type PhoneAlarmSaveOptions,
} from "@/lib/noma/phone-alarm";
import type { AlarmToneMode, Reminder, ReminderAlertType } from "@/lib/noma/types";

interface ReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteTitle: string;
  existingReminder?: Reminder | null | undefined;
  onSave: (scheduledAt: number, options?: PhoneAlarmSaveOptions) => Promise<void>;
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

  // Phone-alarm (Android-only) state
  const phoneAlarmSupported = isPhoneAlarmSupported();
  const [alertType, setAlertType] = useState<ReminderAlertType>("notification");
  const [toneMode, setToneMode] = useState<AlarmToneMode>("system");
  const [toneUri, setToneUri] = useState<string | null>(null);
  const [toneName, setToneName] = useState<string | null>(null);
  const [vibrate, setVibrate] = useState(true);
  const [alarmAvailable, setAlarmAvailable] = useState<boolean | null>(null);
  const [toneBusy, setToneBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [toneNotice, setToneNotice] = useState<string | null>(null);
  const [showAlarmFallback, setShowAlarmFallback] = useState(false);

  useEffect(() => {
    if (open) {
      setValidationError(null);
      setShowAlarmFallback(false);
      setToneNotice(null);
      setPreviewing(false);
      void checkNotificationCapability().then(setCapability);
      if (phoneAlarmSupported) {
        NomaAlarm.checkAlarmCapability()
          .then((r) => setAlarmAvailable(r.available))
          .catch(() => setAlarmAvailable(false));
      }
      if (existingReminder) {
        const d = new Date(existingReminder.scheduledAt);
        setSelectedDate(d);
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        setTimeString(`${hours}:${minutes}`);
        setAlertType(resolveAlertType(existingReminder));
        setToneMode(resolveToneMode(existingReminder));
        setToneUri(existingReminder.alarmToneUri ?? null);
        setToneName(existingReminder.alarmToneName ?? null);
        setVibrate(existingReminder.alarmVibrate ?? true);
        // A stored tone may have been deleted or revoked since it was picked.
        if (existingReminder.alarmToneUri) {
          const uri = existingReminder.alarmToneUri;
          NomaAlarm.validateToneUri({ uri })
            .then((v) => {
              if (!v.accessible) {
                setToneMode("system");
                setToneUri(null);
                setToneName(null);
                setToneNotice(
                  "The previously selected alarm tone is no longer available, so the system default will be used.",
                );
              } else if (v.name) {
                setToneName(v.name);
              }
            })
            .catch(() => {});
        }
      } else {
        // Default to today 1 hr from now
        const next = new Date();
        next.setHours(next.getHours() + 1, 0, 0, 0);
        setSelectedDate(next);
        const hours = String(next.getHours()).padStart(2, "0");
        const minutes = String(next.getMinutes()).padStart(2, "0");
        setTimeString(`${hours}:${minutes}`);
        setAlertType("notification");
        setToneMode("system");
        setToneUri(null);
        setToneName(null);
        setVibrate(true);
      }
    } else {
      // Stop any tone preview when the dialog closes.
      setPreviewing(false);
      if (phoneAlarmSupported) {
        NomaAlarm.stopPreview().catch(() => {});
      }
    }
  }, [open, existingReminder, phoneAlarmSupported]);

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

  const handleToneModeChange = async (mode: AlarmToneMode) => {
    if (mode === "system") {
      setToneMode("system");
      setToneUri(null);
      setToneName(null);
      setToneNotice(null);
      return;
    }
    const previous = toneMode;
    setToneBusy(true);
    try {
      const picked =
        mode === "system-picker"
          ? await NomaAlarm.pickSystemRingtone(toneUri ? { existingUri: toneUri } : undefined)
          : await NomaAlarm.pickAudioFile();
      if (!picked.uri) {
        setToneMode("system");
        setToneUri(null);
        setToneName(null);
      } else {
        setToneMode(mode);
        setToneUri(picked.uri);
        setToneName(picked.name ?? "Custom tone");
        setToneNotice(null);
      }
    } catch (e) {
      if (!isUserCancelled(e)) {
        toast.error("Could not open the picker. Please try again.");
      }
      setToneMode(previous);
    } finally {
      setToneBusy(false);
    }
  };

  const handlePreview = async () => {
    if (!toneUri) return;
    if (previewing) {
      await NomaAlarm.stopPreview().catch(() => {});
      setPreviewing(false);
      return;
    }
    try {
      await NomaAlarm.previewTone({ uri: toneUri });
      setPreviewing(true);
    } catch {
      toast.error("Couldn't preview this tone.");
    }
  };

  const saveAsNotification = async (ts: number) => {
    if (capability && !capability.permissionGranted && capability.permissionState === "prompt") {
      const granted = await requestNotificationPermission();
      if (granted && db) {
        void rehydrateReminders(db);
      }
    }
    await onSave(ts);
    onOpenChange(false);
  };

  const saveAsPhoneAlarm = async (ts: number) => {
    if (alarmAvailable === false) {
      setShowAlarmFallback(true);
      return;
    }

    // Re-validate the tone right before handing off; storage can change.
    let finalMode = toneMode;
    let finalUri: string | undefined = toneUri ?? undefined;
    let finalName: string | undefined = toneName ?? undefined;
    if (toneMode !== "system" && toneUri) {
      try {
        const v = await NomaAlarm.validateToneUri({ uri: toneUri });
        if (!v.accessible) {
          finalMode = "system";
          finalUri = undefined;
          finalName = undefined;
          toast.warning("Selected alarm tone is no longer available — using the system default.");
        } else if (v.name) {
          finalName = v.name;
        }
      } catch {
        // Proceed with the stored values; the native side re-checks anyway.
      }
    }

    const options: PhoneAlarmSaveOptions = {
      alertType: "phone-alarm",
      alarmToneMode: finalMode,
      alarmToneUri: finalUri,
      alarmToneName: finalName,
      alarmVibrate: vibrate,
    };
    await onSave(ts, options);
    onOpenChange(false);

    // Hand the alarm to the device Clock app. The user confirms it there;
    // Noma cannot know whether they completed or cancelled that step.
    try {
      const avail = await NomaAlarm.checkAlarmCapability();
      if (!avail.available) {
        toast.error(
          "No alarm-clock app found. The reminder was saved — open it in your Clock app manually, or switch it to a Noma notification.",
        );
        return;
      }
      await NomaAlarm.setAlarm(buildPhoneAlarmSetOptions(ts, noteTitle, options));
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
      if (phoneAlarmSupported && alertType === "phone-alarm") {
        await saveAsPhoneAlarm(ts);
      } else {
        await saveAsNotification(ts);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFallbackToNotification = async () => {
    if (!selectedDate) return;
    const ts = getScheduledTimestamp(selectedDate, timeString);
    if (!ts || ts <= Date.now()) {
      setValidationError("Please choose a future date and time.");
      return;
    }
    setShowAlarmFallback(false);
    setAlertType("notification");
    setSaving(true);
    try {
      await saveAsNotification(ts);
      toast.success("Reminder saved as a Noma notification.");
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

  const editingPhoneAlarm = existingReminder?.alertType === "phone-alarm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-lg">
            <Bell className="size-5 text-primary" />
            {existingReminder ? "Edit Reminder" : "Set Reminder"}
          </DialogTitle>
          <DialogDescription className="truncate">
            For note: <span className="font-medium text-foreground">“{noteTitle}”</span>
          </DialogDescription>
        </DialogHeader>

        {capability &&
          !capability.permissionGranted &&
          (!phoneAlarmSupported || alertType === "notification") && (
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

          {phoneAlarmSupported && (
            <div className="space-y-3 rounded-md border p-3">
              <Label className="text-xs font-medium text-muted-foreground">Alert</Label>
              <RadioGroup
                value={alertType}
                onValueChange={(v) => setAlertType(v as ReminderAlertType)}
                className="grid grid-cols-2 gap-2"
              >
                <Label
                  htmlFor="alert-notification"
                  className={`flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm ${
                    alertType === "notification" ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <RadioGroupItem value="notification" id="alert-notification" />
                  <Bell className="size-4 text-muted-foreground" />
                  Noma notification
                </Label>
                <Label
                  htmlFor="alert-phone-alarm"
                  className={`flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm ${
                    alertType === "phone-alarm" ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <RadioGroupItem value="phone-alarm" id="alert-phone-alarm" />
                  <AlarmClock className="size-4 text-muted-foreground" />
                  Phone alarm
                </Label>
              </RadioGroup>

              {alertType === "phone-alarm" && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Alarm tone</Label>
                    <Select
                      value={toneMode}
                      onValueChange={(v) => void handleToneModeChange(v as AlarmToneMode)}
                      disabled={toneBusy}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Choose alarm tone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">System default</SelectItem>
                        <SelectItem value="system-picker">Choose system ringtone…</SelectItem>
                        <SelectItem value="custom">Choose from device…</SelectItem>
                      </SelectContent>
                    </Select>
                    {toneMode !== "system" && toneUri && (
                      <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-2 text-sm">
                        <Music
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate" title={toneName ?? toneUri}>
                          ♪ {toneName ?? "Custom tone"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => void handlePreview()}
                        >
                          {previewing ? "Stop" : "Preview"}
                        </Button>
                      </div>
                    )}
                    {toneBusy && <p className="text-xs text-muted-foreground">Opening picker…</p>}
                    {toneNotice && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">{toneNotice}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="alarm-vibrate" className="text-sm">
                      Vibrate
                    </Label>
                    <Switch id="alarm-vibrate" checked={vibrate} onCheckedChange={setVibrate} />
                  </div>

                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Your Clock app will open so you can confirm the alarm. Ringing, snooze and
                    dismiss are handled there — Noma can&apos;t change or cancel alarms once
                    they&apos;re in your Clock app.
                  </p>
                  {editingPhoneAlarm && (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
                      This reminder already created an alarm in your Clock app. Changing the time
                      here won&apos;t update or remove that alarm — please update it in your Clock
                      app as well.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {showAlarmFallback && (
            <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs">
              <p className="font-medium text-destructive">No alarm-clock app found</p>
              <p className="text-muted-foreground">
                This device doesn&apos;t have an app that can create alarms. You can save this as a
                regular Noma notification instead.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleFallbackToNotification()}
                disabled={saving}
              >
                <Bell className="size-3.5" /> Save as Noma notification
              </Button>
            </div>
          )}

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
