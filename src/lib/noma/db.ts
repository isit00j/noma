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

  constructor() {
    super("noma");

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

let instance: NomaDatabase | null = null;

export function db(): NomaDatabase {
  if (typeof window === "undefined") {
    throw new Error("Noma's local database is only available in the browser.");
  }
  if (!instance) instance = new NomaDatabase();
  return instance;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getSettings(): Promise<AppSettings> {
  const existing = await db().settings.get("app");
  if (existing) return { ...DEFAULT_SETTINGS, ...existing };
  await db().settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await getSettings()), ...patch, id: "app" as const };
  await db().settings.put(next);
  return next;
}
