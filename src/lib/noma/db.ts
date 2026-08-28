import Dexie, { type Table } from "dexie";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type AttachmentMeta,
  type BackupRecord,
  type Folder,
  type Note,
  type Tag,
} from "./types";

export class NomaDatabase extends Dexie {
  notes!: Table<Note, string>;
  folders!: Table<Folder, string>;
  tags!: Table<Tag, string>;
  attachments!: Table<AttachmentMeta, string>;
  settings!: Table<AppSettings, string>;
  backups!: Table<BackupRecord, string>;

  constructor(databaseName: string) {
    super(databaseName);

    // v1 — initial schema. Add new versions below, never mutate this one.
    this.version(1).stores({
      notes: "id, updatedAt, createdAt, folderId, pinned, favorite, archived, deleted, *tagIds",
      folders: "id, name, parentId",
      tags: "id, name",
      attachments: "id, noteId",
      settings: "id",
      backups: "id, createdAt",
    });
  }
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getSettings(db: NomaDatabase): Promise<AppSettings> {
  const existing = await db.settings.get("app");
  if (existing) return { ...DEFAULT_SETTINGS, ...existing };
  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function saveSettings(
  db: NomaDatabase,
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const next = { ...(await getSettings(db)), ...patch, id: "app" as const };

  await db.settings.put(next);
  return next;
}

export async function copyDatabase(source: NomaDatabase, target: NomaDatabase): Promise<void> {
  await target.transaction(
    "rw",
    [
      target.notes,
      target.folders,
      target.tags,
      target.attachments,
      target.settings,
      target.backups,
    ],
    async () => {
      const notes = await source.notes.toArray();
      const folders = await source.folders.toArray();
      const tags = await source.tags.toArray();
      const attachments = await source.attachments.toArray();
      const settings = await source.settings.toArray();
      const backups = await source.backups.toArray();

      if (notes.length) await target.notes.bulkPut(notes);
      if (folders.length) await target.folders.bulkPut(folders);
      if (tags.length) await target.tags.bulkPut(tags);
      if (attachments.length) await target.attachments.bulkPut(attachments);
      if (settings.length) await target.settings.bulkPut(settings);
      if (backups.length) await target.backups.bulkPut(backups);
    },
  );
}
