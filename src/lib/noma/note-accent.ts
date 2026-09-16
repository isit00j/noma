import type { Note } from "./types";

/**
 * Number of stable accent buckets used for the note-card fingerprint rail.
 * Kept small so related notes (same folder, same first tag) share an accent
 * while notes with different identities stay distinguishable.
 */
export const NOTE_ACCENT_BUCKETS = 12;

/** FNV-1a 32-bit hash: tiny, deterministic, and stable across sessions. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Stable visual-fingerprint bucket for a note card's accent rail.
 *
 * Identity source preference:
 *  1. folder identity when the note belongs to a folder
 *  2. first assigned tag
 *  3. the note id itself
 *
 * The bucket never changes for the same note, no matter how the list is
 * reordered, filtered, or reopened, and no randomness is involved.
 */
export function noteAccentBucket(note: Note): number {
  const source =
    note.folderId != null
      ? `f:${note.folderId}`
      : note.tagIds.length > 0
        ? `t:${note.tagIds[0]}`
        : `n:${note.id}`;
  return hashString(source) % NOTE_ACCENT_BUCKETS;
}

/** CSS class applied to a note card for its accent bucket. */
export function noteAccentClass(bucket: number): string {
  return `note-accent-${bucket}`;
}
