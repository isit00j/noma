/**
 * TEMPORARY deterministic fixture generator + Dexie micro-benchmark for the
 * J7 Prime baseline. Tagged TEMP-PERF. Delete with `perf-instrumentation.ts`.
 *
 * Determinism: a fixed-seed PRNG (mulberry32) drives all content, so the
 * fixture is byte-identical across runs and devices for a given note count.
 * Fixture rows use the `perf-` id prefix and are removed by clearFixture().
 */

import type { NomaDatabase } from "./db";
import { pmark, pmeasure, pset, PERF_ENABLED } from "./perf-instrumentation";
import type { AttachmentMeta, Folder, Note, Tag } from "./types";

export const PERF_ID_PREFIX = "perf-";

/** mulberry32 — small deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1x1 transparent PNG (~70 bytes). Deterministic stand-in for photo
// attachments: exercises the attachment metadata + data-URL storage path at
// scale. Caveat: real photos are MBs — this does NOT measure MB throughput.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const WORDS = (
  "noma note calm quiet morning light focus thought idea draft sketch plan " +
  "list remember later today tomorrow week project work home travel book read " +
  "write draw code design review meeting call message task done pending idea " +
  "again still always never often under over between through during without " +
  "within about into over after before"
).split(" ");

const TITLES = [
  "Morning pages",
  "Project kickoff",
  "Shopping list",
  "Book notes",
  "Travel ideas",
  "Meeting recap",
  "Weekend plan",
  "Design review",
  "Random thoughts",
  "Reading list",
];

function pick(rng: () => number, arr: string[]): string {
  return arr[Math.floor(rng() * arr.length)]!;
}

function makeParagraph(rng: () => number, wordCount: number): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) words.push(pick(rng, WORDS));
  return `<p>${words.join(" ")}</p>`;
}

export interface FixtureOptions {
  noteCount: 100 | 500 | 2000;
  /** Share of notes carrying one image attachment (0..1). Default 0.1. */
  attachmentShare?: number;
}

export interface FixtureResult {
  noteCount: number;
  folderCount: number;
  tagCount: number;
  attachmentCount: number;
  generationMs: number;
  deterministic: true;
}

/**
 * Generates a deterministic fixture. Idempotent: clears any previous
 * fixture first. Bulk-inserts inside one transaction.
 */
export async function generateFixture(
  db: NomaDatabase,
  options: FixtureOptions,
): Promise<FixtureResult> {
  const { noteCount, attachmentShare = 0.1 } = options;
  const start = performance.now();
  pmark("fixture-gen-start");

  await clearFixture(db);

  const rng = mulberry32(0x9e3779b9);
  // TEMP-PERF: fixed wall-clock anchor (2026-01-01T00:00:00Z) so every
  // timestamp derives from the seed — the fixture is byte-identical across
  // runs and devices for a given note count.
  const now = 1767225600000;

  const folders: Folder[] = Array.from({ length: 5 }, (_, i) => ({
    id: `${PERF_ID_PREFIX}folder-${i}`,
    name: `Perf Folder ${i + 1}`,
    parentId: null,
    createdAt: now,
    updatedAt: now,
  }));

  const tags: Tag[] = Array.from({ length: 8 }, (_, i) => ({
    id: `${PERF_ID_PREFIX}tag-${i}`,
    name: `perf-tag-${i + 1}`,
    createdAt: now,
    updatedAt: now,
  }));

  const notes: Note[] = [];
  const attachments: AttachmentMeta[] = [];

  for (let i = 0; i < noteCount; i++) {
    const id = `${PERF_ID_PREFIX}note-${i}`;
    // Mixed lengths: 50% short (~25 words), 30% medium (~150), 20% long (~800).
    const tier = rng();
    const wordCount =
      tier < 0.5
        ? 20 + Math.floor(rng() * 15)
        : tier < 0.8
          ? 120 + Math.floor(rng() * 60)
          : 700 + Math.floor(rng() * 200);
    const paragraphs = Math.max(1, Math.round(wordCount / 60));
    let content = "";
    for (let p = 0; p < paragraphs; p++) {
      content += makeParagraph(rng, Math.ceil(wordCount / paragraphs));
    }

    const tagIds: string[] = [];
    const tagCount = Math.floor(rng() * 3);
    for (let t = 0; t < tagCount; t++) {
      const tagId = `${PERF_ID_PREFIX}tag-${Math.floor(rng() * tags.length)}`;
      if (!tagIds.includes(tagId)) tagIds.push(tagId);
    }

    const createdAt = now - Math.floor(rng() * 365 * 24 * 3600 * 1000);
    const note: Note = {
      id,
      title: `${pick(rng, TITLES)} ${i + 1}`,
      content,
      contentFormat: "tiptap-html",
      createdAt,
      updatedAt: createdAt + Math.floor(rng() * 7 * 24 * 3600 * 1000),
      folderId:
        rng() < 0.6 ? `${PERF_ID_PREFIX}folder-${Math.floor(rng() * folders.length)}` : null,
      tagIds,
      pinned: rng() < 0.05,
      favorite: rng() < 0.08,
      archived: rng() < 0.05,
      deleted: false,
      deletedAt: null,
      reminderAt: null,
      wordCount,
    };

    if (rng() < attachmentShare) {
      const attId = `${PERF_ID_PREFIX}att-${i}`;
      attachments.push({
        id: attId,
        noteId: id,
        name: `perf-image-${i}.png`,
        mimeType: "image/png",
        size: TINY_PNG_DATA_URL.length,
        createdAt: now,
        data: TINY_PNG_DATA_URL,
      });
      note.content += `<p><img src="noma-attachment://${attId}" alt="perf-image-${i}"></p>`;
    }

    notes.push(note);
  }

  await db.transaction("rw", [db.notes, db.folders, db.tags, db.attachments], async () => {
    await db.folders.bulkAdd(folders);
    await db.tags.bulkAdd(tags);
    await db.notes.bulkAdd(notes);
    if (attachments.length > 0) await db.attachments.bulkAdd(attachments);
  });

  const generationMs = performance.now() - start;
  pmark("fixture-gen-end");
  pmeasure("fixture-generation", "fixture-gen-start", "fixture-gen-end");
  const result: FixtureResult = {
    noteCount: notes.length,
    folderCount: folders.length,
    tagCount: tags.length,
    attachmentCount: attachments.length,
    generationMs: Math.round(generationMs * 100) / 100,
    deterministic: true,
  };
  pset("lastFixture", result);
  return result;
}

/** Removes all fixture rows (id prefix `perf-`). */
export async function clearFixture(db: NomaDatabase): Promise<{ deletedNotes: number }> {
  const [deletedNotes] = await Promise.all([
    db.notes.where("id").startsWith(PERF_ID_PREFIX).delete(),
    db.attachments.where("id").startsWith(PERF_ID_PREFIX).delete(),
    db.folders.where("id").startsWith(PERF_ID_PREFIX).delete(),
    db.tags.where("id").startsWith(PERF_ID_PREFIX).delete(),
  ]);
  return { deletedNotes };
}

export interface DexieBenchResult {
  ranAt: string;
  noteCount: number;
  /** Full-table scan — the same shape as the workspace list query. */
  countMs: number;
  toArrayMs: number;
  /** Indexed query by folderId. */
  indexedFolderQueryMs: number;
  /** orderBy(updatedAt).reverse().limit(50) — typical "recent" slice. */
  recentSliceMs: number;
  putMs: number;
  updateMs: number;
  deleteMs: number;
}

function timeIt<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  return fn().then((result) => ({ result, ms: performance.now() - start }));
}

/**
 * Representative Dexie operations. Uses a scratch note and deletes it, so
 * the library is untouched. Safe to run repeatedly.
 */
export async function runDexieBench(db: NomaDatabase): Promise<DexieBenchResult> {
  if (!PERF_ENABLED) throw new Error("perf instrumentation disabled");
  pmark("dexie-bench-start");

  const { ms: countMs, result: noteCount } = await timeIt(() => db.notes.count());
  const { ms: toArrayMs } = await timeIt(() => db.notes.toArray());
  const anyFolder = await db.folders.orderBy("name").first();
  const { ms: indexedFolderQueryMs } = await timeIt(() =>
    (anyFolder
      ? db.notes.where("folderId").equals(anyFolder.id)
      : db.notes.where("folderId").equals("__none__")
    ).toArray(),
  );
  const { ms: recentSliceMs } = await timeIt(() =>
    db.notes.orderBy("updatedAt").reverse().limit(50).toArray(),
  );

  const scratchId = `${PERF_ID_PREFIX}bench-scratch`;
  const scratch: Note = {
    id: scratchId,
    title: "bench",
    content: "<p>bench</p>",
    contentFormat: "tiptap-html",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    folderId: null,
    tagIds: [],
    pinned: false,
    favorite: false,
    archived: false,
    deleted: false,
    deletedAt: null,
    reminderAt: null,
    wordCount: 1,
  };
  const { ms: putMs } = await timeIt(() => db.notes.put(scratch));
  const { ms: updateMs } = await timeIt(() => db.notes.update(scratchId, { title: "bench2" }));
  const { ms: deleteMs } = await timeIt(() => db.notes.delete(scratchId));

  const round = (n: number) => Math.round(n * 100) / 100;
  const result: DexieBenchResult = {
    ranAt: new Date().toISOString(),
    noteCount,
    countMs: round(countMs),
    toArrayMs: round(toArrayMs),
    indexedFolderQueryMs: round(indexedFolderQueryMs),
    recentSliceMs: round(recentSliceMs),
    putMs: round(putMs),
    updateMs: round(updateMs),
    deleteMs: round(deleteMs),
  };
  pmark("dexie-bench-end");
  pset("dexieBench", result);
  return result;
}
