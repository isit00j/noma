import { registerPlugin } from "@capacitor/core";

export interface NomaBackupPluginInterface {
  ensureStorageAccess(): Promise<{ granted: boolean }>;
  startSaveSession(): Promise<{ sessionId: string }>;
  appendChunk(options: { sessionId: string; chunkBase64: string }): Promise<{ success: boolean }>;
  finalizeSave(options: {
    sessionId: string;
    fileName: string;
  }): Promise<{ saved: boolean; fileName: string; path: string; fullDisplayPath: string }>;
  cancelSaveSession(options: { sessionId: string }): Promise<{ cancelled: boolean }>;
}

const NomaBackup = registerPlugin<NomaBackupPluginInterface>("NomaBackup");

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const subArray = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(subArray));
  }
  return btoa(binary);
}

export async function exportBackupAndroid(
  blob: Blob,
  fileName: string,
): Promise<{ saved: boolean; fileName: string; path: string; fullDisplayPath: string }> {
  const access = await NomaBackup.ensureStorageAccess();
  if (!access || !access.granted) {
    throw new Error("Storage access permission was not granted.");
  }

  const { sessionId } = await NomaBackup.startSaveSession();

  try {
    const CHUNK_SIZE = 512 * 1024; // 512 KB
    let offset = 0;

    while (offset < blob.size) {
      const slice = blob.slice(offset, offset + CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      const chunkBase64 = arrayBufferToBase64(buffer);

      await NomaBackup.appendChunk({ sessionId, chunkBase64 });
      offset += CHUNK_SIZE;
    }

    return await NomaBackup.finalizeSave({ sessionId, fileName });
  } catch (error) {
    try {
      await NomaBackup.cancelSaveSession({ sessionId });
    } catch {
      // Ignore cleanup error if session cancellation fails
    }
    throw error;
  }
}
