import { type NomaDatabase, newId } from "./db";
import type { AttachmentMeta } from "./types";

export interface CompressedImage {
  dataUrl: string;
  mimeType: string;
  size: number;
}

export async function compressAndResizeImage(
  file: File,
  maxWidth = 1920,
  maxHeight = 1920,
  quality = 0.85,
): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Selected file is not an image"));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image format"));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get 2d canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        let outputMime = file.type;
        if (!["image/jpeg", "image/png", "image/webp"].includes(outputMime)) {
          outputMime = "image/jpeg";
        }

        try {
          const dataUrl = canvas.toDataURL(outputMime, quality);
          const base64Len = dataUrl.split(",")[1]?.length ?? 0;
          const size = Math.round((base64Len * 3) / 4);

          resolve({ dataUrl, mimeType: outputMime, size });
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export async function saveImageAttachment(
  db: NomaDatabase,
  noteId: string,
  file: File,
): Promise<AttachmentMeta> {
  const compressed = await compressAndResizeImage(file);
  const attachment: AttachmentMeta = {
    id: newId(),
    noteId,
    name: file.name || "image.png",
    mimeType: compressed.mimeType,
    size: compressed.size,
    createdAt: Date.now(),
    data: compressed.dataUrl,
  };
  await db.attachments.put(attachment);
  return attachment;
}

/**
 * Scans all notes in IndexedDB for attachment references (`noma-attachment://<id>` or `data-attachment-id="<id>"`).
 * Deletes any attachment records in `db.attachments` that are no longer referenced by any note.
 */
export async function cleanupOrphanedAttachments(db: NomaDatabase): Promise<number> {
  const [notes, attachments] = await Promise.all([db.notes.toArray(), db.attachments.toArray()]);

  if (attachments.length === 0) return 0;

  const referencedIds = new Set<string>();
  const attachmentRegex = /(?:noma-attachment:\/\/|data-attachment-id=["'])([a-zA-Z0-9_-]+)/g;

  for (const note of notes) {
    if (!note.content) continue;
    let match: RegExpExecArray | null;
    while ((match = attachmentRegex.exec(note.content)) !== null) {
      if (match[1]) referencedIds.add(match[1]);
    }
  }

  const orphaned = attachments.filter((att) => !referencedIds.has(att.id));
  if (orphaned.length === 0) return 0;

  await db.attachments.bulkDelete(orphaned.map((a) => a.id));
  return orphaned.length;
}

let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedules a debounced orphan attachment reconciliation run.
 * Avoids executing full IndexedDB scans on every single keystroke.
 */
export function scheduleDebouncedAttachmentCleanup(db: NomaDatabase, delayMs = 3000): void {
  if (cleanupTimer) clearTimeout(cleanupTimer);
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    cleanupOrphanedAttachments(db).catch((err) => {
      console.error("Debounced attachment cleanup failed", err);
    });
  }, delayMs);
}
