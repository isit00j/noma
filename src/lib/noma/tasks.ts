import { type NomaDatabase, newId } from "./db";
import { cancelNotification } from "./notifications";
import { type SetReminderOptions } from "./notes";
import { cleanupOrphanedTaskReminders, setTaskReminder } from "./task-reminders";
import {
  INBOX_LIST_ID,
  type RecurrenceRule,
  type Task,
  type TaskList,
  type TaskPriority,
} from "./types";

/**
 * Task data layer (Android-only feature). Mirrors the conventions of notes.ts:
 * string UUID ids via newId(), epoch-ms timestamps, and updatedAt stamping on
 * every mutation. Tasks and notes stay fully separate — no shared tables.
 */

export const TASK_PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

/** Deterministic ids so merges across devices never duplicate the defaults. */
export const DEFAULT_TASK_LISTS: Array<Pick<TaskList, "id" | "name">> = [
  { id: "list-personal", name: "Personal" },
  { id: "list-study", name: "Study" },
  { id: "list-work", name: "Work" },
  { id: "list-shopping", name: "Shopping" },
];

/**
 * Lazily seeds the default lists for fresh task users. Called at app level,
 * never inside a Dexie migration. Skips seeding when lists or tasks already
 * exist so user-deleted lists are never resurrected.
 */
export async function ensureDefaultTaskLists(db: NomaDatabase): Promise<void> {
  const [listCount, taskCount] = await Promise.all([db.taskLists.count(), db.tasks.count()]);
  if (listCount > 0 || taskCount > 0) return;
  const now = Date.now();
  await db.taskLists.bulkPut(
    DEFAULT_TASK_LISTS.map((l) => ({ ...l, createdAt: now, updatedAt: now })),
  );
}

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

/* ---------------- CRUD ---------------- */

export async function createTask(db: NomaDatabase, init: Partial<Task> = {}): Promise<Task> {
  const now = Date.now();
  const task: Task = {
    id: newId(),
    details: "",
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    dueAt: null,
    priority: "none",
    listId: INBOX_LIST_ID,
    parentTaskId: null,
    order: now,
    noteId: null,
    reminderAt: null,
    recurrence: null,
    deleted: false,
    deletedAt: null,
    ...init,
    title: (init.title ?? "").trim(),
    labelIds: (init.labelIds ?? []).map(normalizeLabel).filter(Boolean),
  };
  await db.tasks.put(task);
  return task;
}

export async function updateTask(
  db: NomaDatabase,
  id: string,
  patch: Partial<Task>,
): Promise<void> {
  const next: Partial<Task> = { ...patch, updatedAt: Date.now() };
  if (patch.title !== undefined) next.title = patch.title.trim();
  if (patch.labelIds !== undefined)
    next.labelIds = patch.labelIds.map(normalizeLabel).filter(Boolean);
  await db.tasks.update(id, next);
}

/**
 * Completes or uncompletes a task. Completing a recurring task advances its
 * dueAt to the next occurrence via completeRecurringTask instead of marking
 * it done — callers never need to branch on recurrence themselves.
 */
export async function completeTask(
  db: NomaDatabase,
  id: string,
  completed: boolean,
): Promise<Task | null> {
  const task = await db.tasks.get(id);
  if (!task) return null;
  if (completed && task.recurrence) return completeRecurringTask(db, id);
  const now = Date.now();
  await db.tasks.update(id, {
    completed,
    completedAt: completed ? now : null,
    updatedAt: now,
  });
  return (await db.tasks.get(id)) ?? null;
}

export const deleteTask = (db: NomaDatabase, id: string) =>
  updateTask(db, id, { deleted: true, deletedAt: Date.now() });

export const restoreTask = (db: NomaDatabase, id: string) =>
  updateTask(db, id, { deleted: false, deletedAt: null });

export async function deleteTaskForever(db: NomaDatabase, id: string): Promise<void> {
  const subtasks = await db.tasks.where("parentTaskId").equals(id).toArray();

  // Cancel every notification tied to the task and its subtasks first.
  const taskIds = [id, ...subtasks.map((s) => s.id)];
  for (const taskId of taskIds) {
    const rows = await db.reminders.where("taskId").equals(taskId).toArray();
    for (const row of rows) await cancelNotification(row.id, row.notificationId);
  }

  await db.transaction("rw", db.tasks, db.reminders, async () => {
    for (const taskId of taskIds) {
      await db.reminders.where("taskId").equals(taskId).delete();
      await db.tasks.delete(taskId);
    }
  });

  await cleanupOrphanedTaskReminders(db);
}

/* ---------------- Task lists ---------------- */

export async function createTaskList(db: NomaDatabase, name: string): Promise<TaskList> {
  const now = Date.now();
  const list: TaskList = {
    id: newId(),
    name: name.trim() || "Untitled list",
    createdAt: now,
    updatedAt: now,
  };
  await db.taskLists.put(list);
  return list;
}

export const renameTaskList = (db: NomaDatabase, id: string, name: string) =>
  db.taskLists.update(id, { name: name.trim(), updatedAt: Date.now() });

/**
 * Deletes a list and moves its tasks (including subtasks, which carry the
 * parent's listId) to the inbox. The implicit inbox can never be deleted.
 */
export async function deleteTaskList(db: NomaDatabase, id: string): Promise<void> {
  if (id === INBOX_LIST_ID) return;
  const now = Date.now();
  await db.transaction("rw", db.taskLists, db.tasks, async () => {
    const tasks = await db.tasks.where("listId").equals(id).toArray();
    for (const task of tasks) {
      await db.tasks.update(task.id, { listId: INBOX_LIST_ID, updatedAt: now });
    }
    await db.taskLists.delete(id);
  });
}

/** Moves a task between lists; subtasks always follow their parent. */
export async function moveTask(db: NomaDatabase, taskId: string, listId: string): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.tasks, async () => {
    await db.tasks.update(taskId, { listId, updatedAt: now });
    const subtasks = await db.tasks.where("parentTaskId").equals(taskId).toArray();
    for (const sub of subtasks) await db.tasks.update(sub.id, { listId, updatedAt: now });
  });
}

/* ---------------- Subtasks (max depth 1) ---------------- */

export async function createSubtask(
  db: NomaDatabase,
  parentId: string,
  title: string,
): Promise<Task> {
  const parent = await db.tasks.get(parentId);
  if (!parent) throw new Error("Parent task not found.");
  if (parent.parentTaskId) throw new Error("Subtasks cannot have their own subtasks.");
  return createTask(db, { title, parentTaskId: parentId, listId: parent.listId });
}

export async function getSubtaskProgress(
  db: NomaDatabase,
  parentId: string,
): Promise<{ done: number; total: number }> {
  const subtasks = await db.tasks
    .where("parentTaskId")
    .equals(parentId)
    .filter((t) => !t.deleted)
    .toArray();
  return {
    done: subtasks.filter((s) => s.completed).length,
    total: subtasks.length,
  };
}

/* ---------------- Recurrence ---------------- */

const DAY_MS = 86_400_000;

/** Adds months clamping to the last day of the target month (Jan 31 + 1mo -> Feb 28). */
function addMonthsClamped(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

/** Advances `weekdays` weekdays after base (skips Saturday/Sunday). */
function addWeekdays(baseMs: number, weekdays: number): number {
  const d = new Date(baseMs);
  let remaining = Math.max(1, weekdays);
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d.getTime();
}

function advanceOnce(baseMs: number, rule: RecurrenceRule): number {
  const interval = Math.max(1, Math.floor(rule.interval ?? 1));
  switch (rule.freq) {
    case "daily":
      return baseMs + interval * DAY_MS;
    case "weekdays":
      return addWeekdays(baseMs, interval);
    case "weekly":
      return baseMs + interval * 7 * DAY_MS;
    case "monthly":
      return addMonthsClamped(new Date(baseMs), interval).getTime();
    case "yearly":
      return addMonthsClamped(new Date(baseMs), interval * 12).getTime();
  }
}

/**
 * Pure function computing the next dueAt for a recurring task, advancing past
 * any occurrences already in the past (e.g. a long-overdue daily task jumps
 * to the next future day). Returns null when the rule ended (endAt passed) or
 * no recurrence is set.
 */
export function advanceRecurrence(task: Task, now: number): number | null {
  const rule = task.recurrence;
  if (!rule) return null;
  const base = task.dueAt ?? now;
  let next = advanceOnce(base, rule);
  let guard = 0;
  while (next <= now && guard++ < 2000) next = advanceOnce(next, rule);
  if (rule.endAt != null && next > rule.endAt) return null;
  return next;
}

/**
 * Completes a recurring task by advancing it to its next occurrence.
 *
 * Recurrence + reminder safety: the current occurrence's reminder row is
 * cancelled AND deleted before the task advances, so old reminder state can
 * never leak onto the new occurrence. A fresh reminder is then scheduled for
 * the new occurrence only when the old one was a Noma notification — external
 * Clock (phone-alarm) alarms are owned by the Clock app and can never be
 * recreated silently, so no reminder is created for those.
 */
export async function completeRecurringTask(db: NomaDatabase, id: string): Promise<Task | null> {
  const task = await db.tasks.get(id);
  if (!task) return null;
  if (!task.recurrence) return completeTask(db, id, true);

  const now = Date.now();
  const next = advanceRecurrence(task, now);

  // Capture the current occurrence's alert configuration before destroying it.
  const existingList = await db.reminders.where("taskId").equals(id).toArray();
  const primary = existingList[0] ?? null;
  const oldOptions: SetReminderOptions | undefined = primary
    ? {
        alertType: primary.alertType,
        alarmToneMode: primary.alarmToneMode,
        alarmToneUri: primary.alarmToneUri,
        alarmToneName: primary.alarmToneName,
        alarmVibrate: primary.alarmVibrate,
      }
    : undefined;
  // Preserve the reminder's offset relative to the due time, if any.
  const rescheduleAt =
    primary && next != null ? next + (primary.scheduledAt - (task.dueAt ?? now)) : null;

  // 1+2. Cancel the current notification(s) and delete the old reminder rows.
  for (const row of existingList) {
    await cancelNotification(row.id, row.notificationId);
  }

  await db.transaction("rw", db.reminders, db.tasks, async () => {
    for (const row of existingList) await db.reminders.delete(row.id);
    if (next == null) {
      // Recurrence ended: plain completion, no reminder survives.
      await db.tasks.update(id, {
        completed: true,
        completedAt: now,
        reminderAt: null,
        updatedAt: now,
      });
    } else {
      // 3. Advance the same record; reminderAt is cleared until rescheduled.
      await db.tasks.update(id, {
        completed: false,
        completedAt: null,
        dueAt: next,
        reminderAt: null,
        updatedAt: now,
      });
    }
  });

  // 4. Fresh reminder for the new occurrence (notification type only).
  if (
    next != null &&
    primary &&
    primary.alertType !== "phone-alarm" &&
    rescheduleAt != null &&
    rescheduleAt > Date.now()
  ) {
    await setTaskReminder(db, id, rescheduleAt, oldOptions);
  }

  return (await db.tasks.get(id)) ?? null;
}

/* ---------------- Smart views (local device time) ---------------- */

function localDayBounds(now: number): { start: number; end: number } {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  return { start, end: start + DAY_MS };
}

function compareTasks(a: Task, b: Task): number {
  const dueA = a.dueAt ?? Number.POSITIVE_INFINITY;
  const dueB = b.dueAt ?? Number.POSITIVE_INFINITY;
  if (dueA !== dueB) return dueA - dueB;
  const pa = TASK_PRIORITY_WEIGHT[a.priority] ?? 3;
  const pb = TASK_PRIORITY_WEIGHT[b.priority] ?? 3;
  if (pa !== pb) return pa - pb;
  return a.createdAt - b.createdAt;
}

async function topLevelTasks(db: NomaDatabase): Promise<Task[]> {
  return db.tasks.filter((t) => !t.deleted && t.parentTaskId == null).toArray();
}

/** Incomplete tasks due at any point during the current local day. */
export async function getTodayTasks(db: NomaDatabase, now: number = Date.now()): Promise<Task[]> {
  const { start, end } = localDayBounds(now);
  const tasks = await topLevelTasks(db);
  return tasks
    .filter((t) => !t.completed && t.dueAt != null && t.dueAt >= start && t.dueAt < end)
    .sort(compareTasks);
}

/** Incomplete tasks whose due time passed before today (local). */
export async function getOverdueTasks(db: NomaDatabase, now: number = Date.now()): Promise<Task[]> {
  const { start } = localDayBounds(now);
  const tasks = await topLevelTasks(db);
  return tasks.filter((t) => !t.completed && t.dueAt != null && t.dueAt < start).sort(compareTasks);
}

/** Incomplete tasks due after today (local), chronological. */
export async function getUpcomingTasks(
  db: NomaDatabase,
  now: number = Date.now(),
): Promise<Task[]> {
  const { end } = localDayBounds(now);
  const tasks = await topLevelTasks(db);
  return tasks.filter((t) => !t.completed && t.dueAt != null && t.dueAt >= end).sort(compareTasks);
}

/** Completed tasks, most recently completed first. */
export async function getCompletedTasks(db: NomaDatabase): Promise<Task[]> {
  const tasks = await topLevelTasks(db);
  return tasks
    .filter((t) => t.completed)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}

export async function getTasksByList(db: NomaDatabase, listId: string): Promise<Task[]> {
  const tasks = await db.tasks
    .filter((t) => !t.deleted && t.parentTaskId == null && t.listId === listId)
    .toArray();
  return tasks.sort(compareTasks);
}

/* ---------------- Search / filter ---------------- */

export async function searchTasks(db: NomaDatabase, query: string): Promise<Task[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tasks = await db.tasks
    .filter(
      (t) =>
        !t.deleted && (t.title.toLowerCase().includes(q) || t.details.toLowerCase().includes(q)),
    )
    .toArray();
  return tasks.sort(compareTasks);
}

export interface TaskFilter {
  listId?: string;
  priority?: TaskPriority;
  /** Free-form label; normalized the same way as stored labels. */
  label?: string;
  completed?: boolean;
  /** Incomplete tasks due before today (local). */
  overdue?: boolean;
}

export async function filterTasks(
  db: NomaDatabase,
  filter: TaskFilter,
  now: number = Date.now(),
): Promise<Task[]> {
  const { start } = localDayBounds(now);
  const label = filter.label ? normalizeLabel(filter.label) : null;
  const tasks = await db.tasks
    .filter((t) => {
      if (t.deleted || t.parentTaskId != null) return false;
      if (filter.listId !== undefined && t.listId !== filter.listId) return false;
      if (filter.priority !== undefined && t.priority !== filter.priority) return false;
      if (label && !t.labelIds.includes(label)) return false;
      if (filter.completed !== undefined && t.completed !== filter.completed) return false;
      if (filter.overdue && (t.completed || t.dueAt == null || t.dueAt >= start)) return false;
      return true;
    })
    .toArray();
  return tasks.sort(compareTasks);
}
