import { Capacitor, registerPlugin } from "@capacitor/core";

interface NomaBackupPlugin {
  save(options: { fileName: string; base64: string }): Promise<{ path: string }>;
}

const NomaBackup = registerPlugin<NomaBackupPlugin>("NomaBackup");

/**
 * Saves a backup to the Android shared Noma folder.
 * Returns false on web/non-Android so callers can keep the browser download flow.
 */
export async function saveAndroidBackup(blob: Blob, fileName: string): Promise<boolean> {
  if (Capacitor.getPlatform() !== "android") return false;

  const base64 = arrayBufferToBase64(await blob.arrayBuffer());
  await NomaBackup.save({ fileName, base64 });
  return true;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
