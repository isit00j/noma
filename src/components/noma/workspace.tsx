import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Check,
  Hash,
  Menu,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { toast } from "sonner";
import { format } from "date-fns";
import { Bell } from "lucide-react";
import { NoteEditor, type SaveState } from "./note-editor";
import { NoteReadView } from "./note-read-view";
import { NoteList, type NoteActions } from "./note-list";
import { PromptDialog, type PromptRequest } from "./prompt-dialog";
import { ReminderDialog } from "./reminder-dialog";
import { RemindersView } from "./reminders-view";
import { NomaSidebar } from "./sidebar";
import { Button } from "@/components/ui/button";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useOnline, useSettings } from "@/hooks/use-noma";
import { useDatabase } from "@/lib/noma/DatabaseContext";
import { useAppLock } from "@/lib/noma/AppLockContext";
import { usePendingShortcut } from "@/lib/noma/shortcut";
import {
  createFolder,
  createNote,
  createTag,
  deleteFolder,
  deleteNoteForever,
  deleteNoteReminder,
  deleteTag,
  duplicateNote,
  emptyTrash,
  moveNote,
  notePreview,
  noteTitle,
  renameFolder,
  renameTag,
  restoreNote,
  setArchived,
  setNoteReminder,
  setNoteTags,
  toggleFavorite,
  togglePinned,
  trashNote,
  updateNote,
  cleanupOrphanedReminders,
} from "@/lib/noma/notes";
import { highlightTerms, searchNotes } from "@/lib/noma/search";
// TEMP-PERF: baseline instrumentation (remove with perf-instrumentation.ts).
import { pmark, pmarkPaint, pmeasure } from "@/lib/noma/perf-instrumentation";
// TEMP-PERF: automated benchmark (remove with perf-instrumentation.ts).
import { makeAutoEnv, PERF_ENABLED, setLastAutoReport } from "@/lib/noma/perf-instrumentation";
import {
  autoBenchmarkQueryParam,
  blockedAutoReport,
  consumeAutoBenchmarkRequest,
  runAutomatedBenchmark,
  writeAutoReportFile,
  writeTriggerReceipt,
  type AutoBenchmarkDriver,
} from "@/lib/noma/perf-automation";
import type { Folder, Note, Reminder, Tag } from "@/lib/noma/types";
import { filterNotes, viewTitle, type ViewState } from "@/lib/noma/view";
import { cn } from "@/lib/utils";

interface Confirmation {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void | Promise<void>;
}

interface NoteOverflowMenuProps {
  note: Note;
  tags: Tag[];
  folders: Folder[];
  onCreateTag: () => void;
  onToggleTag: (tagId: string, checked: boolean) => void;
  onMoveToFolder: (folderId: string | null) => void;
  onSetReminder: () => void;
  onDuplicate: () => void;
  onToggleArchive: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDeleteForever: () => void;
}

/**
 * Secondary note actions (tags, folder, reminder, duplicate, archive, trash)
 * shared by the Read View and editor headers so both stay in sync.
 */
function NoteOverflowMenu({
  note,
  tags,
  folders,
  onCreateTag,
  onToggleTag,
  onMoveToFolder,
  onSetReminder,
  onDuplicate,
  onToggleArchive,
  onTrash,
  onRestore,
  onDeleteForever,
}: NoteOverflowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Note options">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {note.deleted ? (
          <>
            <DropdownMenuItem onClick={onRestore}>
              <RotateCcw className="size-4" /> Restore
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDeleteForever}
            >
              <Trash2 className="size-4" /> Delete permanently
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Tags
            </DropdownMenuLabel>
            {tags.length === 0 && (
              <DropdownMenuItem onClick={onCreateTag}>
                <Plus className="size-4" /> Create a tag
              </DropdownMenuItem>
            )}
            {tags.map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag.id}
                checked={note.tagIds.includes(tag.id)}
                onCheckedChange={(checked) => onToggleTag(tag.id, checked)}
              >
                <Hash className="size-3.5" /> {tag.name}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Folder
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onMoveToFolder(null)}>
              {note.folderId === null && <Check className="size-4" />} No folder
            </DropdownMenuItem>
            {folders.map((folder) => (
              <DropdownMenuItem key={folder.id} onClick={() => onMoveToFolder(folder.id)}>
                {note.folderId === folder.id && <Check className="size-4" />} {folder.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSetReminder}>
              <Bell className="size-4 text-primary" />
              {note.reminderAt ? "Edit Reminder" : "Set Reminder"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleArchive}>
              {note.archived ? "Unarchive" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onTrash}>
              <Trash2 className="size-4" /> Move to Trash
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Workspace() {
  const { db, loading: dbLoading } = useDatabase();
  const notes = useLiveQuery(() => db?.notes.toArray() ?? [], [db], undefined);
  const folders = useLiveQuery(() => db?.folders.orderBy("name").toArray() ?? [], [db], undefined);
  const tags = useLiveQuery(() => db?.tags.orderBy("name").toArray() ?? [], [db], undefined);
  const reminders = useLiveQuery(() => db?.reminders.toArray() ?? [], [db], undefined);
  // Note IDs whose pending reminder hands off to the device Clock app.
  const phoneAlarmNoteIds = useMemo(
    () =>
      new Set(
        (reminders ?? [])
          .filter((r) => r.alertType === "phone-alarm" && r.status === "pending")
          .map((r) => r.noteId),
      ),
    [reminders],
  );
  const { settings, update: updateSettings } = useSettings();
  const online = useOnline();
  const { isLocked, isLockStateResolving } = useAppLock();
  // TEMP-PERF: shortcutEnv carries the autoperf deep-link environment tag.
  const { action: shortcutAction, shortcutEnv, consumeShortcut } = usePendingShortcut();
  const navigate = useNavigate();

  const [view, setView] = useState<ViewState>({ kind: "all" });
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  /** Whether the open note is shown in the Read View or the editor. */
  const [noteMode, setNoteMode] = useState<"read" | "edit">("read");
  /** Where back navigation from the editor should land. */
  const [editReturnTo, setEditReturnTo] = useState<"read" | "list">("read");
  const [draft, setDraft] = useState<{ id: string; title?: string; content?: string } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  // TEMP-PERF: one-shot startup marks.
  const perfStartupMarked = useRef(false);
  // TEMP-PERF: automated benchmark state (remove with perf-instrumentation.ts).
  const [autoProgress, setAutoProgress] = useState<string | null>(null);
  const autoStarted = useRef(false);
  const notesRef = useRef<Note[] | undefined>(undefined);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    if (perfStartupMarked.current || dbLoading || !db || notes === undefined) return;
    perfStartupMarked.current = true;
    pmark("notes-loaded");
    // TEMP-PERF: paint-dependent measures must be computed after the paint
    // mark lands — measuring synchronously here would record nothing.
    pmarkPaint("workspace-painted", () => {
      pmeasure("startup-js-to-workspace-painted", "js-bundle-start", "workspace-painted");
      pmeasure("startup-notes-loaded-to-painted", "notes-loaded", "workspace-painted");
    });
    pmeasure("startup-db-ready-to-notes-loaded", "db-ready", "notes-loaded");
  }, [dbLoading, db, notes]);
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [reminderTargetNote, setReminderTargetNote] = useState<Note | null>(null);

  useEffect(() => {
    if (db) {
      void cleanupOrphanedReminders(db);
    }
  }, [db]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Accumulates unsaved patches so back-navigation can flush them immediately
   * instead of racing the debounced autosave.
   */
  const pendingSaveRef = useRef<{
    id: string;
    patch: { title?: string; content?: string };
  } | null>(null);

  const allNotes = useMemo(() => notes ?? [], [notes]);
  const allFolders = useMemo(() => folders ?? [], [folders]);
  const allTags = useMemo(() => tags ?? [], [tags]);

  const visibleNotes = useMemo(() => filterNotes(allNotes, view), [allNotes, view]);
  const storedNote = allNotes.find((note) => note.id === activeNoteId) ?? null;
  const activeNote: Note | null =
    storedNote && draft?.id === storedNote.id ? { ...storedNote, ...draft } : storedNote;

  const flushSave = useCallback(
    async (id: string, patch: { title?: string; content?: string }) => {
      if (!db) return;
      try {
        // TEMP-PERF
        pmark("save-write-start");
        await updateNote(db!, id, patch);
        // TEMP-PERF
        pmark("save-write-end");
        pmeasure("save-dexie-write", "save-write-start", "save-write-end");
        pmeasure("save-keystroke-to-written", "save-keystroke", "save-write-end");
        pendingSaveRef.current = null;
        setSaveState(navigator.onLine ? "saved" : "offline");
      } catch {
        setSaveState("idle");
        toast.error("Noma couldn't save to this device's storage.");
      }
    },
    [db],
  );

  const handleChange = useCallback(
    (patch: { title?: string; content?: string }) => {
      if (!activeNoteId) return;
      // TEMP-PERF
      pmark("save-keystroke");
      setDraft((current) => ({
        ...(current?.id === activeNoteId ? current : { id: activeNoteId }),
        id: activeNoteId,
        ...patch,
      }));
      pendingSaveRef.current = {
        id: activeNoteId,
        patch: { ...pendingSaveRef.current?.patch, ...patch },
      };
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        if (pending) void flushSave(pending.id, pending.patch);
      }, 400);
    },
    [activeNoteId, flushSave],
  );

  /** Flush any pending autosave immediately (used before navigation). */
  const flushPendingSave = useCallback(async () => {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await flushSave(pending.id, pending.patch);
  }, [flushSave]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  /**
   * Tapping an existing note opens the dedicated Read View. Empty notes have
   * nothing to read, so they open directly in the editor instead.
   */
  const openNote = useCallback((note: Note) => {
    // TEMP-PERF
    pmark("note-open-tap");
    setDraft(null);
    setSaveState("idle");
    setActiveNoteId(note.id);
    const isEmpty = !note.title.trim() && !notePreview(note);
    setNoteMode(isEmpty ? "edit" : "read");
    setEditReturnTo(isEmpty ? "list" : "read");
    // TEMP-PERF: approximates read-view paint after state commit.
    pmarkPaint("read-view-painted", () => {
      pmeasure("note-open-tap-to-read-view-painted", "note-open-tap", "read-view-painted");
    });
  }, []);

  /** Enter the editor for the currently open note (from the Read View). */
  const openNoteForEdit = useCallback(() => {
    setEditReturnTo("read");
    setNoteMode("edit");
  }, []);

  /** Leave the open note entirely, flushing any pending save first. */
  const closeNote = useCallback(async () => {
    await flushPendingSave();
    setDraft(null);
    setSaveState("idle");
    setActiveNoteId(null);
    setNoteMode("read");
  }, [flushPendingSave]);

  // TEMP-PERF: automated benchmark trigger + runner (one-shot).
  // Triggers: /perf "Run Performance Benchmark" button (module flag),
  // `?autoperf=1` query param, or the `app.noma.notes://autoperf` deep link
  // (CI emulator). Never runs behind the App Lock screen.
  useEffect(() => {
    if (!PERF_ENABLED || !db || dbLoading || notes === undefined || isLockStateResolving) return;
    if (autoStarted.current) return;
    let env = consumeAutoBenchmarkRequest();
    if (!env) env = autoBenchmarkQueryParam();
    if (!env && shortcutAction === "autoperf") {
      env = makeAutoEnv(shortcutEnv ?? "device");
      consumeShortcut();
    }
    if (!env) return;
    autoStarted.current = true;
    // TEMP-PERF: breadcrumb for CI logcat diagnosis.
    console.log(`[autoperf] trigger seen, env=${env.label}`);
    // TEMP-PERF: receipt file so CI can tell "trigger never arrived"
    // apart from "benchmark started but produced no report".
    void writeTriggerReceipt(env);

    if (isLocked) {
      setLastAutoReport(
        blockedAutoReport(env, "Noma is locked (App Lock). Unlock Noma and run again."),
      );
      navigate({ to: "/perf" });
      return;
    }

    const driver: AutoBenchmarkDriver = {
      db,
      env,
      onProgress: (step) => setAutoProgress(step),
      getNotesCount: () => notesRef.current?.length ?? 0,
      openNewNoteInEditor: async () => {
        // Same code path as the New Note button, driven programmatically.
        pmark("new-note-tap");
        const note = await createNote(db, {});
        pmark("new-note-created");
        pmeasure("new-note-tap-to-created", "new-note-tap", "new-note-created");
        setDraft(null);
        setSaveState("idle");
        setActiveNoteId(note.id);
        setNoteMode("edit");
        setEditReturnTo("list");
        return note.id;
      },
      closeEditor: async () => {
        await closeNote();
      },
      deleteNoteById: async (id: string) => {
        await db.notes.delete(id);
      },
    };

    setAutoProgress("Starting automated benchmark…");
    void runAutomatedBenchmark(driver)
      .then(async (report) => {
        try {
          await writeAutoReportFile(report);
          // TEMP-PERF: breadcrumb for CI logcat diagnosis.
          console.log("[autoperf] report written");
        } catch (error) {
          console.error("perf: failed to write report file", error);
        }
        setAutoProgress(null);
        navigate({ to: "/perf" });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setAutoProgress(`Benchmark failed: ${message}`);
        // TEMP-PERF: persist the failure so CI fails fast with the reason
        // instead of waiting out the whole report timeout.
        console.error("[autoperf] benchmark failed:", message);
        const failed = blockedAutoReport(env, message);
        setLastAutoReport(failed);
        void writeAutoReportFile(failed).catch(() => {
          /* best effort */
        });
      });
  }, [
    db,
    dbLoading,
    notes,
    isLockStateResolving,
    isLocked,
    shortcutAction,
    shortcutEnv,
    consumeShortcut,
    navigate,
    closeNote,
  ]);

  /**
   * Back navigation out of the editor: return to the Read View when the note
   * was opened for reading, otherwise back to the Notes list.
   */
  const goBackFromEditor = useCallback(async () => {
    if (editReturnTo === "read") {
      await flushPendingSave();
      setNoteMode("read");
    } else {
      await closeNote();
    }
  }, [flushPendingSave, closeNote, editReturnTo]);

  const handleNewNote = useCallback(async () => {
    if (!db) return;
    // TEMP-PERF
    pmark("new-note-tap");
    const note = await createNote(db!, {
      folderId: view.kind === "folder" ? (view.id ?? null) : null,
      tagIds: view.kind === "tag" && view.id ? [view.id] : [],
    });
    // TEMP-PERF
    pmark("new-note-created");
    pmeasure("new-note-tap-to-created", "new-note-tap", "new-note-created");
    setMobileNavOpen(false);
    setDraft(null);
    setSaveState("idle");
    setActiveNoteId(note.id);
    setNoteMode("edit");
    setEditReturnTo("list");
  }, [view, db]);

  // Respond to Android shortcut triggers once DB is loaded and App Lock is unlocked
  useEffect(() => {
    if (shortcutAction === "new-note" && db && !isLockStateResolving && !isLocked) {
      consumeShortcut();
      void handleNewNote();
    }
  }, [shortcutAction, db, isLockStateResolving, isLocked, consumeShortcut, handleNewNote]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (meta && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void handleNewNote();
      }
      if (event.key === "Escape" && !searchOpen) {
        if (activeNoteId && noteMode === "edit") void goBackFromEditor();
        else if (activeNoteId) void closeNote();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNewNote, searchOpen, activeNoteId, noteMode, goBackFromEditor, closeNote]);

  // Latest navigation state for the Android hardware back button, avoiding
  // stale closures in the native listener.
  const backStateRef = useRef<{
    searchOpen: boolean;
    prompt: PromptRequest | null;
    confirmation: Confirmation | null;
    reminderTargetNote: Note | null;
    activeNoteId: string | null;
    noteMode: "read" | "edit";
  }>({
    searchOpen: false,
    prompt: null,
    confirmation: null,
    reminderTargetNote: null,
    activeNoteId: null,
    noteMode: "read",
  });
  backStateRef.current = {
    searchOpen,
    prompt,
    confirmation,
    reminderTargetNote,
    activeNoteId,
    noteMode,
  };

  /**
   * Android hardware back: dialogs -> search -> editor -> Read View ->
   * Notes list. Returns true when the press was consumed.
   */
  const handleSystemBack = useCallback((): boolean => {
    const state = backStateRef.current;
    if (state.reminderTargetNote) {
      setReminderTargetNote(null);
      return true;
    }
    if (state.confirmation) {
      setConfirmation(null);
      return true;
    }
    if (state.prompt) {
      setPrompt(null);
      return true;
    }
    if (state.searchOpen) {
      setSearchOpen(false);
      setQuery("");
      return true;
    }
    if (state.activeNoteId && state.noteMode === "edit") {
      void goBackFromEditor();
      return true;
    }
    if (state.activeNoteId) {
      void closeNote();
      return true;
    }
    return false;
  }, [goBackFromEditor, closeNote]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    let handle: PluginListenerHandle | undefined;
    void CapacitorApp.addListener("backButton", () => {
      if (!handleSystemBack()) {
        void CapacitorApp.minimizeApp();
      }
    }).then((listener) => {
      if (cancelled) void listener.remove();
      else handle = listener;
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [handleSystemBack]);

  const actions: NoteActions = useMemo(
    () => ({
      open: openNote,
      togglePin: (note) => {
        if (db) void togglePinned(db, note);
      },
      toggleFavorite: (note) => {
        if (db) void toggleFavorite(db, note);
      },
      setArchived: (note, archived) => {
        if (db) void setArchived(db, note, archived);
      },
      setReminder: (note) => setReminderTargetNote(note),
      duplicate: async (note) => {
        if (!db) return;
        const copy = await duplicateNote(db, note.id);
        if (copy) toast.success("Note duplicated");
      },
      move: (note, folderId) => {
        if (db) void moveNote(db, note.id, folderId);
      },
      trash: (note) => {
        if (!db) return;
        void trashNote(db, note.id);
        if (activeNoteId === note.id) setActiveNoteId(null);
        toast.success("Moved to Trash", {
          action: { label: "Undo", onClick: () => void restoreNote(db, note.id) },
        });
      },
      restore: (note) => {
        if (db) {
          void restoreNote(db, note.id);
          toast.success("Note restored");
        }
      },
      deleteForever: (note) =>
        setConfirmation({
          title: "Delete this note permanently?",
          description: `“${noteTitle(note)}” and its attachments will be removed from this device. This can't be undone.`,
          actionLabel: "Delete permanently",
          onConfirm: async () => {
            if (!db) return;
            await deleteNoteForever(db, note.id);
            if (activeNoteId === note.id) setActiveNoteId(null);
            toast.success("Note deleted");
          },
        }),
    }),
    [db, openNote, activeNoteId],
  );

  const searchResults = useMemo(() => {
    if (!searchOpen || query.trim() === "") return [];
    // TEMP-PERF
    pmark("search-start");
    const results = searchNotes(
      query,
      allNotes.filter((note) => !note.deleted),
      allFolders,
      allTags,
    );
    pmark("search-end");
    pmeasure("search-compute", "search-start", "search-end");
    return results;
  }, [searchOpen, query, allNotes, allFolders, allTags]);

  // TEMP-PERF: approximate search-results paint.
  useEffect(() => {
    if (!searchOpen || query.trim() === "") return;
    pmarkPaint("search-painted", () => {
      pmeasure("search-input-to-results-painted", "search-start", "search-painted");
    });
  }, [searchResults, searchOpen, query]);

  if (dbLoading || !db) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none" />
          <p className="text-sm text-muted-foreground animate-pulse motion-reduce:animate-none">
            Loading workspace…
          </p>
        </div>
      </div>
    );
  }

  const sidebar = (
    <NomaSidebar
      notes={allNotes}
      folders={allFolders}
      tags={allTags}
      view={view}
      onSelectView={(next) => {
        setView(next);
        setMobileNavOpen(false);
        void closeNote();
      }}
      onNewNote={handleNewNote}
      onCreateFolder={() =>
        setPrompt({
          title: "New folder",
          confirmLabel: "Create",
          onConfirm: async (name) => {
            await createFolder(db!, name);
          },
        })
      }
      onRenameFolder={(folder) =>
        setPrompt({
          title: "Rename folder",
          initialValue: folder.name,
          onConfirm: async (name) => {
            await renameFolder(db!, folder.id, name);
          },
        })
      }
      onDeleteFolder={(folder) =>
        setConfirmation({
          title: `Delete “${folder.name}”?`,
          description: "Notes inside stay in Noma and move out of this folder.",
          actionLabel: "Delete folder",
          onConfirm: async () => {
            await deleteFolder(db!, folder.id);
            setView({ kind: "all" });
          },
        })
      }
      onCreateTag={() =>
        setPrompt({
          title: "New tag",
          confirmLabel: "Create",
          onConfirm: async (name) => {
            await createTag(db!, name);
          },
        })
      }
      onRenameTag={(tag) =>
        setPrompt({
          title: "Rename tag",
          initialValue: tag.name,
          onConfirm: async (name) => {
            await renameTag(db!, tag.id, name);
          },
        })
      }
      onDeleteTag={(tag) =>
        setConfirmation({
          title: `Delete #${tag.name}?`,
          description: "The tag is removed from every note. Your notes stay untouched.",
          actionLabel: "Delete tag",
          onConfirm: async () => {
            await deleteTag(db!, tag.id);
            setView({ kind: "all" });
          },
        })
      }
      onCollapse={() => void updateSettings({ sidebarCollapsed: true })}
    />
  );

  /** Secondary note actions shared by the Read View and editor headers. */
  const overflowMenu = activeNote ? (
    <NoteOverflowMenu
      note={activeNote}
      tags={allTags}
      folders={allFolders}
      onCreateTag={() =>
        setPrompt({
          title: "New tag",
          confirmLabel: "Create",
          onConfirm: async (name) => {
            const tag = await createTag(db!, name);
            await setNoteTags(db!, activeNote.id, [...activeNote.tagIds, tag.id]);
          },
        })
      }
      onToggleTag={(tagId, checked) =>
        void setNoteTags(
          db!,
          activeNote.id,
          checked ? [...activeNote.tagIds, tagId] : activeNote.tagIds.filter((id) => id !== tagId),
        )
      }
      onMoveToFolder={(folderId) => void moveNote(db!, activeNote.id, folderId)}
      onSetReminder={() => setReminderTargetNote(activeNote)}
      onDuplicate={() => actions.duplicate(activeNote)}
      onToggleArchive={() => actions.setArchived(activeNote, !activeNote.archived)}
      onTrash={() => actions.trash(activeNote)}
      onRestore={() => actions.restore(activeNote)}
      onDeleteForever={() => actions.deleteForever(activeNote)}
    />
  ) : null;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* TEMP-PERF: automated benchmark progress banner. */}
      {autoProgress && (
        <div className="fixed inset-x-0 top-0 z-[100] bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground shadow-lg">
          {autoProgress}
        </div>
      )}
      {!settings.sidebarCollapsed && (
        <aside className="hidden w-64 shrink-0 border-r border-sidebar-border md:block">
          {sidebar}
        </aside>
      )}

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Noma navigation</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          {settings.sidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              aria-label="Show sidebar"
              onClick={() => void updateSettings({ sidebarCollapsed: false })}
            >
              <PanelLeft className="size-5" />
            </Button>
          )}

          {activeNote && noteMode === "edit" ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => void goBackFromEditor()}
              >
                <ArrowLeft className="size-4" />
                <span className="hidden sm:inline">{viewTitle(view, allFolders, allTags)}</span>
              </Button>
              <span
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none"
                aria-live="polite"
                role="status"
              >
                {!online ? (
                  <>
                    <WifiOff className="size-3.5" aria-hidden="true" /> Saved offline
                  </>
                ) : saveState === "saving" ? (
                  "Saving…"
                ) : saveState === "saved" ? (
                  <>
                    <Check className="size-3.5" aria-hidden="true" /> Saved
                  </>
                ) : (
                  ""
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={activeNote.reminderAt ? "Edit Reminder" : "Set Reminder"}
                onClick={() => setReminderTargetNote(activeNote)}
                className={cn(
                  "gap-1 text-xs",
                  activeNote.reminderAt ? "text-primary font-medium" : "text-muted-foreground",
                )}
              >
                <Bell className={cn("size-4", activeNote.reminderAt && "fill-current")} />
                {activeNote.reminderAt ? (
                  <span className="hidden sm:inline">
                    {format(activeNote.reminderAt, "MMM d, p")}
                  </span>
                ) : (
                  <span className="hidden sm:inline">Set Reminder</span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={activeNote.pinned ? "Unpin note" : "Pin note"}
                onClick={() => void togglePinned(db!, activeNote)}
                className={cn(activeNote.pinned && "text-foreground")}
              >
                <Pin className={cn("size-4", activeNote.pinned && "fill-current")} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={activeNote.favorite ? "Remove favorite" : "Add favorite"}
                onClick={() => void toggleFavorite(db!, activeNote)}
              >
                <Star className={cn("size-4", activeNote.favorite && "fill-current")} />
              </Button>
              {overflowMenu}
            </>
          ) : activeNote ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => void closeNote()}
              >
                <ArrowLeft className="size-4" />
                <span className="hidden sm:inline">{viewTitle(view, allFolders, allTags)}</span>
              </Button>
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" className="noma-cta gap-1.5" onClick={openNoteForEdit}>
                  <Pencil className="size-4" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={activeNote.pinned ? "Unpin note" : "Pin note"}
                  onClick={() => void togglePinned(db!, activeNote)}
                  className={cn(activeNote.pinned && "text-foreground")}
                >
                  <Pin className={cn("size-4", activeNote.pinned && "fill-current")} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={activeNote.favorite ? "Remove favorite" : "Add favorite"}
                  onClick={() => void toggleFavorite(db!, activeNote)}
                >
                  <Star className={cn("size-4", activeNote.favorite && "fill-current")} />
                </Button>
                {overflowMenu}
              </div>
            </>
          ) : (
            <>
              <h1 className="truncate font-serif text-lg font-medium">
                {viewTitle(view, allFolders, allTags)}
              </h1>
              <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                {visibleNotes.length}
              </span>
              <div className="ml-auto flex items-center gap-1">
                {!online && (
                  <span className="mr-1 hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                    <WifiOff className="size-3.5" /> Offline
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Search notes"
                  onClick={() => setSearchOpen(true)}
                >
                  <Search className="size-4" />
                </Button>
                {view.kind === "trash" && visibleNotes.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() =>
                      setConfirmation({
                        title: "Empty Trash?",
                        description: `${visibleNotes.length} note(s) will be permanently deleted from this device.`,
                        actionLabel: "Empty Trash",
                        onConfirm: async () => {
                          const count = await emptyTrash(db!);
                          toast.success(`${count} note(s) deleted`);
                        },
                      })
                    }
                  >
                    Empty Trash
                  </Button>
                )}
                <Button size="sm" className="gap-1.5" onClick={handleNewNote}>
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">New Note</span>
                </Button>
              </div>
            </>
          )}
        </header>

        <div className="noma-scroll flex-1 overflow-y-auto">
          {activeNote ? (
            noteMode === "read" ? (
              <NoteReadView
                key={activeNote.id}
                note={activeNote}
                folders={allFolders}
                tags={allTags}
                fontSize={settings.fontSize}
                editorWidth={settings.editorWidth}
                lineHeight={settings.lineHeight}
              />
            ) : (
              <NoteEditor
                key={activeNote.id}
                note={activeNote}
                onChange={handleChange}
                fontSize={settings.fontSize}
                editorWidth={settings.editorWidth}
                lineHeight={settings.lineHeight}
              />
            )
          ) : view.kind === "reminders" ? (
            <RemindersView reminders={reminders ?? []} notes={allNotes} onOpenNote={openNote} />
          ) : notes === undefined ? (
            <div className="space-y-3 p-4 sm:p-6" aria-busy="true" aria-label="Loading notes">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="rounded-xl border border-border/60 bg-card p-4 shadow-xs">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                  <div className="mt-2.5 h-3 w-3/4 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
                  <div className="mt-2 h-3 w-1/5 animate-pulse rounded bg-muted/50 motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          ) : (
            <NoteList
              notes={visibleNotes}
              folders={allFolders}
              tags={allTags}
              view={view}
              activeNoteId={activeNoteId}
              actions={actions}
              phoneAlarmNoteIds={phoneAlarmNoteIds}
            />
          )}
        </div>
      </main>

      <Dialog
        open={searchOpen}
        onOpenChange={(open) => {
          setSearchOpen(open);
          if (!open) setQuery("");
        }}
      >
        <DialogContent className="top-24 max-w-xl translate-y-0 p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Search notes</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, content, tags and folders…"
              className="h-12 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="noma-scroll max-h-80 overflow-y-auto p-2">
            {query.trim() === "" ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Search works offline across your whole library.
              </p>
            ) : searchResults.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No notes match “{query.trim()}”.
              </p>
            ) : (
              searchResults.slice(0, 30).map(({ note, snippet }) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => {
                    openNote(note);
                    setSearchOpen(false);
                    setQuery("");
                  }}
                  className="w-full rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
                >
                  <span className="block truncate font-serif text-[15px] font-medium">
                    {noteTitle(note)}
                  </span>
                  <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                    {highlightTerms(snippet, query).map((part, index) =>
                      part.match ? (
                        <mark
                          key={index}
                          className="rounded bg-transparent font-medium text-foreground"
                        >
                          {part.text}
                        </mark>
                      ) : (
                        <span key={index}>{part.text}</span>
                      ),
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PromptDialog request={prompt} onClose={() => setPrompt(null)} />

      {reminderTargetNote && (
        <ReminderDialog
          open={Boolean(reminderTargetNote)}
          onOpenChange={(open) => !open && setReminderTargetNote(null)}
          noteTitle={noteTitle(reminderTargetNote)}
          existingReminder={(reminders ?? []).find((r) => r.noteId === reminderTargetNote.id)}
          onSave={async (scheduledAt, options) => {
            await setNoteReminder(db!, reminderTargetNote.id, scheduledAt, options);
            toast.success("Reminder set");
          }}
          onDelete={async () => {
            await deleteNoteReminder(db!, reminderTargetNote.id);
            toast.success("Reminder removed");
          }}
        />
      )}

      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => !open && setConfirmation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await confirmation?.onConfirm();
                setConfirmation(null);
              }}
            >
              {confirmation?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
