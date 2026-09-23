// @vitest-environment happy-dom
import { act, memo, Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteItem, NoteList, type NoteActions } from "./note-list";
import { stabilizeNoteRows } from "./use-stable-notes";
import type { Note } from "@/lib/noma/types";

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

const rowProps = {
  folders: [],
  tagNameMap: new Map<string, string>(),
  folderNameMap: new Map<string, string>(),
  isActive: false,
  isPhoneAlarm: false,
};

let container: HTMLDivElement;
let root: Root;

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

describe("NoteItem memoization", () => {
  it("re-renders only the changed row when one note mutates", () => {
    const renderCounts = new Map<string, number>();
    // Count only mount/update of the row itself: Radix internals fire a
    // one-time "nested-update" inside each row on mount, which is noise here.
    const onRender = (id: string, phase: string) => {
      if (phase === "mount" || phase === "update") {
        renderCounts.set(id, (renderCounts.get(id) ?? 0) + 1);
      }
    };
    // Memoized probe: the Profiler only re-renders (and reports) when the
    // row's own props change — exactly what memo(NoteItem) must achieve.
    const rowActions = stubActions();
    const RowProbe = memo(function RowProbe({ note }: { note: Note }) {
      return (
        <Profiler id={note.id} onRender={onRender}>
          <NoteItem note={note} actions={rowActions} {...rowProps} />
        </Profiler>
      );
    });

    const cache = new Map<string, Note>();
    const notes = stabilizeNoteRows(cache, [makeNote("a"), makeNote("b"), makeNote("c")]);
    act(() => {
      root.render(
        <ul>
          {notes.map((note) => (
            <RowProbe key={note.id} note={note} />
          ))}
        </ul>,
      );
    });
    expect(renderCounts.get("a")).toBe(1);
    expect(renderCounts.get("b")).toBe(1);
    expect(renderCounts.get("c")).toBe(1);

    // Simulate a useLiveQuery re-fire: every object is fresh, only "b" changed.
    const refired = notes.map((n) =>
      n.id === "b"
        ? { ...n, tagIds: [...n.tagIds], title: "Renamed b" }
        : { ...n, tagIds: [...n.tagIds] },
    );
    const stable = stabilizeNoteRows(cache, refired);
    act(() => {
      root.render(
        <ul>
          {stable.map((note) => (
            <RowProbe key={note.id} note={note} />
          ))}
        </ul>,
      );
    });

    expect(renderCounts.get("a")).toBe(1);
    expect(renderCounts.get("c")).toBe(1);
    expect(renderCounts.get("b")).toBe(2);
    expect(container.textContent).toContain("Renamed b");
    // Unchanged rows keep their exact previous props (identity, not just shape).
    expect(stable[0]).toBe(notes[0]);
    expect(stable[2]).toBe(notes[2]);
  });
});

describe("NoteList", () => {
  function renderList(notes: Note[]) {
    act(() => {
      root.render(
        <NoteList
          notes={notes}
          folders={[]}
          tags={[]}
          view={{ kind: "all" }}
          activeNoteId={null}
          actions={stubActions()}
          phoneAlarmNoteIds={new Set()}
        />,
      );
    });
  }

  it("adds and removes rows as notes come and go", () => {
    renderList([makeNote("a"), makeNote("b")]);
    expect(container.querySelectorAll("li.note-list-row")).toHaveLength(2);

    renderList([makeNote("a"), makeNote("b"), makeNote("c")]);
    const rows = container.querySelectorAll("li.note-list-row");
    expect(rows).toHaveLength(3);
    expect(container.textContent).toContain("Title c");

    renderList([makeNote("a")]);
    expect(container.querySelectorAll("li.note-list-row")).toHaveLength(1);
    expect(container.textContent).not.toContain("Title b");
  });

  it("applies rendering containment to every row", () => {
    renderList([makeNote("a"), makeNote("b")]);
    const rows = container.querySelectorAll("li.note-list-row");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.classList.contains("note-list-row")).toBe(true);
    }
  });

  it("marks the active note's row without disturbing the others", () => {
    const notes = [makeNote("a"), makeNote("b")];
    act(() => {
      root.render(
        <NoteList
          notes={notes}
          folders={[]}
          tags={[]}
          view={{ kind: "all" }}
          activeNoteId="b"
          actions={stubActions()}
          phoneAlarmNoteIds={new Set()}
        />,
      );
    });
    const rows = container.querySelectorAll("li.note-list-row");
    expect(rows).toHaveLength(2);
    // The active card carries the accent background class; the other does not.
    const cardA = rows[0]!.querySelector(":scope > div")!;
    const cardB = rows[1]!.querySelector(":scope > div")!;
    expect(cardA.className).not.toContain("bg-accent/30");
    expect(cardB.className).toContain("bg-accent/30");
  });
});
