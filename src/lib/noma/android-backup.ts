import { Capacitor } from "@capacitor/core";

/**
 * Saves a backup in a user-visible location on Android.
 *
 * Android uses the system DocumentsUI so the user explicitly chooses the
 * destination. The suggested path is Internal storage/Noma/<file>, while
 * browsers continue to use the normal download flow.
 */
export async function saveAndroidBackup(blob: Blob, fileName: string): Promise<boolean> {
  if (Capacitor.getPlatform() !== "android") return false;

  const data = await blob.arrayBuffer();
  const base64 = arrayBufferToBase64(data);

  // The native bridge is implemented by the Android project. Keeping this
  // call behind the platform check means the web/PWA build remains unchanged.
  await Capacitor.Plugins.NomaBackup?.save({
    fileName,
    base64,
    suggestedDirectory: "Noma",
  });

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
