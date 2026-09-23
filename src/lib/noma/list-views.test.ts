import { describe, expect, it } from "vitest";
import { filterNotes, type ViewKind, type ViewState } from "./view";
import { searchNotes } from "./search";
import type { Folder, Note, Tag } from "./types";

function makeNote(id: string, extra: Partial<Note> = {}): Note {
  return {
    id,
    title: `Title ${id}`,
    content: `<p>Body ${id}</p>`,
    contentFormat: "tiptap-html",
    createdAt: 1000,
    updatedAt: 1000,
    folderId: null,
    tagIds: [],
    pinned: false,
    favorite: false,
    archived: false,
    deleted: false,
    deletedAt: null,
    reminderAt: null,
    wordCount: 5,
    ...extra,
  };
}

function makeFolder(id: string, name: string): Folder {
  return { id, name, parentId: null, createdAt: 1000, updatedAt: 1000 };
}

function makeTag(id: string, name: string): Tag {
  return { id, name, createdAt: 1000 };
}

const view = (kind: ViewKind, id?: string | null): ViewState =>
  id === undefined ? { kind } : { kind, id };

describe("filterNotes", () => {
  const notes = [
    makeNote("old", { updatedAt: 1000 }),
    makeNote("new", { updatedAt: 3000 }),
    makeNote("pinned-old", { updatedAt: 500, pinned: true }),
    makeNote("fav", { updatedAt: 2000, favorite: true }),
    makeNote("archived", { updatedAt: 4000, archived: true }),
    makeNote("trashed", { updatedAt: 5000, deleted: true, deletedAt: 5000 }),
    makeNote("foldered", { updatedAt: 1500, folderId: "f1" }),
    makeNote("tagged", { updatedAt: 2500, tagIds: ["t1"] }),
    makeNote("recent", { updatedAt: Date.now() - 1000 }),
  ];

  it("sorts the all view pinned-first, then by updatedAt descending", () => {
    const ids = filterNotes(notes, view("all")).map((n) => n.id);
    // Pinned first, then the rest newest-first; archived/trashed excluded.
    expect(ids).toEqual(["pinned-old", "recent", "new", "tagged", "fav", "foldered", "old"]);
  });

  it("excludes deleted notes from the all view and lists them in trash", () => {
    expect(filterNotes(notes, view("all")).some((n) => n.deleted)).toBe(false);
    expect(filterNotes(notes, view("trash")).map((n) => n.id)).toEqual(["trashed"]);
  });

  it("filters archive, pinned, and favorites views", () => {
    expect(filterNotes(notes, view("archive")).map((n) => n.id)).toEqual(["archived"]);
    expect(filterNotes(notes, view("pinned")).map((n) => n.id)).toEqual(["pinned-old"]);
    expect(filterNotes(notes, view("favorites")).map((n) => n.id)).toEqual(["fav"]);
  });

  it("filters folder and tag views", () => {
    expect(filterNotes(notes, view("folder", "f1")).map((n) => n.id)).toEqual(["foldered"]);
    expect(filterNotes(notes, view("folder", "nope"))).toEqual([]);
    expect(filterNotes(notes, view("tag", "t1")).map((n) => n.id)).toEqual(["tagged"]);
    expect(filterNotes(notes, view("tag", "nope"))).toEqual([]);
  });

  it("limits the recent view to the recent window", () => {
    const ids = filterNotes(notes, view("recent")).map((n) => n.id);
    expect(ids).toEqual(["recent"]);
  });
});

describe("searchNotes", () => {
  const folders = [makeFolder("f1", "Work")];
  const tags = [makeTag("t1", "urgent")];
  const notes = [
    makeNote("a", { title: "Shopping list", content: "<p>milk and eggs</p>" }),
    makeNote("b", { title: "Meeting notes", content: "<p>discuss roadmap</p>", folderId: "f1" }),
    makeNote("c", { title: "Ideas", content: "<p>weekend trip</p>", tagIds: ["t1"] }),
  ];

  it("returns nothing for an empty query", () => {
    expect(searchNotes("   ", notes, folders, tags)).toEqual([]);
  });

  it("matches titles above body text", () => {
    const results = searchNotes("shopping", notes, folders, tags);
    expect(results.map((r) => r.note.id)).toEqual(["a"]);
  });

  it("matches body text, folder names, and tag names", () => {
    expect(searchNotes("roadmap", notes, folders, tags).map((r) => r.note.id)).toEqual(["b"]);
    expect(searchNotes("work", notes, folders, tags).map((r) => r.note.id)).toEqual(["b"]);
    expect(searchNotes("urgent", notes, folders, tags).map((r) => r.note.id)).toEqual(["c"]);
  });

  it("requires every term to match somewhere", () => {
    expect(searchNotes("shopping roadmap", notes, folders, tags)).toEqual([]);
    expect(searchNotes("shopping milk", notes, folders, tags).map((r) => r.note.id)).toEqual(["a"]);
  });
});
