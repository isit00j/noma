import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Check,
  Hash,
  Menu,
  MoreHorizontal,
  PanelLeft,
  Pin,
  Plus,
  Search,
  Star,
  Trash2,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { NoteEditor, type SaveState } from "./note-editor";
import { NoteList, type NoteActions } from "./note-list";
import { PromptDialog, type PromptRequest } from "./prompt-dialog";
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
import {
  createFolder,
  createNote,
  createTag,
  deleteFolder,
  deleteNoteForever,
  deleteTag,
  duplicateNote,
  emptyTrash,
  moveNote,
  noteTitle,
  renameFolder,
  renameTag,
  restoreNote,
  setArchived,
  setNoteTags,
  toggleFavorite,
  togglePinned,
  trashNote,
  updateNote,
} from "@/lib/noma/notes";
import { highlightTerms, searchNotes } from "@/lib/noma/search";
import type { Note } from "@/lib/noma/types";
import { filterNotes, viewTitle, type ViewState } from "@/lib/noma/view";
import { cn } from "@/lib/utils";

interface Confirmation {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void | Promise<void>;
}

export function Workspace() {
  const { db, loading: dbLoading } = useDatabase();
  const notes = useLiveQuery(() => db?.notes.toArray() ?? [], [db], undefined);
  const folders = useLiveQuery(() => db?.folders.orderBy("name").toArray() ?? [], [db], undefined);
  const tags = useLiveQuery(() => db?.tags.orderBy("name").toArray() ?? [], [db], undefined);
  const { settings, update: updateSettings } = useSettings();
  const online = useOnline();

  const [view, setView] = useState<ViewState>({ kind: "all" });
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; title?: string; content?: string } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        await updateNote(db!, id, patch);
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
      setDraft((current) => ({
        ...(current?.id === activeNoteId ? current : { id: activeNoteId }),
        id: activeNoteId,
        ...patch,
      }));
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flushSave(activeNoteId, patch), 400);
    },
    [activeNoteId, flushSave],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const openNote = useCallback((note: Note) => {
    setDraft(null);
    setSaveState("idle");
    setActiveNoteId(note.id);
  }, []);

  const handleNewNote = useCallback(async () => {
    if (!db) return;
    const note = await createNote(db!, {
      folderId: view.kind === "folder" ? (view.id ?? null) : null,
      tagIds: view.kind === "tag" && view.id ? [view.id] : [],
    });
    setMobileNavOpen(false);
    openNote(note);
  }, [openNote, view, db]);

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
      if (event.key === "Escape" && !searchOpen) setActiveNoteId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNewNote, searchOpen]);

  const actions: NoteActions = {
    open: openNote,
    togglePin: (note) => void togglePinned(db!, note),
    toggleFavorite: (note) => void toggleFavorite(db!, note),
    setArchived: (note, archived) => void setArchived(db!, note, archived),
    duplicate: async (note) => {
      const copy = await duplicateNote(db!, note.id);
      if (copy) toast.success("Note duplicated");
    },
    move: (note, folderId) => void moveNote(db!, note.id, folderId),
    trash: (note) => {
      void trashNote(db!, note.id);
      if (activeNoteId === note.id) setActiveNoteId(null);
      toast.success("Moved to Trash", {
        action: { label: "Undo", onClick: () => void restoreNote(db!, note.id) },
      });
    },
    restore: (note) => {
      void restoreNote(db!, note.id);
      toast.success("Note restored");
    },
    deleteForever: (note) =>
      setConfirmation({
        title: "Delete this note permanently?",
        description: `“${noteTitle(note)}” and its attachments will be removed from this device. This can't be undone.`,
        actionLabel: "Delete permanently",
        onConfirm: async () => {
          await deleteNoteForever(db!, note.id);
          if (activeNoteId === note.id) setActiveNoteId(null);
          toast.success("Note deleted");
        },
      }),
  };

  const searchResults = useMemo(
    () =>
      searchOpen
        ? searchNotes(
            query,
            allNotes.filter((note) => !note.deleted),
            allFolders,
            allTags,
          )
        : [],
    [searchOpen, query, allNotes, allFolders, allTags],
  );

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
        setActiveNoteId(null);
        setMobileNavOpen(false);
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

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
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

          {activeNote ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => setActiveNoteId(null)}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Note options">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Tags
                  </DropdownMenuLabel>
                  {allTags.length === 0 && (
                    <DropdownMenuItem
                      onClick={() =>
                        setPrompt({
                          title: "New tag",
                          confirmLabel: "Create",
                          onConfirm: async (name) => {
                            const tag = await createTag(db!, name);
                            await setNoteTags(db!, activeNote.id, [...activeNote.tagIds, tag.id]);
                          },
                        })
                      }
                    >
                      <Plus className="size-4" /> Create a tag
                    </DropdownMenuItem>
                  )}
                  {allTags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag.id}
                      checked={activeNote.tagIds.includes(tag.id)}
                      onCheckedChange={(checked) =>
                        void setNoteTags(
                          db!,
                          activeNote.id,
                          checked
                            ? [...activeNote.tagIds, tag.id]
                            : activeNote.tagIds.filter((id) => id !== tag.id),
                        )
                      }
                    >
                      <Hash className="size-3.5" /> {tag.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Folder
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => void moveNote(db!, activeNote.id, null)}>
                    {activeNote.folderId === null && <Check className="size-4" />} No folder
                  </DropdownMenuItem>
                  {allFolders.map((folder) => (
                    <DropdownMenuItem
                      key={folder.id}
                      onClick={() => void moveNote(db!, activeNote.id, folder.id)}
                    >
                      {activeNote.folderId === folder.id && <Check className="size-4" />}{" "}
                      {folder.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => actions.duplicate(activeNote)}>
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => actions.setArchived(activeNote, !activeNote.archived)}
                  >
                    {activeNote.archived ? "Unarchive" : "Archive"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => actions.trash(activeNote)}
                  >
                    <Trash2 className="size-4" /> Move to Trash
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
            <NoteEditor
              key={activeNote.id}
              note={activeNote}
              onChange={handleChange}
              fontSize={settings.fontSize}
              editorWidth={settings.editorWidth}
              lineHeight={settings.lineHeight}
            />
          ) : notes === undefined ? (
            <ul className="divide-y divide-border/70" aria-busy="true" aria-label="Loading notes">
              {[0, 1, 2, 3].map((row) => (
                <li key={row} className="px-5 py-4 sm:px-6">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                  <div className="mt-2.5 h-3 w-3/4 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
                  <div className="mt-2 h-3 w-1/5 animate-pulse rounded bg-muted/50 motion-reduce:animate-none" />
                </li>
              ))}
            </ul>
          ) : (
            <NoteList
              notes={visibleNotes}
              folders={allFolders}
              tags={allTags}
              view={view}
              activeNoteId={activeNoteId}
              actions={actions}
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
