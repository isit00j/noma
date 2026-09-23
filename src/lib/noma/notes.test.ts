import { beforeEach, describe, expect, it, vi } from "vitest";
import * as sanitize from "./sanitize";
import { notePreview, pruneNotePreviewCache } from "./notes";
import type { Note } from "./types";

function makeNote(id: string, content: string, extra: Partial<Note> = {}): Note {
  return {
    id,
    title: `Note ${id}`,
    content,
    contentFormat: "tiptap-html",
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    folderId: null,
    tagIds: [],
    pinned: false,
    favorite: false,
    archived: false,
    deleted: false,
    deletedAt: null,
    reminderAt: null,
    wordCount: 0,
    ...extra,
  };
}

/** The pre-cache preview computation, used as the correctness reference. */
function referencePreview(note: Note, length = 140): string {
  const text = sanitize.htmlToPlainText(note.content);
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

const parseSpy = vi.spyOn(sanitize, "htmlToPlainText");

beforeEach(() => {
  // Start each test with an empty preview cache and a fresh parse count.
  pruneNotePreviewCache([]);
  parseSpy.mockClear();
});

describe("notePreview cache", () => {
  it("reuses the cached preview for unchanged notes across list refreshes", () => {
    const notes = [
      makeNote("a", "<p>Hello world</p>"),
      makeNote("b", "<p>Second note with <strong>bold</strong> text</p>"),
      makeNote("c", "<p>Third</p>"),
    ];

    const first = notes.map((note) => notePreview(note));
    expect(parseSpy).toHaveBeenCalledTimes(3);

    // Simulate a notes-table commit: useLiveQuery(toArray()) hands back fresh
    // object identities with identical content, defeating memo().
    const refreshed = notes.map((note) =>
      makeNote(note.id, note.content, { updatedAt: note.updatedAt + 1 }),
    );
    const second = refreshed.map((note) => notePreview(note));

    expect(second).toEqual(first);
    // No additional HTML parsing for unchanged notes.
    expect(parseSpy).toHaveBeenCalledTimes(3);
  });

  it("recomputes the preview only for the note whose content changed", () => {
    const notes = Array.from({ length: 20 }, (_, i) =>
      makeNote(`note-${i}`, `<p>Content of note ${i}</p>`),
    );
    notes.forEach((note) => notePreview(note));
    expect(parseSpy).toHaveBeenCalledTimes(20);

    // One note edited; the rest come back as fresh objects with same content.
    const refreshed = notes.map((note, i) =>
      i === 7
        ? makeNote(note.id, "<p>Completely new content here</p>")
        : makeNote(note.id, note.content),
    );
    const previews = refreshed.map((note) => notePreview(note));

    expect(parseSpy).toHaveBeenCalledTimes(21);
    expect(previews[7]).toBe(referencePreview(refreshed[7]!));
    expect(previews[7]).toContain("Completely new content here");
    expect(previews[0]).toBe(referencePreview(refreshed[0]!));
  });

  it("does not recompute when only non-content fields change", () => {
    const note = makeNote("a", "<p>Same content</p>");
    const expected = referencePreview(note);
    parseSpy.mockClear();
    expect(notePreview(note)).toBe(expected);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // Pin toggle bumps updatedAt via updateNote but leaves content alone.
    const pinned = makeNote("a", "<p>Same content</p>", { pinned: true, updatedAt: 2_000_000 });
    expect(notePreview(pinned)).toBe(expected);
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it("prunes cache entries for deleted notes so the cache stays bounded", () => {
    ["a", "b", "c"].forEach((id) => notePreview(makeNote(id, `<p>${id}</p>`)));
    expect(parseSpy).toHaveBeenCalledTimes(3);

    // Notes b and c were deleted; only a is still live.
    expect(pruneNotePreviewCache(["a"])).toBe(2);

    // b's entry is gone, so previewing it parses again; a is still cached.
    notePreview(makeNote("a", "<p>a</p>"));
    notePreview(makeNote("b", "<p>b</p>"));
    expect(parseSpy).toHaveBeenCalledTimes(4);
  });

  it("evicts oldest entries if the cache ever exceeds its bound", () => {
    const total = 10_500;
    for (let i = 0; i < total; i++) {
      notePreview(makeNote(`note-${i}`, `<p>note ${i}</p>`));
    }
    // All ids still "live", so pruning removes nothing; the hard cap applies.
    expect(pruneNotePreviewCache(Array.from({ length: total }, (_, i) => `note-${i}`))).toBe(0);
    // The earliest notes were evicted and must parse again.
    const before = parseSpy.mock.calls.length;
    notePreview(makeNote("note-0", "<p>note 0</p>"));
    expect(parseSpy.mock.calls.length).toBe(before + 1);
  });

  it("produces previews identical to the uncached implementation", () => {
    const cases: Array<{ id: string; content: string; length?: number }> = [
      { id: "empty", content: "" },
      { id: "plain", content: "Just plain text" },
      {
        id: "html",
        content: "<p>Hello <strong>world</strong></p><ul><li>one</li><li>two</li></ul>",
      },
      { id: "long", content: `<p>${"word ".repeat(100)}</p>` },
      { id: "exact", content: `<p>${"x".repeat(140)}</p>` },
      { id: "unicode", content: "<p>হ্যালো 🌍 مرحبا</p>" },
      { id: "entities", content: "<p>Fish &amp; chips &lt;3</p>" },
      { id: "custom-length", content: `<p>${"y".repeat(200)}</p>`, length: 20 },
      { id: "nested", content: "<div><p>a</p><p>b</p></div>" },
    ];
    for (const { id, content, length } of cases) {
      const note = makeNote(id, content);
      // First call computes, second call serves from cache — both must match.
      const expected = referencePreview(note, length);
      expect(notePreview(note, length)).toBe(expected);
      expect(notePreview(note, length)).toBe(expected);
    }
  });
});
