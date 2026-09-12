import { type NomaDatabase, newId } from "./db";
import { cancelNotification, scheduleNotification } from "./notifications";
import { countWords, htmlToPlainText, sanitizeHtml } from "./sanitize";
import { cleanupOrphanedAttachments } from "./media";
import type { Folder, Note, Reminder, Tag } from "./types";

export async function createNote(db: NomaDatabase, init: Partial<Note> = {}): Promise<Note> {
  const now = Date.now();
  const note: Note = {
    id: newId(),
    title: "",
    content: "",
    contentFormat: "tiptap-html",
    createdAt: now,
    updatedAt: now,
    folderId: null,
    tagIds: [],
    pinned: false,
    favorite: false,
    archived: false,
    deleted: false,
    deletedAt: null,
    reminderAt: null,
    wordCount: 0,
    ...init,
  };
  await db.notes.put(note);
  return note;
}

export async function updateNote(
  db: NomaDatabase,
  id: string,
  patch: Partial<Note>,
): Promise<void> {
  const next: Partial<Note> = { ...patch, updatedAt: Date.now() };
  if (typeof patch.content === "string") {
    next.content = sanitizeHtml(patch.content);
    next.wordCount = countWords(next.content);
  }
  await db.notes.update(id, next);
}

export async function duplicateNote(db: NomaDatabase, id: string): Promise<Note | null> {
  const source = await db.notes.get(id);
  if (!source) return null;
  const { id: _drop, ...rest } = source;
  return createNote(db, {
    ...rest,
    reminderAt: null,
    title: source.title ? `${source.title} (copy)` : "Untitled (copy)",
  });
}

export const togglePinned = (db: NomaDatabase, n: Note) =>
  updateNote(db, n.id, { pinned: !n.pinned });
export const toggleFavorite = (db: NomaDatabase, n: Note) =>
  updateNote(db, n.id, { favorite: !n.favorite });
export const setArchived = (db: NomaDatabase, n: Note, archived: boolean) =>
  updateNote(db, n.id, { archived });

export const trashNote = async (db: NomaDatabase, id: string) => {
  await updateNote(db, id, { deleted: true, deletedAt: Date.now(), pinned: false });
  await cleanupOrphanedAttachments(db);
};

export const restoreNote = (db: NomaDatabase, id: string) =>
  updateNote(db, id, { deleted: false, deletedAt: null });

export async function deleteNoteForever(db: NomaDatabase, id: string): Promise<void> {
  // Find associated reminders to cancel notifications
  const reminders = await db.reminders.where("noteId").equals(id).toArray();
  for (const reminder of reminders) {
    await cancelNotification(reminder.id, reminder.notificationId);
  }

  await db.transaction("rw", db.notes, db.attachments, db.reminders, async () => {
    await db.attachments.where("noteId").equals(id).delete();
    await db.reminders.where("noteId").equals(id).delete();
    await db.notes.delete(id);
  });

  await cleanupOrphanedAttachments(db);
}

export async function emptyTrash(db: NomaDatabase): Promise<number> {
  const trashed = await db.notes.filter((n) => n.deleted).toArray();
  for (const note of trashed) await deleteNoteForever(db, note.id);
  await cleanupOrphanedAttachments(db);
  return trashed.length;
}

/* Folders */

export async function createFolder(db: NomaDatabase, name: string): Promise<Folder> {
  const now = Date.now();
  const folder: Folder = {
    id: newId(),
    name: name.trim() || "Untitled folder",
    parentId: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.folders.put(folder);
  return folder;
}

export const renameFolder = (db: NomaDatabase, id: string, name: string) =>
  db.folders.update(id, { name: name.trim(), updatedAt: Date.now() });

export async function deleteFolder(db: NomaDatabase, id: string): Promise<void> {
  await db.transaction("rw", db.folders, db.notes, async () => {
    const notes = await db.notes.where("folderId").equals(id).toArray();
    for (const note of notes) await updateNote(db, note.id, { folderId: null });
    await db.folders.delete(id);
  });
}

export const moveNote = (db: NomaDatabase, noteId: string, folderId: string | null) =>
  updateNote(db, noteId, { folderId });

/* Tags */

export async function createTag(db: NomaDatabase, name: string): Promise<Tag> {
  const clean = name.trim().replace(/^#/, "");
  const existing = await db.tags
    .filter((t) => t.name.toLowerCase() === clean.toLowerCase())
    .first();
  if (existing) return existing;
  const tag: Tag = { id: newId(), name: clean || "untitled", createdAt: Date.now() };
  await db.tags.put(tag);
  return tag;
}

export const renameTag = (db: NomaDatabase, id: string, name: string) =>
  db.tags.update(id, { name: name.trim().replace(/^#/, "") });

export async function deleteTag(db: NomaDatabase, id: string): Promise<void> {
  await db.transaction("rw", db.tags, db.notes, async () => {
    const notes = await db.notes.filter((n) => n.tagIds.includes(id)).toArray();
    for (const note of notes) {
      await updateNote(db, note.id, { tagIds: note.tagIds.filter((t) => t !== id) });
    }
    await db.tags.delete(id);
  });
}

export async function setNoteTags(
  db: NomaDatabase,
  noteId: string,
  tagIds: string[],
): Promise<void> {
  await updateNote(db, noteId, { tagIds });
}

export function notePreview(note: Note, length = 140): string {
  const text = htmlToPlainText(note.content);
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

export function noteTitle(note: Note): string {
  return note.title.trim() || "Untitled note";
}

/* Reminders */

export async function setNoteReminder(
  db: NomaDatabase,
  noteId: string,
  scheduledAt: number,
): Promise<Reminder> {
  const existingList = await db.reminders.where("noteId").equals(noteId).toArray();
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
    const notifId = await scheduleNotification(updated);
    if (notifId !== undefined) updated.notificationId = notifId;
    await db.reminders.put(updated);
    await db.notes.update(noteId, { reminderAt: scheduledAt, updatedAt: now });
    return updated;
  }

  const reminder: Reminder = {
    id: newId(),
    noteId,
    scheduledAt,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  const notifId = await scheduleNotification(reminder);
  if (notifId !== undefined) reminder.notificationId = notifId;

  await db.transaction("rw", db.reminders, db.notes, async () => {
    await db.reminders.put(reminder);
    await db.notes.update(noteId, { reminderAt: scheduledAt, updatedAt: now });
  });

  return reminder;
}

export async function deleteNoteReminder(db: NomaDatabase, noteId: string): Promise<void> {
  const existingList = await db.reminders.where("noteId").equals(noteId).toArray();
  for (const existing of existingList) {
    await cancelNotification(existing.id, existing.notificationId);
  }
  await db.transaction("rw", db.reminders, db.notes, async () => {
    await db.reminders.where("noteId").equals(noteId).delete();
    await db.notes.update(noteId, { reminderAt: null });
  });
}

export async function updateReminderStatus(
  db: NomaDatabase,
  reminderId: string,
  status: "completed" | "dismissed" | "pending",
): Promise<void> {
  const existing = await db.reminders.get(reminderId);
  if (!existing) return;

  const now = Date.now();

  if (status !== "pending") {
    await cancelNotification(existing.id, existing.notificationId);
    await db.transaction("rw", db.reminders, db.notes, async () => {
      await db.reminders.update(reminderId, { status, updatedAt: now });
      await db.notes.update(existing.noteId, { reminderAt: null, updatedAt: now });
    });
  } else {
    // Reopening as pending
    const updatedReminder: Reminder = {
      ...existing,
      status: "pending",
      updatedAt: now,
    };

    let notifId: number | undefined;
    if (existing.scheduledAt > now) {
      notifId = await scheduleNotification(updatedReminder);
    }

    await db.transaction("rw", db.reminders, db.notes, async () => {
      await db.reminders.update(reminderId, {
        status: "pending",
        updatedAt: now,
        ...(notifId !== undefined ? { notificationId: notifId } : {}),
      });
      await db.notes.update(existing.noteId, {
        reminderAt: existing.scheduledAt,
        updatedAt: now,
      });
    });
  }
}

export async function cleanupOrphanedReminders(db: NomaDatabase): Promise<void> {
  const notes = await db.notes.toArray();
  const validNoteIds = new Set(notes.map((n) => n.id));
  const reminders = await db.reminders.toArray();

  // 1. Remove orphaned reminders (whose note no longer exists)
  const orphaned = reminders.filter((r) => !validNoteIds.has(r.noteId));
  for (const r of orphaned) {
    await cancelNotification(r.id, r.notificationId);
    await db.reminders.delete(r.id);
  }

  // 2. Group non-orphaned reminders by noteId and clean up accidental duplicates
  const reminderGroups = new Map<string, Reminder[]>();
  for (const r of reminders) {
    if (!validNoteIds.has(r.noteId)) continue;
    const group = reminderGroups.get(r.noteId) ?? [];
    group.push(r);
    reminderGroups.set(r.noteId, group);
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

  // 3. Re-read/recompute remaining reminders from database after deletions
  const survivingReminders = await db.reminders.toArray();
  const survivingMap = new Map<string, Reminder>();
  for (const r of survivingReminders) {
    survivingMap.set(r.noteId, r);
  }

  // 4. Enforce note.reminderAt accuracy against surviving post-deletion state
  for (const note of notes) {
    const surviving = survivingMap.get(note.id);
    if (surviving && surviving.status === "pending") {
      if (note.reminderAt !== surviving.scheduledAt) {
        await db.notes.update(note.id, { reminderAt: surviving.scheduledAt });
      }
    } else {
      if (note.reminderAt !== null) {
        await db.notes.update(note.id, { reminderAt: null });
      }
    }
  }
}
