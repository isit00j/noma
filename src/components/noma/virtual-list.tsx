import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, Ref } from "react";

/**
 * Imperative handle for a VirtualList.
 */
export interface VirtualListHandle {
  /**
   * Re-sync the virtualizer's internal scroll state with the scroll element.
   * Call this after the scroll element becomes visible again (e.g. after the
   * list surface is unhidden) — it refreshes the cached viewport height,
   * which is stale while the element has no layout.
   */
  syncViewport: () => void;
}

interface VirtualListProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string;
  /**
   * The scrollable element this list renders into. Owned by the parent (the
   * notes-list surface) so sibling views can share the same scroller; the
   * virtualizer only attaches a passive scroll listener and reads
   * scrollTop/clientHeight from it. Passed as a plain element (published via
   * parent state) rather than a ref object: child layout effects run before
   * a parent's ref attaches, so `.current` would be null during mount.
   */
  scrollElement: HTMLDivElement | null;
  /** Estimated row content height (px) for rows not yet measured. */
  estimateSize?: number;
  /** Extra rows rendered above and below the visible window. */
  overscan?: number;
  className?: string;
  listRef?: Ref<VirtualListHandle> | undefined;
  renderItem: (item: T, index: number) => ReactNode;
}

/**
 * Gap between rows (px). Matches the list's previous `space-y-3` rhythm;
 * each row wrapper carries it as bottom padding so the measured slot size
 * already includes the gap.
 */
const ROW_GAP = 12;
/** Top/bottom breathing room (px). Matches the list's previous `p-4`. */
const EDGE_PAD = 16;
/** Top/bottom breathing room (px) at the `sm` breakpoint and up. Matches the
 * list's previous `sm:p-6`. */
const EDGE_PAD_SM = 24;
/** Tailwind `sm` breakpoint (px). */
const SM_BREAKPOINT = 640;

/** First index whose bottom edge is below `y`. */
function firstIndexWithBottomBelow(offsets: number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1]! > y) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** First index whose top edge is at or below `y`. */
function firstIndexWithTopAtOrBelow(offsets: number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid]! >= y) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Minimal purpose-built vertical virtualizer for the notes list.
 *
 * Renders only the visible window plus overscan rows, in normal document
 * flow between top/bottom spacer divs (no absolute positioning, so tab
 * order, focus, and existing row CSS behave exactly as in a full list).
 * Row heights are measured on render into a per-key map; unmeasured rows
 * use `estimateSize`. Offsets are prefix sums recomputed only when the
 * items or the measurements change — scrolling itself is O(log n) binary
 * searches plus a small window re-render.
 *
 * Deliberately avoids ResizeObserver/IntersectionObserver: a passive scroll
 * listener (rAF-throttled) plus offsetHeight reads on the ~20 rendered rows
 * is sufficient and safe on old Android WebViews.
 */
export function VirtualList<T>({
  items,
  getKey,
  scrollElement,
  estimateSize = 120,
  overscan = 6,
  className,
  listRef,
  renderItem,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [sizesVersion, setSizesVersion] = useState(0);
  // Tracks the Tailwind `sm` breakpoint so the list's top/bottom breathing
  // room matches the previous `p-4 sm:p-6` (16px mobile, 24px sm+).
  const [isSmUp, setIsSmUp] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(`(min-width: ${SM_BREAKPOINT}px)`).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${SM_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsSmUp(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const edgePad = isSmUp ? EDGE_PAD_SM : EDGE_PAD;
  // note key -> measured slot height (content + ROW_GAP, via the wrapper's
  // padding-bottom). Ref (not state): mutated during measurement, and a
  // version counter drives the one re-render that recomputes offsets.
  const sizesRef = useRef(new Map<string, number>());
  // note key -> live row wrapper element, for measurement.
  const rowElsRef = useRef(new Map<string, HTMLDivElement>());
  // Mirror of scrollTop for imperative reads (scroll events are async).
  const scrollTopRef = useRef(0);
  // Layout (index map + offsets) of the previous items array, for scroll
  // compensation when rows are removed.
  const prevLayoutRef = useRef<{ indexByKey: Map<string, number>; offsets: number[] } | null>(null);
  // Key of the row (data-vkey) that last received focus inside the scroller,
  // tracked via focusin so it works even when focusing causes no re-render.
  const focusedKeyRef = useRef<string | null>(null);
  const estimatedSlot = estimateSize + ROW_GAP;

  const { offsets, indexByKey, totalSize } = useMemo(() => {
    const offsets = new Array<number>(items.length + 1);
    const indexByKey = new Map<string, number>();
    offsets[0] = edgePad;
    for (let i = 0; i < items.length; i++) {
      const key = getKey(items[i]!, i);
      indexByKey.set(key, i);
      offsets[i + 1] = offsets[i]! + (sizesRef.current.get(key) ?? estimatedSlot);
    }
    // Drop the trailing inter-row gap; keep the edge pad.
    const totalSize = offsets[items.length]! - ROW_GAP + edgePad;
    return { offsets, indexByKey, totalSize };
    // sizesRef is a stable ref mutated during measurement; sizesVersion is
    // the reactive signal for those mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sizesVersion, getKey, estimatedSlot, edgePad]);

  // Window for the current scroll position. Clamped so an out-of-range
  // scrollTop (e.g. after items shrink) renders an empty window rather than
  // garbage; a layout effect below clamps the DOM node to match.
  const maxScrollTop = Math.max(0, totalSize - viewportHeight);
  const clampedScrollTop = Math.min(Math.max(0, scrollTop), maxScrollTop);
  const startIdx = firstIndexWithBottomBelow(offsets, clampedScrollTop);
  const endIdx = firstIndexWithTopAtOrBelow(offsets, clampedScrollTop + viewportHeight);
  const from = Math.max(0, startIdx - overscan);
  const to = Math.min(items.length, endIdx + overscan);
  const topPad = offsets[from]!;
  const bottomPad = Math.max(0, totalSize - offsets[to]!);

  // Stable ref callback per row key, cached by key so the SAME function
  // instance is returned across renders. This is critical: `ref={setRowEl(key)}`
  // must not create a new closure every render, otherwise React detaches and
  // reattaches the ref on every commit. That detach/reattach cycle interacts
  // badly with Radix's useComposedRefs (e.g. Switch calls the useState setter
  // `setControl` on ref attach/detach), producing React error #185
  // "Maximum update depth exceeded". On detach the key is removed so the
  // measurement pass never reads a detached node (whose offsetHeight is 0).
  const rowElCallbacksRef = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  // Guards against infinite measure -> setState loops (React #185) when row
  // heights are unstable on slow devices. Counts consecutive renders where
  // measurement found changed heights; stops triggering re-renders after 5.
  const measureLoopGuardRef = useRef(0);
  const setRowEl = useCallback((key: string) => {
    let cb = rowElCallbacksRef.current.get(key);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) rowElsRef.current.set(key, el);
        else {
          rowElsRef.current.delete(key);
          // The row unmounted: drop the cached callback too, so callbacks
          // don't accumulate indefinitely for permanently deleted notes.
          // Safe: while mounted the instance stays stable across renders
          // (the React #185 concern); on remount a fresh one is created.
          rowElCallbacksRef.current.delete(key);
        }
      };
      rowElCallbacksRef.current.set(key, cb);
    }
    return cb;
  }, []);

  useImperativeHandle(
    listRef,
    () => ({
      syncViewport: () => {
        if (!scrollElement) return;
        const st = scrollElement.scrollTop;
        const vh = scrollElement.clientHeight;
        scrollTopRef.current = st;
        setScrollTop(st);
        setViewportHeight(vh);
      },
    }),
    [scrollElement],
  );

  // Attach the scroll listener and capture the initial viewport height.
  // Passive + rAF-throttled: scroll events never run React work directly.
  useLayoutEffect(() => {
    const el = scrollElement;
    if (!el) return;
    scrollTopRef.current = el.scrollTop;
    setScrollTop(el.scrollTop);
    setViewportHeight(el.clientHeight);
    let raf = 0;
    const update = () => {
      raf = 0;
      const st = el.scrollTop;
      const vh = el.clientHeight;
      scrollTopRef.current = st;
      setScrollTop((prev) => (prev === st ? prev : st));
      setViewportHeight((prev) => (prev === vh ? prev : vh));
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollElement]);

  // Track which row holds focus, so a focused row that is virtualized away
  // can be detected even when focusing triggered no re-render.
  useLayoutEffect(() => {
    const el = scrollElement;
    if (!el) return;
    const onFocusIn = (e: FocusEvent) => {
      const row = (e.target as HTMLElement | null)?.closest?.("[data-vkey]");
      focusedKeyRef.current = row?.getAttribute("data-vkey") ?? null;
    };
    el.addEventListener("focusin", onFocusIn);
    return () => el.removeEventListener("focusin", onFocusIn);
  }, [scrollElement]);

  // When rows above the viewport are removed (archive/trash/delete), shift
  // the scroll position up by the removed height so the visible content
  // stays put instead of jumping. Runs only when the items array changes —
  // never per scroll frame. Declared BEFORE the clamp effect: compensation
  // must see the pre-clamp scroll position, otherwise clamping first would
  // destroy the information needed to keep visible content stable.
  useLayoutEffect(() => {
    const prev = prevLayoutRef.current;
    prevLayoutRef.current = { indexByKey, offsets };
    const el = scrollElement;
    if (!prev || !el) return;
    const st = el.scrollTop;
    let removedAbove = 0;
    prev.indexByKey.forEach((idx, key) => {
      if (!indexByKey.has(key) && prev.offsets[idx]! < st) {
        removedAbove += prev.offsets[idx + 1]! - prev.offsets[idx]!;
      }
    });
    if (removedAbove > 0) {
      const next = Math.max(0, st - removedAbove);
      el.scrollTop = next;
      scrollTopRef.current = next;
      setScrollTop(next);
    }
  }, [items, indexByKey, offsets, scrollElement]);

  // Clamp the DOM scroll position when the content shrinks under it
  // (e.g. deleting/archiving notes, switching to a shorter view).
  useLayoutEffect(() => {
    const el = scrollElement;
    if (!el) return;
    const max = Math.max(0, totalSize - viewportHeight);
    if (el.scrollTop > max) {
      el.scrollTop = max;
      scrollTopRef.current = max;
      setScrollTop(max);
    }
  }, [items, totalSize, viewportHeight, scrollElement]);

  // Post-commit pass (pre-paint): measure rendered rows, fix up scroll when
  // a row above the viewport changed height, and recover focus if the
  // focused row was virtualized away. Runs after every render; the work is
  // ~20 offsetHeight reads and is a no-op when nothing changed.
  // Intentionally no dep array: row heights can change without items,
  // scroll, or viewport changing (e.g. a note edited in place), and the
  // pass must observe every commit to keep offsets and scroll truthful.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const scroller = scrollElement;
    if (!scroller) return;
    // Skip measurement when the list is hidden (display:none). offsetHeight
    // is 0 for all rows in a hidden subtree, and measuring would corrupt the
    // height map with zeros, causing layout jumps when unhidden.
    if (scroller.offsetParent === null) return;
    const st = scroller.scrollTop;
    let changed = false;
    let shift = 0;
    rowElsRef.current.forEach((el, key) => {
      const h = el.offsetHeight;
      const prev = sizesRef.current.get(key);
      // Ignore tiny fluctuations (< 2px) from layout timing on slow devices.
      // Only significant changes trigger a re-render, preventing infinite
      // measure -> setState -> re-render loops (React #185).
      if (prev === undefined || Math.abs(prev - h) >= 2) {
        sizesRef.current.set(key, h);
        changed = true;
        const idx = indexByKey.get(key);
        // A row above the viewport changing height would visibly jump the
        // content; compensate synchronously, before paint.
        if (idx !== undefined && offsets[idx]! < st) {
          shift += h - (prev ?? estimatedSlot);
        }
      }
    });
    if (shift !== 0) {
      const next = st + shift;
      scroller.scrollTop = next;
      scrollTopRef.current = next;
      setScrollTop(next);
    }
    if (changed) {
      // Safeguard: if heights change on every single render (unstable layout),
      // stop after 5 consecutive measurements to prevent React #185.
      // The last measured heights are kept; the UI remains functional.
      const consecutive = (measureLoopGuardRef.current += 1);
      if (consecutive <= 5) {
        setSizesVersion((v) => v + 1);
      }
    } else {
      measureLoopGuardRef.current = 0;
    }

    // Prune stale height entries for permanently deleted notes. Only runs
    // when the map is clearly bloated (>2x the current items), so heights
    // for notes that are merely filtered out or reordered are preserved in
    // normal operation. Map iterates in insertion order, so this removes
    // oldest-first among keys absent from the current dataset. The worst
    // case for a pruned live note is one re-measure on next visibility.
    if (sizesRef.current.size > items.length * 2) {
      for (const key of sizesRef.current.keys()) {
        if (sizesRef.current.size <= items.length) break;
        if (!indexByKey.has(key)) sizesRef.current.delete(key);
      }
    }

    const ae = document.activeElement;
    const focusedKey = focusedKeyRef.current;
    // Focus is "lost" when it sits on <body>/nothing, or on a node that is
    // no longer in the document (e.g. the unmounted row itself). A connected
    // element outside the scroller means the user moved focus intentionally —
    // never steal that.
    const focusLost =
      ae === null || ae === document.body || (ae instanceof Node && !ae.isConnected);
    if (focusedKey !== null && !rowElsRef.current.has(focusedKey) && focusLost) {
      // The focused row scrolled out of the window and unmounted: park
      // focus on the scroll container instead of dropping it to <body>.
      scroller.focus({ preventScroll: true });
      focusedKeyRef.current = null;
    }
  });

  if (items.length === 0) return null;

  return (
    <div role="list" className={className} aria-label="Notes">
      {topPad > 0 && <div style={{ height: topPad }} aria-hidden="true" />}
      {items.slice(from, to).map((item, k) => {
        const index = from + k;
        const key = getKey(item, index);
        return (
          <div
            key={key}
            ref={setRowEl(key)}
            data-vkey={key}
            role="listitem"
            // Bottom padding carries the inter-row gap inside the measured
            // slot; flow-root prevents child margins collapsing through and
            // corrupting the measurement.
            style={{ paddingBottom: ROW_GAP, display: "flow-root" }}
          >
            {renderItem(item, index)}
          </div>
        );
      })}
      {bottomPad > 0 && <div style={{ height: bottomPad }} aria-hidden="true" />}
    </div>
  );
}
