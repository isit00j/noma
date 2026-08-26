import { googleDriveClientId } from "../firebase";
import { backupFileName, buildBackupZip, readBackupZip, recordBackup, type BackupPayload } from "./backup";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const BACKUP_NAME = "Noma-Backup.zip";
const STATE_KEY = "noma.drive.connection";

export const isDriveConfigured = Boolean(googleDriveClientId);

export interface DriveConnection {
  email: string | null;
  connectedAt: number;
  lastBackupAt: number | null;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

export class DriveError extends Error {}

/** Short-lived token, memory only — never persisted. */
let accessToken: string | null = null;
let tokenExpiresAt = 0;

export function getConnection(): DriveConnection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as DriveConnection) : null;
  } catch {
    return null;
  }
}

function setConnection(connection: DriveConnection | null) {
  if (typeof window === "undefined") return;
  if (connection) window.localStorage.setItem(STATE_KEY, JSON.stringify(connection));
  else window.localStorage.removeItem(STATE_KEY);
}

async function loadGis(): Promise<void> {
  if (typeof window === "undefined") throw new DriveError("Google Drive is only available in the browser.");
  if (window.google?.accounts?.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new DriveError("Couldn't reach Google. Check your connection and try again."));
    document.head.appendChild(script);
  });
}

async function authorize(prompt?: string): Promise<string> {
  if (!googleDriveClientId) {
    throw new DriveError(
      "Google Drive backup isn't configured yet. Add VITE_GOOGLE_CLIENT_ID to enable it.",
    );
  }
  const clientId: string = googleDriveClientId;
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  await loadGis();

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      ...(prompt ? { prompt } : {}),
      callback: (response) => {
        if (!response.access_token) {
          reject(new DriveError("Google Drive authorization was not completed."));
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + 50 * 60 * 1000;
        resolve(response.access_token);
      },
    });
    client.requestAccessToken(prompt ? { prompt } : undefined);
  });
}

async function driveFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`https://www.googleapis.com/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (response.status === 401 || response.status === 403) {
    accessToken = null;
    tokenExpiresAt = 0;
    throw new DriveError("Google Drive access expired. Please reconnect Google Drive.");
  }
  if (!response.ok) {
    throw new DriveError(`Google Drive request failed (${response.status}): ${await response.text()}`);
  }
  return response;
}

export async function connectDrive(): Promise<DriveConnection> {
  const token = await authorize("consent");
  let email: string | null = null;
  try {
    const info = await driveFetch("drive/v3/about?fields=user(emailAddress)", token);
    email = ((await info.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? null;
  } catch {
    email = null;
  }
  const connection: DriveConnection = {
    email,
    connectedAt: Date.now(),
    lastBackupAt: getConnection()?.lastBackupAt ?? null,
  };
  setConnection(connection);
  return connection;
}

export async function disconnectDrive(): Promise<void> {
  if (accessToken && typeof window !== "undefined" && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  tokenExpiresAt = 0;
  setConnection(null);
}

async function findBackupFileId(token: string): Promise<string | null> {
  const query = encodeURIComponent(`name='${BACKUP_NAME}' and trashed=false`);
  const response = await driveFetch(`drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&spaces=drive`, token);
  const data = (await response.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
}

export async function backupNow(): Promise<DriveConnection> {
  const token = await authorize();
  const { blob, payload } = await buildBackupZip();
  const existingId = await findBackupFileId(token);

  const metadata = { name: BACKUP_NAME, mimeType: "application/zip", description: backupFileName() };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob);

  try {
    await driveFetch(
      existingId
        ? `upload/drive/v3/files/${existingId}?uploadType=multipart`
        : "upload/drive/v3/files?uploadType=multipart",
      token,
      { method: existingId ? "PATCH" : "POST", body: form },
    );
  } catch (error) {
    await recordBackup("google-drive", "failed", payload.notes.length, (error as Error).message);
    throw error;
  }

  const connection: DriveConnection = {
    email: getConnection()?.email ?? null,
    connectedAt: getConnection()?.connectedAt ?? Date.now(),
    lastBackupAt: Date.now(),
  };
  setConnection(connection);
  await recordBackup("google-drive", "success", payload.notes.length);
  return connection;
}

export async function fetchDriveBackup(): Promise<BackupPayload> {
  const token = await authorize();
  const fileId = await findBackupFileId(token);
  if (!fileId) throw new DriveError("No Noma backup was found in this Google Drive account.");
  const response = await driveFetch(`drive/v3/files/${fileId}?alt=media`, token);
  return readBackupZip(await response.blob());
}
