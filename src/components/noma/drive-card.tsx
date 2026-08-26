import {
  AlertTriangle,
  Check,
  CloudUpload,
  HardDriveDownload,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { applyBackup, type BackupPayload } from "@/lib/noma/backup";
import {
  backupNow,
  connectDrive,
  disconnectDrive,
  fetchDriveBackup,
  getConnection,
  hasUnbackedChanges,
  isDriveConfigured,
  listDriveBackups,
  type DriveBackupFile,
  type DriveConnection,
} from "@/lib/noma/drive";

type Status =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "success"; label: string; detail?: string }
  | { kind: "failed"; label: string };

function relative(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(timestamp).toLocaleString();
}

function formatSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const fade = "animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none";
const tap = "transition-transform active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100";

export function DriveCard({
  autoBackup,
  onAutoBackupChange,
  onRestored,
}: {
  autoBackup: boolean;
  onAutoBackupChange: (value: boolean) => void;
  onRestored?: () => void;
}) {
  const [connection, setConnection] = useState<DriveConnection | null>(() =>
    typeof window === "undefined" ? null : getConnection(),
  );
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [connecting, setConnecting] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [justConnected, setJustConnected] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreFiles, setRestoreFiles] = useState<DriveBackupFile[] | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [preview, setPreview] = useState<{ file: DriveBackupFile; payload: BackupPayload } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFailure = useCallback((error: unknown, label: string) => {
    const message = error instanceof Error ? error.message : label;
    if (error && typeof error === "object" && "needsReconnect" in error && error.needsReconnect) {
      setNeedsReconnect(true);
    }
    setStatus({ kind: "failed", label: message });
  }, []);

  const runBackup = useCallback(
    async (silent = false) => {
      setStatus({ kind: "working", label: silent ? "Backing up…" : "Preparing backup…" });
      try {
        const { connection: next, manifest } = await backupNow();
        setConnection(next);
        setNeedsReconnect(false);
        setStatus({
          kind: "success",
          label: "Backup completed",
          detail: `${manifest.noteCount} note${manifest.noteCount === 1 ? "" : "s"} backed up just now.`,
        });
      } catch (error) {
        handleFailure(error, "Backup couldn't be completed.");
      }
    },
    [handleFailure],
  );

  // Automatic backup: batched, and skipped entirely when nothing changed.
  useEffect(() => {
    if (!autoBackup || !connection || needsReconnect) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        if (await hasUnbackedChanges()) await runBackup(true);
      } catch {
        /* auto-backup never interrupts writing */
      }
    };
    autoTimer.current = setTimeout(() => void tick(), 60_000);
    const interval = setInterval(() => void tick(), 15 * 60_000);
    return () => {
      cancelled = true;
      if (autoTimer.current) clearTimeout(autoTimer.current);
      clearInterval(interval);
    };
  }, [autoBackup, connection, needsReconnect, runBackup]);

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    setStatus({ kind: "idle" });
    try {
      setConnection(await connectDrive());
      setNeedsReconnect(false);
      setJustConnected(true);
      setTimeout(() => setJustConnected(false), 2500);
      toast.success("Google Drive connected ✓");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Google Drive authorization wasn't completed.";
      setConnectError(message);
      toast.error(message);
    } finally {
      setConnecting(false);
    }
  }


  async function openRestore() {
    setRestoreOpen(true);
    setPreview(null);
    setRestoreFiles(null);
    setRestoreLoading(true);
    try {
      setRestoreFiles(await listDriveBackups());
    } catch (error) {
      setRestoreOpen(false);
      handleFailure(error, "Couldn't list your Drive backups.");
    } finally {
      setRestoreLoading(false);
    }
  }

  async function loadPreview(file: DriveBackupFile) {
    setRestoreLoading(true);
    try {
      const payload = await fetchDriveBackup(file.id);
      setPreview({ file, payload });
    } catch (error) {
      handleFailure(error, "That backup couldn't be read.");
      toast.error(error instanceof Error ? error.message : "That backup couldn't be read.");
    } finally {
      setRestoreLoading(false);
    }
  }

  async function runRestore(mode: "merge" | "replace") {
    if (!preview) return;
    setRestoring(true);
    try {
      await applyBackup(preview.payload, mode);
      setRestoreOpen(false);
      setPreview(null);
      setConfirmReplace(false);
      toast.success(mode === "merge" ? "Backup merged into your library" : "Library replaced from backup");
      onRestored?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  if (!isDriveConfigured) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-serif text-base font-medium">Google Drive</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional. Add <code className="text-xs">googleDriveClientId</code> (a Google Cloud OAuth 2.0 <em>Web</em>{" "}
          client ID) in <code className="text-xs">src/config/firebaseConfig.ts</code> to enable Drive backups. It is
          separate from Firebase Google Sign-In.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-serif text-base font-medium">Google Drive</h3>
          {connection ? (
            <p className={`mt-1 flex items-center gap-1.5 text-sm ${justConnected ? fade : ""}`}>
              <Check className="size-4 text-emerald-600" aria-hidden="true" />
              <span className="font-medium">Connected</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Not connected</p>
          )}
        </div>
        <ShieldCheck className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {connection
          ? "Your Noma backups are stored in your own Google Drive, in a folder called “Noma Backups”."
          : "Keep a secure backup of your Noma library in your own Google Drive. Noma asks only for permission to manage the backup files it creates — never your whole Drive."}
      </p>

      {connection?.email && (
        <p className="mt-2 text-sm text-muted-foreground">
          Account: <span className="text-foreground">{connection.email}</span>
        </p>
      )}

      {connection && (
        <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
          {status.kind === "working" ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> {status.label}
            </span>
          ) : status.kind === "failed" ? (
            <span className="inline-flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="size-3.5" aria-hidden="true" /> {status.label}
            </span>
          ) : status.kind === "success" ? (
            <span className={`inline-flex items-center gap-1.5 text-emerald-600 ${fade}`}>
              <Check className="size-3.5" aria-hidden="true" /> {status.label}
              {status.detail ? ` — ${status.detail}` : ""}
            </span>
          ) : connection.lastBackupAt ? (
            `Last backup: ${relative(connection.lastBackupAt)}`
          ) : (
            "No backup yet"
          )}
        </p>
      )}

      {needsReconnect && (
        <p className={`mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm ${fade}`}>
          Google Drive needs to be connected again.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!connection || needsReconnect ? (
          <Button className={`h-11 gap-2 ${tap}`} disabled={connecting} onClick={() => void handleConnect()}>
            {connecting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CloudUpload className="size-4" aria-hidden="true" />}
            {connecting ? "Connecting…" : needsReconnect ? "Reconnect Google Drive" : "Connect Google Drive"}
          </Button>
        ) : null}

        {connection && !needsReconnect && (
          <>
            <Button
              className={`h-11 gap-2 ${tap}`}
              disabled={status.kind === "working"}
              onClick={() => void runBackup()}
            >
              <CloudUpload className="size-4" aria-hidden="true" /> Backup now
            </Button>
            <Button variant="outline" className={`h-11 gap-2 ${tap}`} onClick={() => void openRestore()}>
              <HardDriveDownload className="size-4" aria-hidden="true" /> Restore backup
            </Button>
          </>
        )}

        {status.kind === "failed" && connection && !needsReconnect && (
          <Button variant="outline" className={`h-11 gap-2 ${tap}`} onClick={() => void runBackup()}>
            <RefreshCw className="size-4" aria-hidden="true" /> Try again
          </Button>
        )}

        {connection && (
          <Button variant="ghost" className="h-11" onClick={() => setConfirmDisconnect(true)}>
            Disconnect
          </Button>
        )}
      </div>

      {connection && !needsReconnect && (
        <div className={`mt-5 flex items-center justify-between gap-4 border-t border-border pt-4 ${fade}`}>
          <div>
            <Label htmlFor="noma-auto-backup">Automatic backup</Label>
            <p className="text-xs text-muted-foreground">
              Uploads after meaningful changes only — never continuously, and never while you type.
            </p>
          </div>
          <Switch id="noma-auto-backup" checked={autoBackup} onCheckedChange={onAutoBackupChange} />
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Your notes are stored locally on this device. Google Drive is optional — when connected, Noma backs up your data
        to your own Google Drive, and Noma never stores it anywhere else.
      </p>

      {/* Restore flow */}
      <Dialog open={restoreOpen} onOpenChange={(open) => !open && (setRestoreOpen(false), setPreview(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {preview ? "Restore preview" : "Restore from Google Drive"}
            </DialogTitle>
            <DialogDescription>
              {preview
                ? "Choose how this backup should meet your local notes."
                : "Only Noma backups from your “Noma Backups” folder are listed."}
            </DialogDescription>
          </DialogHeader>

          {restoreLoading && (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
            </p>
          )}

          {!restoreLoading && !preview && (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {(restoreFiles ?? []).length === 0 && (
                <li className="py-4 text-sm text-muted-foreground">No Noma backups found in your Drive yet.</li>
              )}
              {(restoreFiles ?? []).map((file) => (
                <li key={file.id}>
                  <button
                    type="button"
                    onClick={() => void loadPreview(file)}
                    className={`w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50 ${tap}`}
                  >
                    <span className="block text-sm font-medium">{new Date(file.modifiedTime).toLocaleString()}</span>
                    <span className="block text-xs text-muted-foreground">
                      {file.name}
                      {formatSize(file.size) ? ` · ${formatSize(file.size)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!restoreLoading && preview && (
            <div className={`space-y-1 text-sm text-muted-foreground ${fade}`}>
              <p className="text-foreground">{new Date(preview.payload.manifest.createdAt).toLocaleString()}</p>
              <p>Notes: {preview.payload.manifest.noteCount}</p>
              <p>Folders: {preview.payload.manifest.folderCount}</p>
              <p>Tags: {preview.payload.manifest.tagCount}</p>
              <p>Attachments: {preview.payload.manifest.attachmentCount}</p>
              <p className="pt-2 text-xs">
                Backup format v{preview.payload.manifest.backupFormatVersion} · Noma{" "}
                {preview.payload.manifest.nomaVersion}
              </p>
            </div>
          )}

          {preview && (
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" disabled={restoring} onClick={() => void runRestore("merge")}>
                  {restoring && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Merge
                </Button>
                <Button variant="destructive" disabled={restoring} onClick={() => setConfirmReplace(true)}>
                  Replace
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Replace local notes?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything currently on this device will be replaced by this backup. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runRestore("replace")}>Replace library</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Disconnect Google Drive?</AlertDialogTitle>
            <AlertDialogDescription>
              Your local Noma notes will remain on this device, and your existing Drive backups are kept.
              Disconnecting only stops Noma from accessing your Drive for backups.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connected</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await disconnectDrive();
                setConnection(null);
                setNeedsReconnect(false);
                setStatus({ kind: "idle" });
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
