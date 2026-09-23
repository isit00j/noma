import { describe, expect, it } from "vitest";
import { noteRowEqual, stabilizeNoteRows } from "./use-stable-notes";
import type { Note } from "@/lib/noma/types";

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

/** A deep clone with fresh object identity, like a Dexie useLiveQuery re-fire. */
function refire(notes: Note[]): Note[] {
  return notes.map((n) => ({ ...n, tagIds: [...n.tagIds] }));
}

describe("noteRowEqual", () => {
  it("treats identical references as equal", () => {
    const note = makeNote("a");
    expect(noteRowEqual(note, note)).toBe(true);
  });

  it("treats field-identical clones as equal", () => {
    const note = makeNote("a", { tagIds: ["t1", "t2"] });
    expect(noteRowEqual(note, { ...note, tagIds: ["t1", "t2"] })).toBe(true);
  });

  it("detects a change in every field NoteItem reads", () => {
    const base = makeNote("a", { tagIds: ["t1"] });
    const mutations: Partial<Note>[] = [
      { title: "changed" },
      { content: "<p>changed</p>" },
      { updatedAt: 9999 },
      { folderId: "f1" },
      { tagIds: ["t1", "t2"] },
      { tagIds: [] },
      { pinned: true },
      { favorite: true },
      { archived: true },
      { deleted: true },
      { deletedAt: 555 },
      { reminderAt: 777 },
      { wordCount: 42 },
      { createdAt: 1234 },
    ];
    for (const mutation of mutations) {
      expect(noteRowEqual(base, { ...base, ...mutation })).toBe(false);
    }
  });

  it("treats tag order changes as a change", () => {
    const a = makeNote("a", { tagIds: ["t1", "t2"] });
    const b = makeNote("a", { tagIds: ["t2", "t1"] });
    expect(noteRowEqual(a, b)).toBe(false);
  });

  it("rejects rows with a different field count", () => {
    const a = makeNote("a");
    const b = { ...a } as Record<string, unknown>;
    delete b["wordCount"];
    expect(noteRowEqual(a, b as unknown as Note)).toBe(false);
  });
});

describe("stabilizeNoteRows", () => {
  it("preserves identity for unchanged rows across a live-query re-fire", () => {
    const cache = new Map<string, Note>();
    const first = stabilizeNoteRows(cache, [makeNote("a"), makeNote("b")]);
    const second = stabilizeNoteRows(cache, refire(first));
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(second).not.toBe(first);
  });

  it("hands out a new identity only for the changed row", () => {
    const cache = new Map<string, Note>();
    const first = stabilizeNoteRows(cache, [makeNote("a"), makeNote("b"), makeNote("c")]);
    const changed = refire(first).map((n) => (n.id === "b" ? { ...n, title: "Renamed" } : n));
    const second = stabilizeNoteRows(cache, changed);
    expect(second[0]).toBe(first[0]);
    expect(second[2]).toBe(first[2]);
    expect(second[1]).not.toBe(first[1]);
    expect(second[1]!.title).toBe("Renamed");
  });

  it("includes added notes and drops deleted ones from the cache", () => {
    const cache = new Map<string, Note>();
    const first = stabilizeNoteRows(cache, [makeNote("a"), makeNote("b")]);
    const second = stabilizeNoteRows(cache, [first[0]!, makeNote("c")]);
    expect(second.map((n) => n.id)).toEqual(["a", "c"]);
    expect(second[0]).toBe(first[0]);
    // Re-adding "b" later must not resurrect the stale cached object.
    const third = stabilizeNoteRows(cache, [...second, makeNote("b", { title: "b v2" })]);
    expect(third[2]).not.toBe(first[1]);
    expect(third[2]!.title).toBe("b v2");
  });

  it("preserves identity when rows reorder", () => {
    const cache = new Map<string, Note>();
    const first = stabilizeNoteRows(cache, [makeNote("a"), makeNote("b")]);
    const second = stabilizeNoteRows(cache, [first[1]!, first[0]!]);
    expect(second[0]).toBe(first[1]);
    expect(second[1]).toBe(first[0]);
  });

  it("handles an empty list", () => {
    const cache = new Map<string, Note>();
    stabilizeNoteRows(cache, [makeNote("a")]);
    expect(stabilizeNoteRows(cache, [])).toEqual([]);
    expect(cache.size).toBe(0);
  });

  it("is idempotent when run twice with the same input", () => {
    const cache = new Map<string, Note>();
    const input = [makeNote("a"), makeNote("b")];
    const first = stabilizeNoteRows(cache, input);
    const second = stabilizeNoteRows(cache, input);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });
});
