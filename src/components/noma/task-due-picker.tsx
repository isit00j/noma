import { useEffect, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const DAY_MS = 86_400_000;

function dayStartOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** epoch ms -> "HH:MM" for <input type="time">; midnight counts as no time set. */
function timeStringOf(dueAt: number | null): string {
  if (dueAt == null) return "";
  const d = new Date(dueAt);
  return d.getHours() === 0 && d.getMinutes() === 0
    ? ""
    : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Combine a calendar day with an "HH:MM" string into epoch ms. */
function combineDayTime(day: Date, time: string): number {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  if (time) {
    const parts = time.split(":").map(Number);
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  }
  return d.getTime();
}

const PRESETS = [
  { value: "today", label: "Today", offsetDays: 0 },
  { value: "tomorrow", label: "Tomorrow", offsetDays: 1 },
  { value: "week", label: "Next week", offsetDays: 7 },
] as const;

export interface TaskDuePickerProps {
  /** Current due date as epoch ms, or null for no due date. */
  value: number | null;
  onChange: (dueAt: number | null) => void;
  idPrefix?: string;
}

/**
 * Shared due-date picker for tasks: preset chips, a calendar, and a time row.
 * Picking a day combines it with the staged time (or start of day); changing
 * the time with no date stages it until a day is picked.
 */
export function TaskDuePicker({ value, onChange, idPrefix = "task-due" }: TaskDuePickerProps) {
  const [stagedTime, setStagedTime] = useState(() => timeStringOf(value));

  // Re-sync the staged time when the value changes from outside (e.g. the
  // underlying task was updated while the picker stayed mounted).
  useEffect(() => {
    setStagedTime(timeStringOf(value));
  }, [value]);

  const todayStart = dayStartOf(Date.now());
  const activePreset =
    value == null
      ? null
      : (PRESETS.find((p) => dayStartOf(value) === todayStart + p.offsetDays * DAY_MS)?.value ??
        null);

  const pickDay = (day: Date) => onChange(combineDayTime(day, stagedTime));

  return (
    <div>
      <div className="mb-2 flex gap-1.5">
        {PRESETS.map((preset) => {
          const base = new Date();
          base.setDate(base.getDate() + preset.offsetDays);
          return (
            <Button
              key={preset.value}
              variant="secondary"
              size="sm"
              className={cn("h-7 text-xs", activePreset === preset.value && "ring-1 ring-primary")}
              onClick={() => pickDay(base)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
      <Calendar
        mode="single"
        selected={value != null ? new Date(value) : undefined}
        onSelect={(d) => {
          if (d) pickDay(d);
        }}
      />
      <div className="mt-2 flex items-center gap-2">
        <Label htmlFor={`${idPrefix}-time`} className="text-xs text-muted-foreground">
          Time
        </Label>
        <Input
          id={`${idPrefix}-time`}
          type="time"
          value={stagedTime}
          onChange={(e) => {
            const t = e.target.value;
            setStagedTime(t);
            if (value != null) onChange(combineDayTime(new Date(value), t));
          }}
          className="h-8"
        />
        {value != null && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => onChange(null)}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
