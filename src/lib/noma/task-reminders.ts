import { type NomaDatabase, newId } from "./db";
import { applyAlertFields, type SetReminderOptions } from "./notes";
import { cancelNotification, scheduleNotification } from "./notifications";
import type { Reminder } from "./types";

/**
 * Task reminder helpers. These mirror the note reminder helpers in notes.ts
 * (one primary reminder per entity, transactional reminderAt bookkeeping) but
 * are keyed on the reminders table's taskId index instead of noteId.
 *
 * Task reminder rows deliberately OMIT noteId — the two entity kinds never
 * share a row, so note flows (cleanupOrphanedReminders, noteId queries) and
 * task flows cannot cross-talk.
 */
export async function setTaskReminder(
  db: NomaDatabase,
  taskId: string,
  scheduledAt: number,
  options?: SetReminderOptions,
): Promise<Reminder> {
  const existingList = await db.reminders.where("taskId").equals(taskId).toArray();
  const primary = existingList[0];
  const extras = existingList.slice(1);
  const now = Date.now();

  // Cancel notifications & remove any duplicate rows safely
  for (const extra of extras) {
    await cancelNotification(extra.id, extra.notificationId);
    await db.reminders.delete(extra.id);
  }

  if (primary) {
    await cancelNotification(primary.id, primary.notificationId);
    const updated: Reminder = {
      ...primary,
      scheduledAt,
      status: "pending",
      updatedAt: now,
    };
    const { scheduled } = applyAlertFields(updated, options);
    if (scheduled) {
      const notifId = await scheduleNotification(updated);
      if (notifId !== undefined) updated.notificationId = notifId;
    }
    await db.reminders.put(updated);
    await db.tasks.update(taskId, { reminderAt: scheduledAt, updatedAt: now });
    return updated;
  }

  const reminder: Reminder = {
    id: newId(),
    taskId,
    scheduledAt,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  const { scheduled } = applyAlertFields(reminder, options);
  if (scheduled) {
    const notifId = await scheduleNotification(reminder);
    if (notifId !== undefined) reminder.notificationId = notifId;
  }

  await db.transaction("rw", db.reminders, db.tasks, async () => {
    await db.reminders.put(reminder);
    await db.tasks.update(taskId, { reminderAt: scheduledAt, updatedAt: now });
  });

  return reminder;
}

export async function deleteTaskReminder(db: NomaDatabase, taskId: string): Promise<void> {
  const existingList = await db.reminders.where("taskId").equals(taskId).toArray();
  for (const existing of existingList) {
    await cancelNotification(existing.id, existing.notificationId);
  }
  await db.transaction("rw", db.reminders, db.tasks, async () => {
    await db.reminders.where("taskId").equals(taskId).delete();
    await db.tasks.update(taskId, { reminderAt: null });
  });
}

/**
 * Mirror of cleanupOrphanedReminders for task-linked rows. Only ever touches
 * rows with taskId set — note reminders are left entirely alone.
 */
export async function cleanupOrphanedTaskReminders(db: NomaDatabase): Promise<void> {
  const tasks = await db.tasks.toArray();
  const validTaskIds = new Set(tasks.map((t) => t.id));
  const reminders = await db.reminders.filter((r) => r.taskId != null).toArray();

  // 1. Remove orphaned task reminders (whose task no longer exists)
  const orphaned = reminders.filter((r) => r.taskId == null || !validTaskIds.has(r.taskId));
  for (const r of orphaned) {
    await cancelNotification(r.id, r.notificationId);
    await db.reminders.delete(r.id);
  }

  // 2. Group non-orphaned reminders by taskId and clean up accidental duplicates
  const reminderGroups = new Map<string, Reminder[]>();
  for (const r of reminders) {
    if (r.taskId == null || !validTaskIds.has(r.taskId)) continue;
    const group = reminderGroups.get(r.taskId) ?? [];
    group.push(r);
    reminderGroups.set(r.taskId, group);
  }

  for (const group of reminderGroups.values()) {
    if (group.length > 1) {
      // Keep the most recently updated reminder, delete extra duplicate rows
      group.sort((a, b) => b.updatedAt - a.updatedAt);
      const extras = group.slice(1);
      for (const extra of extras) {
        await cancelNotification(extra.id, extra.notificationId);
        await db.reminders.delete(extra.id);
      }
    }
  }

  // 3. Enforce tasks.reminderAt accuracy against surviving post-deletion state
  const survivingReminders = await db.reminders.filter((r) => r.taskId != null).toArray();
  const survivingMap = new Map<string, Reminder>();
  for (const r of survivingReminders) {
    if (r.taskId != null) survivingMap.set(r.taskId, r);
  }

  for (const task of tasks) {
    const surviving = survivingMap.get(task.id);
    if (surviving && surviving.status === "pending") {
      if (task.reminderAt !== surviving.scheduledAt) {
        await db.tasks.update(task.id, { reminderAt: surviving.scheduledAt });
      }
    } else {
      if (task.reminderAt !== null) {
        await db.tasks.update(task.id, { reminderAt: null });
      }
    }
  }
}
