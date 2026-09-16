import { format, isThisYear } from "date-fns";
import type { Task } from "@/lib/noma/types";

const DAY_MS = 86_400_000;

function localDayStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Quiet humanised due label: "Today", "Tomorrow", "Yesterday", "Fri 19 Sep",
 * with the time appended when one was set (non-midnight).
 */
export function formatTaskDue(dueAt: number, now: number = Date.now()): string {
  const start = localDayStart(now);
  const dayIndex = Math.floor((dueAt - start) / DAY_MS);
  const hasTime = new Date(dueAt).getHours() !== 0 || new Date(dueAt).getMinutes() !== 0;
  const timePart = hasTime ? `, ${format(dueAt, "p")}` : "";

  let dayPart: string;
  if (dayIndex === 0) dayPart = "Today";
  else if (dayIndex === 1) dayPart = "Tomorrow";
  else if (dayIndex === -1) dayPart = "Yesterday";
  else if (dayIndex < -1 && dayIndex > -7) dayPart = format(dueAt, "EEEE");
  else dayPart = isThisYear(dueAt) ? format(dueAt, "EEE d MMM") : format(dueAt, "EEE d MMM yyyy");
  return `${dayPart}${timePart}`;
}

export function isTaskOverdue(task: Task, now: number = Date.now()): boolean {
  return !task.completed && task.dueAt != null && task.dueAt < localDayStart(now);
}

/** True when the task is due at any point during the current local day. */
export function isTaskDueToday(dueAt: number, now: number = Date.now()): boolean {
  return localDayStart(dueAt) === localDayStart(now);
}
