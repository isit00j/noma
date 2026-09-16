import React, { memo, useMemo } from "react";
import { formatDistanceToNowStrict, format } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  Bell,
  Copy,
  FolderInput,
  Image as ImageIcon,
  MoreHorizontal,
  NotebookPen,
  Pin,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { notePreview, noteTitle } from "@/lib/noma/notes";
import { noteAccentBucket, noteAccentClass } from "@/lib/noma/note-accent";
import type { Folder, Note, Tag } from "@/lib/noma/types";
import type { ViewState } from "@/lib/noma/view";

export interface NoteActions {
  open: (note: Note) => void;
  togglePin: (note: Note) => void;
  toggleFavorite: (note: Note) => void;
  setArchived: (note: Note, archived: boolean) => void;
  setReminder?: (note: Note) => void;
  duplicate: (note: Note) => void;
  move: (note: Note, folderId: string | null) => void;
  trash: (note: Note) => void;
  restore: (note: Note) => void;
  deleteForever: (note: Note) => void;
}

interface NoteListProps {
  notes: Note[];
  folders: Folder[];
  tags: Tag[];
  view: ViewState;
  activeNoteId: string | null;
  actions: NoteActions;
}

const EMPTY_COPY: Record<string, { title: string; body: string }> = {
  trash: {
    title: "Trash is empty",
    body: "Deleted notes will appear here before they're removed for good.",
  },
  archive: {
    title: "Nothing archived",
    body: "Archive notes you want out of the way but not deleted.",
  },
  pinned: { title: "No pinned notes", body: "Pin a note to keep it at the top of your list." },
  favorites: { title: "No favorites yet", body: "Star the notes you return to most." },
  reminders: {
    title: "No reminders set",
    body: "Set reminders on your notes to keep track of tasks.",
  },
  default: {
    title: "No notes here yet",
    body: "Start a new note — it saves to this device as you type.",
  },
};

interface NoteItemProps {
  note: Note;
  folders: Folder[];
  tagNameMap: Map<string, string>;
  folderNameMap: Map<string, string>;
  isActive: boolean;
  actions: NoteActions;
}

const NoteItem = memo(function NoteItem({
  note,
  folders,
  tagNameMap,
  folderNameMap,
  isActive,
  actions,
}: NoteItemProps) {
  const title = noteTitle(note);
  const preview = notePreview(note);
  const hasAttachments = note.content.includes("noma-attachment://");
  const noteTags = note.tagIds.filter((id) => tagNameMap.has(id)).slice(0, 3);
  // Cheap, deterministic fingerprint (tiny string hash); the memoised component
  // only recomputes it when its props change, so long lists stay fast.
  const accentClass = noteAccentClass(noteAccentBucket(note));

  return (
    <li>
      <div
        className={cn(
          "group relative rounded-xl border border-border/60 bg-card shadow-xs transition-[border-color,box-shadow,background-color] duration-150",
          "hover:border-border hover:shadow-sm hover:bg-accent/20",
          isActive && "border-primary/40 bg-accent/30 shadow-sm",
          accentClass,
        )}
      >
        <span aria-hidden="true" className="note-accent-rail" />
        <button
          type="button"
          onClick={() => actions.open(note)}
          aria-label={`Open ${title}`}
          className="block w-full min-w-0 rounded-xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-5"
        >
          <div className="flex items-center gap-2 pr-9">
            {note.pinned && (
              <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-label="Pinned" />
            )}
            {note.favorite && (
              <Star
                className="size-3.5 shrink-0 fill-current text-muted-foreground"
                aria-label="Favorite"
              />
            )}
            {note.reminderAt && (
              <Bell className="size-3.5 shrink-0 text-primary" aria-label="Has reminder" />
            )}
            {hasAttachments && (
              <ImageIcon
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-label="Has attachments"
              />
            )}
            <h3 className="truncate font-serif text-[17px] font-medium tracking-tight">{title}</h3>
          </div>
          <p className="mt-1.5 line-clamp-2 pr-9 text-sm leading-relaxed text-muted-foreground">
            {preview || "Empty note"}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {formatDistanceToNowStrict(note.updatedAt, { addSuffix: true })}
            </span>
            {note.reminderAt && (
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                <Bell className="size-3" aria-hidden="true" />
                {format(note.reminderAt, "MMM d, p")}
              </span>
            )}
            {note.folderId && folderNameMap.has(note.folderId) && (
              <span className="inline-flex max-w-32 items-center gap-1 truncate">
                {folderNameMap.get(note.folderId)}
              </span>
            )}
            {noteTags.map((id) => (
              <span key={id} className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                #{tagNameMap.get(id)}
              </span>
            ))}
          </div>
        </button>

        <div className="absolute top-2.5 right-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
                aria-label={`Actions for ${title}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {note.deleted ? (
                <>
                  <DropdownMenuItem onClick={() => actions.restore(note)}>
                    <RotateCcw className="size-4" /> Restore
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => actions.deleteForever(note)}
                  >
                    <Trash2 className="size-4" /> Delete permanently
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => actions.togglePin(note)}>
                    <Pin className="size-4" /> {note.pinned ? "Unpin" : "Pin"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => actions.toggleFavorite(note)}>
                    <Star className="size-4" /> {note.favorite ? "Remove favorite" : "Favorite"}
                  </DropdownMenuItem>
                  {actions.setReminder && (
                    <DropdownMenuItem onClick={() => actions.setReminder?.(note)}>
                      <Bell className="size-4 text-primary" />{" "}
                      {note.reminderAt ? "Edit Reminder" : "Set Reminder"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => actions.duplicate(note)}>
                    <Copy className="size-4" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderInput className="size-4" /> Move to
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => actions.move(note, null)}>
                        No folder
                      </DropdownMenuItem>
                      {folders.map((folder) => (
                        <DropdownMenuItem
                          key={folder.id}
                          onClick={() => actions.move(note, folder.id)}
                        >
                          {folder.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem onClick={() => actions.setArchived(note, !note.archived)}>
                    {note.archived ? (
                      <ArchiveRestore className="size-4" />
                    ) : (
                      <Archive className="size-4" />
                    )}
                    {note.archived ? "Unarchive" : "Archive"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => actions.trash(note)}
                  >
                    <Trash2 className="size-4" /> Move to Trash
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
});

export function NoteList({ notes, folders, tags, view, activeNoteId, actions }: NoteListProps) {
  const tagNameMap = useMemo(() => new Map(tags.map((tag) => [tag.id, tag.name])), [tags]);
  const folderNameMap = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  );

  if (notes.length === 0) {
    const copy = EMPTY_COPY[view.kind] ?? EMPTY_COPY["default"]!;
    return (
      <div className="px-6 py-20 text-center animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full border border-border bg-card">
          <NotebookPen className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="font-serif text-lg">{copy.title}</p>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">{copy.body}</p>
      </div>
    );
  }

  return (
    <ul className="mx-auto w-full max-w-3xl space-y-3 p-4 sm:p-6">
      {notes.map((note) => (
        <NoteItem
          key={note.id}
          note={note}
          folders={folders}
          tagNameMap={tagNameMap}
          folderNameMap={folderNameMap}
          isActive={activeNoteId === note.id}
          actions={actions}
        />
      ))}
    </ul>
  );
}
