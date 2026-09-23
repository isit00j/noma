import { createContext, type RefObject } from "react";
import type { VirtualListHandle } from "./virtual-list";

/**
 * API published by the notes-list surface (the scrollable container owned
 * by WorkspaceSurfaces) to the virtualized NoteList rendered inside it.
 *
 * The surface element is published via state (not a ref object) so the
 * virtualizer receives it as an ordinary prop: child layout effects run
 * before a parent's ref attaches, so reading `.current` during the
 * virtualizer's mount would see null. With state, the surface re-renders
 * once the element exists and the virtualizer initializes from the prop —
 * synchronously during commit, before paint.
 */
export interface NotesListSurfaceApi {
  /** The scrollable surface element; null until the surface mounts. */
  scrollElement: HTMLDivElement | null;
  /** Ref object the virtualized list registers its imperative handle into. */
  listHandleRef: RefObject<VirtualListHandle | null>;
}

export const NotesListSurfaceContext = createContext<NotesListSurfaceApi | null>(null);
