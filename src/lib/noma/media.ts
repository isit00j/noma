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
