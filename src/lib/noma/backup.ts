import JSZip from "jszip";
import { db, newId } from "./db";
import { sanitizeHtml } from "./sanitize";
import {
  BACKUP_FORMAT_VERSION,
  NOMA_VERSION,
  type AttachmentMeta,
  type BackupManifest,
  type Folder,
  type Note,
  type Tag,
} from "./types";

export interface ExportOptions {
  noteIds?: string[];
  folderId?: string | null;
  includeAttachments?: boolean;
  includeFolders?: boolean;
  includeTags?: boolean;
  includeSettings?: boolean;
}

export interface BackupPayload {
  manifest: BackupManifest;
  notes: Note[];
  folders: Folder[];
  tags: Tag[];
  attachments: AttachmentMeta[];
  settings: Record<string, unknown> | null;
}

export function backupFileName(date = new Date()): string {
  return `Noma-Backup-${date.toISOString().slice(0, 10)}.zip`;
}

/* ---------------- Export ---------------- */

export async function collectBackup(options: ExportOptions = {}): Promise<BackupPayload> {
  const {
    noteIds,
    folderId,
    includeAttachments = true,
    includeFolders = true,
    includeTags = true,
    includeSettings = true,
  } = options;

  let notes = await db().notes.toArray();
  if (noteIds?.length) notes = notes.filter((n) => noteIds.includes(n.id));
  else if (folderId !== undefined) notes = notes.filter((n) => n.folderId === folderId);

  const folders = includeFolders ? await db().folders.toArray() : [];
  const tags = includeTags ? await db().tags.toArray() : [];
  const noteIdSet = new Set(notes.map((n) => n.id));
  const attachments = includeAttachments
    ? (await db().attachments.toArray()).filter((a) => noteIdSet.has(a.noteId))
    : [];
  const settings = includeSettings ? ((await db().settings.get("app")) ?? null) : null;

  return {
    manifest: {
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      nomaVersion: NOMA_VERSION,
      createdAt: new Date().toISOString(),
      noteCount: notes.length,
      folderCount: folders.length,
      tagCount: tags.length,
      attachmentCount: attachments.length,
    },
    notes,
    folders,
    tags,
    attachments,
    settings: settings as unknown as Record<string, unknown> | null,
  };
}

export async function buildBackupZip(options: ExportOptions = {}): Promise<{ blob: Blob; payload: BackupPayload }> {
  const payload = await collectBackup(options);
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(payload.manifest, null, 2));
  zip.file("folders.json", JSON.stringify(payload.folders, null, 2));
  zip.file("tags.json", JSON.stringify(payload.tags, null, 2));
  zip.file("settings.json", JSON.stringify(payload.settings, null, 2));

  const notesFolder = zip.folder("notes")!;
  for (const note of payload.notes) notesFolder.file(`${note.id}.json`, JSON.stringify(note, null, 2));

  if (payload.attachments.length) {
    const attachmentsFolder = zip.folder("attachments")!;
    attachmentsFolder.file("index.json", JSON.stringify(payload.attachments.map(({ data: _d, ...m }) => m), null, 2));
    for (const attachment of payload.attachments) {
      const base64 = attachment.data.split(",")[1] ?? "";
      attachmentsFolder.file(`${attachment.id}-${attachment.name}`, base64, { base64: true });
      attachmentsFolder.file(`${attachment.id}.json`, JSON.stringify(attachment, null, 2));
    }
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return { blob, payload };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- Import ---------------- */

export class BackupError extends Error {}

async function readJson<T>(zip: JSZip, path: string): Promise<T | null> {
  const file = zip.file(path);
  if (!file) return null;
  try {
    return JSON.parse(await file.async("string")) as T;
  } catch {
    throw new BackupError(`${path} is not valid JSON. This backup file looks corrupted.`);
  }
}

export async function readBackupZip(file: Blob): Promise<BackupPayload> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new BackupError("That file isn't a readable ZIP archive.");
  }

  const manifest = await readJson<BackupManifest>(zip, "manifest.json");
  if (!manifest || typeof manifest.backupFormatVersion !== "number") {
    throw new BackupError("This archive has no Noma manifest, so it can't be imported.");
  }
  if (manifest.backupFormatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupError(
      `This backup was made by a newer version of Noma (format v${manifest.backupFormatVersion}). Update Noma and try again.`,
    );
  }

  const notes: Note[] = [];
  const noteFiles = zip.folder("notes")?.file(/\.json$/) ?? [];
  for (const noteFile of noteFiles) {
    try {
      const note = JSON.parse(await noteFile.async("string")) as Note;
      if (note?.id && typeof note.content === "string") {
        notes.push({ ...note, content: sanitizeHtml(note.content), tagIds: note.tagIds ?? [] });
      }
    } catch {
      // Skip individual unreadable notes rather than failing the whole import.
    }
  }

  const attachments: AttachmentMeta[] = [];
  const attachmentFiles = zip.folder("attachments")?.file(/[0-9a-z-]+\.json$/i) ?? [];
  for (const attachmentFile of attachmentFiles) {
    if (attachmentFile.name.endsWith("index.json")) continue;
    try {
      const meta = JSON.parse(await attachmentFile.async("string")) as AttachmentMeta;
      if (meta?.id && meta.data) attachments.push(meta);
    } catch {
      /* ignore */
    }
  }

  return {
    manifest,
    notes,
    folders: (await readJson<Folder[]>(zip, "folders.json")) ?? [],
    tags: (await readJson<Tag[]>(zip, "tags.json")) ?? [],
    attachments,
    settings: await readJson<Record<string, unknown>>(zip, "settings.json"),
  };
}

export async function applyBackup(payload: BackupPayload, mode: "merge" | "replace"): Promise<void> {
  const d = db();
  await d.transaction("rw", d.notes, d.folders, d.tags, d.attachments, async () => {
    if (mode === "replace") {
      await Promise.all([d.notes.clear(), d.folders.clear(), d.tags.clear(), d.attachments.clear()]);
      await d.folders.bulkPut(payload.folders);
      await d.tags.bulkPut(payload.tags);
      await d.notes.bulkPut(payload.notes);
      await d.attachments.bulkPut(payload.attachments);
      return;
    }

    for (const folder of payload.folders) {
      if (!(await d.folders.get(folder.id))) await d.folders.put(folder);
    }
    for (const tag of payload.tags) {
      if (!(await d.tags.get(tag.id))) await d.tags.put(tag);
    }
    for (const note of payload.notes) {
      const existing = await d.notes.get(note.id);
      // Deterministic conflict handling: newest updatedAt wins.
      if (!existing || note.updatedAt > existing.updatedAt) await d.notes.put(note);
    }
    for (const attachment of payload.attachments) {
      if (!(await d.attachments.get(attachment.id))) await d.attachments.put(attachment);
    }
  });
}

export async function recordBackup(
  source: "local" | "google-drive",
  status: "success" | "failed",
  noteCount: number,
  message?: string,
): Promise<void> {
  await db().backups.put({
    id: newId(),
    createdAt: Date.now(),
    source,
    status,
    noteCount,
    ...(message ? { message } : {}),
  });
}
