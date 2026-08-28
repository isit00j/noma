import type { Folder, Note, Tag } from "./types";

export type ViewKind =
  "all" | "recent" | "pinned" | "favorites" | "archive" | "trash" | "folder" | "tag";

export interface ViewState {
  kind: ViewKind;
  id?: string | null;
}

const RECENT_WINDOW = 1000 * 60 * 60 * 24 * 7;

export function filterNotes(notes: Note[], view: ViewState): Note[] {
  const live = notes.filter((note) => !note.deleted);
  let result: Note[];
  switch (view.kind) {
    case "trash":
      result = notes.filter((note) => note.deleted);
      break;
    case "archive":
      result = live.filter((note) => note.archived);
      break;
    case "pinned":
      result = live.filter((note) => note.pinned && !note.archived);
      break;
    case "favorites":
      result = live.filter((note) => note.favorite && !note.archived);
      break;
    case "recent":
      result = live.filter((note) => !note.archived && Date.now() - note.updatedAt < RECENT_WINDOW);
      break;
    case "folder":
      result = live.filter((note) => note.folderId === view.id && !note.archived);
      break;
    case "tag":
      result = live.filter((note) => note.tagIds.includes(view.id ?? "") && !note.archived);
      break;
    default:
      result = live.filter((note) => !note.archived);
  }

  return result.sort((a, b) => {
    if (view.kind !== "trash" && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export function viewTitle(view: ViewState, folders: Folder[], tags: Tag[]): string {
  switch (view.kind) {
    case "recent":
      return "Recent";
    case "pinned":
      return "Pinned";
    case "favorites":
      return "Favorites";
    case "archive":
      return "Archive";
    case "trash":
      return "Trash";
    case "folder":
      return folders.find((folder) => folder.id === view.id)?.name ?? "Folder";
    case "tag": {
      const tag = tags.find((item) => item.id === view.id);
      return tag ? `#${tag.name}` : "Tag";
    }
    default:
      return "All Notes";
  }
}

export function sameView(a: ViewState, b: ViewState): boolean {
  return a.kind === b.kind && (a.id ?? null) === (b.id ?? null);
}
