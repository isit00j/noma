import { googleDriveClientId } from "../firebase";
import { buildBackupZip, readBackupZip, recordBackup, type BackupPayload } from "./backup";
import type { BackupManifest } from "./types";

/** Narrowest scope that still lets Noma manage only the files it creates. */
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "Noma Backups";
const STATE_KEY = "noma.drive.connection";

export const isDriveConfigured = Boolean(googleDriveClientId);

export interface DriveConnection {
  email: string | null;
  connectedAt: number;
  lastBackupAt: number | null;
  /** Cached so Noma never has to scan the user's Drive. */
  folderId: string | null;
  /** Fingerprint of the local library at the last successful backup. */
  lastSignature: string | null;
}

export interface DriveBackupFile {
  id: string;
  name: string;
  modifiedTime: number;
  size: number | null;
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
            callback: (response: { access_token?: string; error?: string; error_description?: string }) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

export class DriveError extends Error {
  /** True when the user must re-authorize before Drive works again. */
  needsReconnect: boolean;
  constructor(message: string, needsReconnect = false) {
    super(message);
    this.needsReconnect = needsReconnect;
  }
}

/** Short-lived token, memory only — never persisted, never logged. */
let accessToken: string | null = null;
let tokenExpiresAt = 0;

export function backupObjectName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Noma-Backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(
    date.getHours(),
  )}-${pad(date.getMinutes())}.zip`;
}

export function getConnection(): DriveConnection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DriveConnection>;
    return {
      email: parsed.email ?? null,
      connectedAt: parsed.connectedAt ?? Date.now(),
      lastBackupAt: parsed.lastBackupAt ?? null,
      folderId: parsed.folderId ?? null,
      lastSignature: parsed.lastSignature ?? null,
    };
  } catch {
    return null;
  }
}

function setConnection(connection: DriveConnection | null): DriveConnection | null {
  if (typeof window === "undefined") return connection;
  if (connection) window.localStorage.setItem(STATE_KEY, JSON.stringify(connection));
  else window.localStorage.removeItem(STATE_KEY);
  return connection;
}

function patchConnection(patch: Partial<DriveConnection>): DriveConnection {
  const base = getConnection() ?? {
    email: null,
    connectedAt: Date.now(),
    lastBackupAt: null,
    folderId: null,
    lastSignature: null,
  };
  return setConnection({ ...base, ...patch })!;
}

async function loadGis(): Promise<void> {
  if (typeof window === "undefined") throw new DriveError("Google Drive is only available in the browser.");
  if (window.google?.accounts?.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    const script = existing ?? document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new DriveError("Couldn't reach Google. Check your connection and try again."));
    if (!existing) document.head.appendChild(script);
  });
  if (!window.google?.accounts?.oauth2) {
    throw new DriveError("Google authorization couldn't start. Reload Noma and try again.");
  }
}

function authorizeErrorMessage(code?: string, description?: string): string {
  switch (code) {
    case "popup_closed":
    case "user_cancel":
    case "access_denied":
      return "Authorization was cancelled. Google Drive is still not connected.";
    case "popup_failed_to_open":
      return "Your browser blocked the Google window. Allow pop-ups for Noma, then try again.";
    case "idpiframe_initialization_failed":
      return "Google couldn't start authorization in this browser. Try again in a normal browser tab.";
    case "invalid_client":
      return "The Google Drive client ID looks invalid. Check googleDriveClientId in src/config/firebaseConfig.ts.";
    case "unauthorized_client":
    case "redirect_uri_mismatch":
      return "This domain isn't authorized for the Google Drive client. Add it in Google Cloud → Credentials.";
    default:
      return description
        ? `Google Drive authorization failed: ${description}`
        : "Google Drive authorization wasn't completed.";
  }
}

async function authorize(prompt?: string): Promise<string> {
  if (!googleDriveClientId) {
    throw new DriveError(
      "Google Drive backup isn't configured yet. Add googleDriveClientId in src/config/firebaseConfig.ts.",
    );
  }
  if (!prompt && accessToken && Date.now() < tokenExpiresAt) return accessToken;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new DriveError("You're offline. Noma keeps working locally — reconnect Drive when you're back online.");
  }
  await loadGis();
  const clientId: string = googleDriveClientId;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      ...(prompt ? { prompt } : {}),
      callback: (response) => {
        if (!response.access_token) {
          finish(() =>
            reject(new DriveError(authorizeErrorMessage(response.error, response.error_description), true)),
          );
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + 50 * 60 * 1000;
        finish(() => resolve(response.access_token!));
      },
      error_callback: (error) => {
        finish(() => reject(new DriveError(authorizeErrorMessage(error.type, error.message), true)));
      },
    });
    client.requestAccessToken(prompt ? { prompt } : undefined);
  });
}

async function driveFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`https://www.googleapis.com/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
  } catch {
    throw new DriveError("Couldn't reach Google Drive. Check your connection and try again.");
  }
  if (response.status === 401 || response.status === 403) {
    const body = await response.text();
    accessToken = null;
    tokenExpiresAt = 0;
    if (/rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(body)) {
      throw new DriveError("Google Drive is rate-limiting Noma right now. Try again in a minute.");
    }
    throw new DriveError("Google Drive needs to be connected again.", true);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new DriveError("Google Drive is temporarily unavailable. Your notes are safe on this device — try again.");
  }
  if (!response.ok) {
    throw new DriveError("Google Drive couldn't complete that request. Please try again.");
  }
  return response;
}

/** Finds (or creates once) the dedicated Noma Backups folder and caches its id. */
async function ensureFolder(token: string): Promise<string> {
  const cached = getConnection()?.folderId;
  if (cached) {
    try {
      await driveFetch(`drive/v3/files/${cached}?fields=id,trashed`, token);
      return cached;
    } catch (error) {
      if (error instanceof DriveError && error.needsReconnect) throw error;
    }
  }
  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
  );
  const found = (await (
    await driveFetch(`drive/v3/files?q=${query}&fields=files(id)&spaces=drive&pageSize=1`, token)
  ).json()) as { files?: Array<{ id: string }> };
  let folderId = found.files?.[0]?.id ?? null;
  if (!folderId) {
    const created = (await (
      await driveFetch("drive/v3/files?fields=id", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
      })
    ).json()) as { id: string };
    folderId = created.id;
  }
  patchConnection({ folderId });
  return folderId;
}

export async function connectDrive(): Promise<DriveConnection> {
  const token = await authorize("consent");
  let email: string | null = null;
  try {
    const info = await driveFetch("drive/v3/about?fields=user(emailAddress)", token);
    email = ((await info.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? null;
  } catch (error) {
    if (error instanceof DriveError && error.needsReconnect) throw error;
  }
  const folderId = await ensureFolder(token);
  return patchConnection({ email, connectedAt: Date.now(), folderId });
}

export async function disconnectDrive(): Promise<void> {
  if (accessToken && typeof window !== "undefined" && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(accessToken);
    } catch {
      /* ignore */
    }
  }
  accessToken = null;
  tokenExpiresAt = 0;
  setConnection(null);
}

export async function listDriveBackups(): Promise<DriveBackupFile[]> {
  const token = await authorize();
  const folderId = await ensureFolder(token);
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const data = (await (
    await driveFetch(
      `drive/v3/files?q=${query}&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime desc&pageSize=20`,
      token,
    )
  ).json()) as { files?: Array<{ id: string; name: string; size?: string; modifiedTime: string }> };
  return (data.files ?? [])
    .filter((file) => file.name.startsWith("Noma-Backup") && file.name.endsWith(".zip"))
    .map((file) => ({
      id: file.id,
      name: file.name,
      modifiedTime: new Date(file.modifiedTime).getTime(),
      size: file.size ? Number(file.size) : null,
    }));
}

export async function backupNow(): Promise<{ connection: DriveConnection; manifest: BackupManifest }> {
  const token = await authorize();
  const folderId = await ensureFolder(token);
  const { blob, payload } = await buildBackupZip();

  const metadata = { name: backupObjectName(), mimeType: "application/zip", parents: [folderId] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob);

  try {
    await driveFetch("upload/drive/v3/files?uploadType=multipart&fields=id", token, { method: "POST", body: form });
  } catch (error) {
    await recordBackup("google-drive", "failed", payload.notes.length, (error as Error).message);
    throw error;
  }

  const connection = patchConnection({
    lastBackupAt: Date.now(),
    folderId,
    lastSignature: await librarySignature(),
  });
  await recordBackup("google-drive", "success", payload.notes.length);
  return { connection, manifest: payload.manifest };
}

export async function fetchDriveBackup(fileId: string): Promise<BackupPayload> {
  const token = await authorize();
  const response = await driveFetch(`drive/v3/files/${fileId}?alt=media`, token);
  return readBackupZip(await response.blob());
}

/** Cheap fingerprint of the local library, used to skip redundant uploads. */
export async function librarySignature(): Promise<string> {
  const { db } = await import("./db");
  const d = db();
  const [notes, folders, tags, attachments] = await Promise.all([
    d.notes.toArray(),
    d.folders.count(),
    d.tags.count(),
    d.attachments.count(),
  ]);
  const latest = notes.reduce((max, note) => Math.max(max, note.updatedAt), 0);
  return `${notes.length}:${folders}:${tags}:${attachments}:${latest}`;
}

export async function hasUnbackedChanges(): Promise<boolean> {
  const connection = getConnection();
  if (!connection) return false;
  return (await librarySignature()) !== connection.lastSignature;
}
