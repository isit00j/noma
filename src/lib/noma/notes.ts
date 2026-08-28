import { type NomaDatabase, newId } from "./db";
import { countWords, htmlToPlainText, sanitizeHtml } from "./sanitize";
import type { Folder, Note, Tag } from "./types";

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
    title: source.title ? `${source.title} (copy)` : "Untitled (copy)",
  });
}

export const togglePinned = (db: NomaDatabase, n: Note) =>
  updateNote(db, n.id, { pinned: !n.pinned });
export const toggleFavorite = (db: NomaDatabase, n: Note) =>
  updateNote(db, n.id, { favorite: !n.favorite });
export const setArchived = (db: NomaDatabase, n: Note, archived: boolean) =>
  updateNote(db, n.id, { archived });

export const trashNote = (db: NomaDatabase, id: string) =>
  updateNote(db, id, { deleted: true, deletedAt: Date.now(), pinned: false });

export const restoreNote = (db: NomaDatabase, id: string) =>
  updateNote(db, id, { deleted: false, deletedAt: null });

export async function deleteNoteForever(db: NomaDatabase, id: string): Promise<void> {
  await db.transaction("rw", db.notes, db.attachments, async () => {
    await db.attachments.where("noteId").equals(id).delete();
    await db.notes.delete(id);
  });
}

export async function emptyTrash(db: NomaDatabase): Promise<number> {
  const trashed = await db.notes.filter((n) => n.deleted).toArray();
  for (const note of trashed) await deleteNoteForever(db, note.id);
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
