// @vitest-environment happy-dom
import {
  act,
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VirtualList, type VirtualListHandle } from "./virtual-list";
import { NotesListSurfaceContext } from "./notes-list-surface-context";
import {
  clearMockRowHeights,
  installLayoutMocks,
  mockSyncRaf,
  setAllMockRowHeights,
  setMockRowHeight,
  setMockViewportHeight,
  unmockRaf,
} from "./virtual-test-helpers";

(globalThis as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] = true;

installLayoutMocks();

interface Item {
  id: string;
}

const getKey = (item: Item) => item.id;
const defaultRenderItem = (item: Item) => <div>{item.id}</div>;

const N = 1908;
const ids = Array.from({ length: N }, (_, i) => `n${i}`);
const makeItems = (): Item[] => ids.map((id) => ({ id }));

interface HarnessApi {
  scroller: HTMLDivElement;
  handle: VirtualListHandle | null;
}

/**
 * Mirrors the real app: the scroller div publishes itself via state (child
 * layout effects run before a parent ref attaches, so a ref object would be
 * null during the virtualizer's mount), the surface context carries the API,
 * and the div persists across renders — only items change — so scrollTop
 * behaves like the keep-alive surface.
 */
function Harness({
  items,
  renderItem,
  onReady,
}: {
  items: Item[];
  renderItem: (item: Item, index: number) => ReactNode;
  onReady: (api: HarnessApi) => void;
}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const listHandleRef = useRef<VirtualListHandle | null>(null);
  const setEl = useCallback((el: HTMLDivElement | null) => setScrollEl(el), []);
  const api = useMemo(() => ({ scrollElement: scrollEl, listHandleRef }), [scrollEl]);
  useLayoutEffect(() => {
    if (scrollEl) onReady({ scroller: scrollEl, handle: listHandleRef.current });
  }, [scrollEl, onReady]);
  return (
    <div ref={setEl} data-mock-viewport tabIndex={-1} style={{ overflowY: "auto" }}>
      <NotesListSurfaceContext.Provider value={api}>
        <VirtualList
          listRef={listHandleRef}
          items={items}
          getKey={getKey}
          scrollElement={scrollEl}
          renderItem={renderItem}
        />
      </NotesListSurfaceContext.Provider>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;
let scroller: HTMLDivElement;
let handle: VirtualListHandle | null;

function show(
  items: Item[],
  renderItem: (item: Item, index: number) => ReactNode = defaultRenderItem,
) {
  act(() => {
    root.render(
      <Harness
        items={items}
        renderItem={renderItem}
        onReady={(api) => {
          scroller = api.scroller;
          handle = api.handle;
        }}
      />,
    );
  });
  return scroller;
}

function scrollTo(top: number) {
  act(() => {
    scroller.scrollTop = top;
    scroller.dispatchEvent(new Event("scroll"));
  });
}

function renderedKeys(): string[] {
  return Array.from(container.querySelectorAll("[data-vkey]")).map(
    (el) => (el as HTMLElement).dataset["vkey"]!,
  );
}

/** Heights of the top/bottom spacer divs (the only aria-hidden divs here). */
function spacerHeights(): number[] {
  return Array.from(container.querySelectorAll('div[aria-hidden="true"]')).map((el) =>
    parseFloat((el as HTMLElement).style.height),
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  clearMockRowHeights();
  setAllMockRowHeights(ids, 132);
  setMockViewportHeight(600);
  mockSyncRaf();
  scroller = null as unknown as HTMLDivElement;
  handle = null;
});

afterEach(() => {
  unmockRaf();
  act(() => {
    root.unmount();
  });
  container.remove();
  clearMockRowHeights();
});

describe("VirtualList", () => {
  it("renders only the expected small window for a 1908-row dataset", () => {
    show(makeItems());
    const keys = renderedKeys();
    // 600px viewport / 132px slots -> rows 0..4 visible + 6 overscan = 11 rows,
    // instead of 1908.
    expect(keys).toHaveLength(11);
    expect(keys[0]).toBe("n0");
    expect(keys[keys.length - 1]).toBe("n10");
    expect(new Set(keys).size).toBe(keys.length);

    const [topPad, bottomPad] = spacerHeights();
    expect(topPad).toBe(16);
    // total = 16 + 1908*132 - 12 + 16; bottomPad = total - offsets[11]
    expect(bottomPad).toBe(16 + N * 132 - 12 + 16 - (16 + 11 * 132));
  });

  it("advances the window correctly on scroll", () => {
    show(makeItems());
    scrollTo(5000);
    const keys = renderedKeys();
    // startIdx: first row with bottom below 5000 -> index 37; minus overscan.
    expect(keys[0]).toBe("n31");
    expect(keys[keys.length - 1]).toBe("n48");
    expect(keys).toHaveLength(18);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("positions the window from measured variable row heights", () => {
    for (let i = 0; i < 10; i++) setMockRowHeight(`n${i}`, 200);
    show(makeItems());
    scrollTo(2100);
    // Rows are measured lazily on render: n9 is first rendered by this
    // scroll, grows 132 -> 200 above the viewport, so scroll is compensated
    // 2100 -> 2168 and the settled window starts at n5 — not n9, which
    // uniform 132px estimates would produce.
    expect(scroller.scrollTop).toBe(2168);
    expect(renderedKeys()[0]).toBe("n5");
  });

  it("compensates scrollTop when a row above the viewport grows, without a visible jump", () => {
    show(makeItems());
    scrollTo(5000);
    expect(renderedKeys()[0]).toBe("n31");

    // n32 is rendered (overscan) but above the visible window: grow it.
    setMockRowHeight("n32", 232);
    show(makeItems());
    // Scroll position shifted by exactly the +100 delta, pre-paint.
    expect(scroller.scrollTop).toBe(5100);
    const keys = renderedKeys();
    expect(keys[0]).toBe("n31");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("compensates scrollTop when a row above the viewport shrinks", () => {
    show(makeItems());
    scrollTo(5000);
    setMockRowHeight("n32", 82);
    show(makeItems());
    expect(scroller.scrollTop).toBe(4950);
    expect(renderedKeys()[0]).toBe("n31");
  });

  it("re-renders only the changed row when one item gets a new identity", () => {
    const renderCounts = new Map<string, number>();
    const MemoRow = memo(function MemoRow({ item }: { item: Item }) {
      renderCounts.set(item.id, (renderCounts.get(item.id) ?? 0) + 1);
      return <div>{item.id}</div>;
    });
    const items = makeItems();
    show(items, (item) => <MemoRow item={item} />);
    expect(renderCounts.get("n5")).toBe(1);

    // Only n5 is a fresh object; the rest keep identity (as useStableNotes
    // guarantees for unchanged rows).
    const next = items.map((it) => (it.id === "n5" ? { ...it } : it));
    show(next, (item) => <MemoRow item={item} />);

    expect(renderCounts.get("n5")).toBe(2);
    for (const [id, count] of renderCounts) {
      if (id !== "n5") expect(count).toBe(1);
    }
  });

  it("produces no duplicate or stale rows across fast window changes", () => {
    show(makeItems());
    for (const top of [150000, 3000, 250000, 12000]) scrollTo(top);
    const keys = renderedKeys();
    expect(new Set(keys).size).toBe(keys.length);
    // Final position 12000 -> startIdx 90, window n84..n101.
    expect(keys[0]).toBe("n84");
    expect(keys[keys.length - 1]).toBe("n101");
  });

  it("updates the window when a visible row is deleted", () => {
    show(makeItems());
    scrollTo(5000);
    expect(renderedKeys()).toContain("n40");

    show(makeItems().filter((it) => it.id !== "n40"));
    const keys = renderedKeys();
    expect(keys).not.toContain("n40");
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe("n31");
  });

  it("keeps visible content stable when rows above the viewport are deleted", () => {
    show(makeItems());
    scrollTo(5000);
    expect(renderedKeys()[0]).toBe("n31");

    // Delete n0..n9 (10 x 132px above the viewport): scroll compensates.
    show(makeItems().filter((_, i) => i >= 10));
    expect(scroller.scrollTop).toBe(5000 - 10 * 132);
    // new index 21 === old n31: the same content stays at the window start.
    const keys = renderedKeys();
    expect(keys[0]).toBe("n31");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("compensates before clamping when rows above are removed and the list shrinks", () => {
    const hundred = Array.from({ length: 100 }, (_, i) => ({ id: `m${i}` }));
    setAllMockRowHeights(
      hundred.map((n) => n.id),
      132,
    );
    show(hundred);
    scrollTo(12000); // rows ~m90-m95 visible near the bottom
    expect(scroller.scrollTop).toBe(12000);

    // Delete 61 rows above the viewport: the visible rows (m90+) survive as
    // m29+; compensation must keep them stable at 12000 - 61*132 = 3948,
    // not collapse to 0 (which clamping first would produce).
    show(hundred.slice(61));
    expect(scroller.scrollTop).toBe(3948);
    expect(renderedKeys()[0]).toBe("m84");
  });

  it("clamps the scroll position when the list shrinks below it", () => {
    show(makeItems());
    scrollTo(200000);
    show(makeItems().slice(0, 10));
    // total = 16 + 10*132 - 12 + 16 = 1340; max scroll = 1340 - 600 = 740.
    expect(scroller.scrollTop).toBe(740);
    expect(renderedKeys()).toHaveLength(10);
  });

  it("keeps per-key heights across filter/sort reorder", () => {
    for (let i = 0; i < 10; i++) setMockRowHeight(`n${i}`, 200);
    show(makeItems());
    scrollTo(2100);
    expect(renderedKeys()[0]).toBe("n5");

    // Reverse the list (simulates a sort change): order and window follow
    // the new order, and the height map — keyed by note id — is not
    // corrupted by the reorder.
    show(makeItems().reverse());
    const keys = renderedKeys();
    expect(new Set(keys).size).toBe(keys.length);
    // scrollTop preserved at 2168; reversed[16] is the first row whose
    // bottom is below it, minus overscan -> reversed[10] === n1897.
    expect(keys[0]).toBe("n1897");

    const [, bottomPad] = spacerHeights();
    // total still accounts for the ten 200px rows: 16 + (10*200 + 1898*132)
    // - 12 + 16; window covers reversed[10..27], offsets[27] = 16 + 27*132.
    expect(bottomPad).toBe(16 + (10 * 200 + 1898 * 132) - 12 + 16 - (16 + 27 * 132));
  });

  it("re-syncs the viewport after the surface is hidden and unhidden", () => {
    show(makeItems());
    scrollTo(5000);
    expect(renderedKeys()[0]).toBe("n31");

    // Hiding removes layout (clientHeight -> 0 via the mock)...
    act(() => {
      scroller.setAttribute("hidden", "");
    });
    // ...unhide, restore the saved scroll position, then re-sync — exactly
    // what WorkspaceSurfaces does when returning from a note.
    act(() => {
      scroller.removeAttribute("hidden");
      scroller.scrollTop = 5000;
      handle!.syncViewport();
    });
    expect(renderedKeys()[0]).toBe("n31");
    expect(renderedKeys()).toHaveLength(18);
  });

  it("moves focus to the scroll container when the focused row is virtualized away", () => {
    show(makeItems(), (item) => <button type="button">{item.id}</button>);
    const btn = container.querySelector('[data-vkey="n0"] button') as HTMLButtonElement;
    act(() => {
      btn.focus();
    });
    expect(document.activeElement).toBe(btn);

    scrollTo(5000);
    expect(container.querySelector('[data-vkey="n0"]')).toBeNull();
    expect(document.activeElement).toBe(scroller);
  });

  it("does not steal focus when focus moved elsewhere intentionally", () => {
    show(makeItems(), (item) => <button type="button">{item.id}</button>);
    const outside = document.createElement("button");
    outside.textContent = "outside";
    document.body.appendChild(outside);
    try {
      const btn = container.querySelector('[data-vkey="n0"] button') as HTMLButtonElement;
      act(() => {
        btn.focus();
      });
      act(() => {
        outside.focus();
      });
      scrollTo(5000);
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });
});
