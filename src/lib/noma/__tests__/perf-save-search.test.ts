/**
 * TEMPORARY regression tests: search computation + save/write timing on the
 * real code paths (searchNotes, createNote, updateNote).
 * Delete with src/lib/noma/__tests__ when the baseline is done.
 */
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { NomaDatabase } from "../db";
import { generateFixture } from "../perf-fixture";
import { createNote, updateNote } from "../notes";
import { searchNotes } from "../search";

vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: {} }));

let dbSeq = 0;
function freshDb(): NomaDatabase {
  dbSeq += 1;
  return new NomaDatabase(`perf-savesearch-test-${dbSeq}-${Date.now()}`);
}

describe("search computation", () => {
  it("finds fixture notes and times the query", async () => {
    const db = freshDb();
    await generateFixture(db, { noteCount: 100 });
    const notes = await db.notes.toArray();
    const folders = await db.folders.toArray();
    const tags = await db.tags.toArray();
    const live = notes.filter((n) => !n.deleted);

    const t0 = performance.now();
    const hits = searchNotes("morning", live, folders, tags);
    const ms = performance.now() - t0;
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(hits.length).toBeGreaterThan(0);

    // A nonsense query returns nothing (and still times cleanly).
    const t1 = performance.now();
    const empty = searchNotes("zzz-no-match-xyz", live, folders, tags);
    const ms2 = performance.now() - t1;
    expect(empty).toHaveLength(0);
    expect(ms2).toBeGreaterThanOrEqual(0);
    await db.close();
  });
});

describe("save / write timing", () => {
  it("createNote + updateNote round-trip on the real path", async () => {
    const db = freshDb();
    const tCreate = performance.now();
    const note = await createNote(db, { title: "bench", content: "<p>bench</p>" });
    const createMs = performance.now() - tCreate;
    expect(createMs).toBeGreaterThanOrEqual(0);

    const stored = await db.notes.get(note.id);
    expect(stored?.title).toBe("bench");

    const tUpdate = performance.now();
    await updateNote(db, note.id, { title: "bench 2" });
    const updateMs = performance.now() - tUpdate;
    expect(updateMs).toBeGreaterThanOrEqual(0);
    expect((await db.notes.get(note.id))?.title).toBe("bench 2");

    await db.notes.delete(note.id);
    await db.close();
  });
});
