/**
 * TEMPORARY regression tests: fixture determinism + Dexie benchmarks.
 * Delete with src/lib/noma/__tests__ when the baseline is done.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { NomaDatabase } from "../db";
import { clearFixture, generateFixture, runDexieBench } from "../perf-fixture";

let dbSeq = 0;
function freshDb(): NomaDatabase {
  dbSeq += 1;
  return new NomaDatabase(`perf-fixture-test-${dbSeq}-${Date.now()}`);
}

beforeEach(async () => {
  // fake-indexeddb persists per database name; unique names isolate tests.
});

describe("perf fixture", () => {
  it("generates the requested note count with folders/tags/attachments", async () => {
    const db = freshDb();
    const result = await generateFixture(db, { noteCount: 100 });
    expect(result.noteCount).toBe(100);
    expect(result.folderCount).toBe(5);
    expect(result.tagCount).toBe(8);
    expect(result.deterministic).toBe(true);
    expect(result.generationMs).toBeGreaterThanOrEqual(0);
    // ~10% attachment share (allow generous tolerance for PRNG variance).
    expect(result.attachmentCount).toBeGreaterThan(2);
    expect(result.attachmentCount).toBeLessThan(25);

    expect(await db.notes.count()).toBe(100);
    expect(await db.folders.count()).toBe(5);
    expect(await db.tags.count()).toBe(8);
    const sample = await db.notes.get("perf-note-0");
    expect(sample).toBeDefined();
    expect(sample!.content.length).toBeGreaterThan(0);
    await db.close();
  });

  it("is byte-identical across runs (deterministic)", async () => {
    const dbA = freshDb();
    const dbB = freshDb();
    await generateFixture(dbA, { noteCount: 100 });
    await generateFixture(dbB, { noteCount: 100 });
    const [notesA, notesB] = await Promise.all([dbA.notes.toArray(), dbB.notes.toArray()]);
    const [foldersA, foldersB] = await Promise.all([dbA.folders.toArray(), dbB.folders.toArray()]);
    const [tagsA, tagsB] = await Promise.all([dbA.tags.toArray(), dbB.tags.toArray()]);
    const [attA, attB] = await Promise.all([dbA.attachments.toArray(), dbB.attachments.toArray()]);
    expect(JSON.stringify(notesA)).toBe(JSON.stringify(notesB));
    expect(JSON.stringify(foldersA)).toBe(JSON.stringify(foldersB));
    expect(JSON.stringify(tagsA)).toBe(JSON.stringify(tagsB));
    expect(JSON.stringify(attA)).toBe(JSON.stringify(attB));
    await dbA.close();
    await dbB.close();
  });

  it("is idempotent: regenerating replaces the previous fixture", async () => {
    const db = freshDb();
    await generateFixture(db, { noteCount: 100 });
    await generateFixture(db, { noteCount: 500 });
    expect(await db.notes.count()).toBe(500);
    await db.close();
  });

  it("clearFixture removes every perf- row", async () => {
    const db = freshDb();
    await generateFixture(db, { noteCount: 100 });
    const { deletedNotes } = await clearFixture(db);
    expect(deletedNotes).toBe(100);
    expect(await db.notes.count()).toBe(0);
    expect(await db.folders.count()).toBe(0);
    expect(await db.tags.count()).toBe(0);
    expect(await db.attachments.count()).toBe(0);
    await db.close();
  });
});

describe("dexie bench", () => {
  it("returns sane timings and cleans up its scratch note", async () => {
    const db = freshDb();
    await generateFixture(db, { noteCount: 100 });
    const bench = await runDexieBench(db);
    expect(bench.noteCount).toBe(100);
    for (const key of [
      "countMs",
      "toArrayMs",
      "indexedFolderQueryMs",
      "recentSliceMs",
      "putMs",
      "updateMs",
      "deleteMs",
    ] as const) {
      expect(typeof bench[key]).toBe("number");
      expect(bench[key]).toBeGreaterThanOrEqual(0);
    }
    // Scratch note must not leak into the database.
    expect(await db.notes.filter((n) => n.id.startsWith("perf-bench")).count()).toBe(0);
    expect(await db.notes.count()).toBe(100);
    await db.close();
  });
});
