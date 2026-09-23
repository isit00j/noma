import { useMemo, useRef } from "react";
import type { Note } from "@/lib/noma/types";

/**
 * Field-wise equality for note rows.
 *
 * Note is a flat Dexie record; the only non-primitive field is `tagIds`
 * (string[]), which is compared element-wise. Every field participates in
 * the comparison — including any field added to Note in the future — so a
 * changed row can never be mistaken for an unchanged one and serve stale
 * data. The generic comparison is deliberate: an explicit field list would
 * silently go stale when Note grows.
 */
export function noteRowEqual(a: Note, b: Note): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const valueA: unknown = a[key as keyof Note];
    const valueB: unknown = (b as unknown as Record<string, unknown>)[key];
    if (Array.isArray(valueA) || Array.isArray(valueB)) {
      if (!Array.isArray(valueA) || !Array.isArray(valueB) || valueA.length !== valueB.length) {
        return false;
      }
      for (let i = 0; i < valueA.length; i++) {
        if (valueA[i] !== valueB[i]) return false;
      }
    } else if (valueA !== valueB) {
      return false;
    }
  }
  return true;
}

/**
 * Reconciles a fresh notes array against the previous one, reusing the
 * previous object identity for rows whose fields are unchanged.
 *
 * `cache` maps note id → the object handed out on the previous pass. Rows
 * that compare equal keep their old identity (so React.memo downstream can
 * bail out); changed, added, or reordered rows use the fresh objects. Ids
 * absent from `notes` are dropped from the cache.
 *
 * The function is idempotent: running it twice with the same input yields
 * the same output and leaves the cache in the same state.
 */
export function stabilizeNoteRows(cache: Map<string, Note>, notes: Note[]): Note[] {
  const seen = new Set<string>();
  const result = notes.map((note) => {
    seen.add(note.id);
    const prev = cache.get(note.id);
    if (prev !== undefined && noteRowEqual(prev, note)) return prev;
    cache.set(note.id, note);
    return note;
  });
  for (const id of cache.keys()) {
    if (!seen.has(id)) cache.delete(id);
  }
  return result;
}

/**
 * Stabilizes the row identities coming out of `useLiveQuery`.
 *
 * Dexie materializes brand-new objects for every row on each notes-table
 * commit, which defeats `React.memo` further down the tree (every row
 * re-renders on every single-note mutation or autosave). This hook reuses
 * the previous object for rows whose fields are unchanged, so only
 * actually-changed rows produce new identities.
 *
 * Correctness note: a row is only reused when `noteRowEqual` confirms every
 * field matches, so the hook can never serve stale field data — the worst
 * case of a missed match is an extra re-render, never a wrong row.
 */
export function useStableNotes(notes: Note[] | undefined): Note[] {
  const cacheRef = useRef<Map<string, Note> | null>(null);
  if (cacheRef.current === null) cacheRef.current = new Map<string, Note>();
  const cache = cacheRef.current;
  return useMemo(() => stabilizeNoteRows(cache, notes ?? []), [notes, cache]);
}
