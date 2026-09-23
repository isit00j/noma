// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSurfaces } from "./workspace";
import type { NoteActions } from "./note-list";
import type { Note } from "@/lib/noma/types";
import type { ViewState } from "@/lib/noma/view";

// The real read/edit views construct Tiptap editors; stub them out so this
// test stays focused on the surface-switching behavior.
vi.mock("./note-read-view", () => ({
  NoteReadView: () => <div data-testid="mock-read-view" />,
}));
vi.mock("./note-editor", () => ({
  NoteEditor: () => <div data-testid="mock-edit-view" />,
}));

(globalThis as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] = true;

function makeNote(id: string, extra: Partial<Note> = {}): Note {
  return {
    id,
    title: `Title ${id}`,
    content: `<p>Content ${id}</p>`,
    contentFormat: "tiptap-html",
    createdAt: 1000,
    updatedAt: 2000,
    folderId: null,
    tagIds: [],
    pinned: false,
    favorite: false,
    archived: false,
    deleted: false,
    deletedAt: null,
    reminderAt: null,
    wordCount: 10,
    ...extra,
  };
}

function stubActions(): NoteActions {
  return {
    open: vi.fn(),
    togglePin: vi.fn(),
    toggleFavorite: vi.fn(),
    setArchived: vi.fn(),
    duplicate: vi.fn(),
    move: vi.fn(),
    trash: vi.fn(),
    restore: vi.fn(),
    deleteForever: vi.fn(),
  };
}

const noteA = makeNote("a");
const noteB = makeNote("b", { favorite: true });

function baseProps() {
  return {
    activeNote: null as Note | null,
    activeNoteId: null as string | null,
    noteMode: "read" as "read" | "edit",
    view: { kind: "all" } as ViewState,
    notesLoading: false,
    visibleNotes: [noteA, noteB],
    allNotes: [noteA, noteB],
    allFolders: [],
    allTags: [],
    reminders: [],
    actions: stubActions(),
    phoneAlarmNoteIds: new Set<string>(),
    onOpenNote: vi.fn(),
    onNoteChange: vi.fn(),
    fontSize: 16,
    editorWidth: 672,
    lineHeight: 1.7,
  };
}

let container: HTMLDivElement;
let root: Root;

function renderSurfaces(props: ReturnType<typeof baseProps>) {
  act(() => {
    root.render(<WorkspaceSurfaces {...props} />);
  });
}

function listSurface(): HTMLElement {
  const el = container.querySelector('[data-testid="notes-list-surface"]');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("WorkspaceSurfaces", () => {
  it("keeps the list mounted (same DOM) when a note is opened and closed", () => {
    renderSurfaces(baseProps());
    const surface = listSurface();
    expect(surface.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector('[data-testid="note-surface"]')).toBeNull();
    const firstRow = surface.querySelector("li.note-list-row");
    expect(firstRow).not.toBeNull();

    // Open a note: the list surface must stay in the DOM, merely hidden.
    renderSurfaces({ ...baseProps(), activeNote: noteA, activeNoteId: noteA.id });
    const hidden = listSurface();
    expect(hidden).toBe(surface);
    expect(hidden.hasAttribute("hidden")).toBe(true);
    expect(hidden.querySelector("li.note-list-row")).toBe(firstRow);
    expect(container.querySelector('[data-testid="mock-read-view"]')).not.toBeNull();

    // Close the note: the same list DOM becomes visible again, not rebuilt.
    renderSurfaces(baseProps());
    const shown = listSurface();
    expect(shown).toBe(surface);
    expect(shown.hasAttribute("hidden")).toBe(false);
    expect(shown.querySelector("li.note-list-row")).toBe(firstRow);
    expect(container.querySelector('[data-testid="note-surface"]')).toBeNull();
  });

  it("preserves the list scroll position across note open/close", () => {
    renderSurfaces(baseProps());
    const surface = listSurface();
    surface.scrollTop = 420;

    renderSurfaces({ ...baseProps(), activeNote: noteA, activeNoteId: noteA.id });
    renderSurfaces(baseProps());

    expect(listSurface()).toBe(surface);
    expect(surface.scrollTop).toBe(420);
  });

  it("preserves the active filter while a note is open", () => {
    const favoritesView: ViewState = { kind: "favorites" };
    renderSurfaces({ ...baseProps(), view: favoritesView, visibleNotes: [noteB] });
    expect(listSurface().querySelectorAll("li.note-list-row")).toHaveLength(1);

    // Open a note from the filtered list; the hidden list keeps its filter.
    renderSurfaces({
      ...baseProps(),
      view: favoritesView,
      visibleNotes: [noteB],
      activeNote: noteB,
      activeNoteId: noteB.id,
    });
    expect(listSurface().querySelectorAll("li.note-list-row")).toHaveLength(1);

    // Back to the unfiltered list: both rows, same surface.
    renderSurfaces(baseProps());
    expect(listSurface().querySelectorAll("li.note-list-row")).toHaveLength(2);
  });

  it("renders the editor surface in edit mode and unmounts it on close", () => {
    renderSurfaces({ ...baseProps(), activeNote: noteA, activeNoteId: noteA.id, noteMode: "edit" });
    expect(container.querySelector('[data-testid="mock-edit-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="mock-read-view"]')).toBeNull();
    expect(listSurface().hasAttribute("hidden")).toBe(true);

    renderSurfaces(baseProps());
    expect(container.querySelector('[data-testid="note-surface"]')).toBeNull();
    expect(container.querySelector('[data-testid="mock-edit-view"]')).toBeNull();
  });

  it("shows the loading skeleton while notes load, without unmounting the surface", () => {
    renderSurfaces({ ...baseProps(), notesLoading: true, visibleNotes: [], allNotes: [] });
    const surface = listSurface();
    expect(surface.querySelector('[aria-busy="true"]')).not.toBeNull();

    renderSurfaces(baseProps());
    expect(listSurface()).toBe(surface);
    expect(surface.querySelectorAll("li.note-list-row")).toHaveLength(2);
  });
});
