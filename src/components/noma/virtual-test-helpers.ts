import { vi } from "vitest";

/**
 * Layout mocks for virtualizer tests. happy-dom has no layout engine, so
 * offsetHeight/clientHeight are always 0. These install prototype-level
 * mocks:
 * - offsetHeight reads a per-key mock map for virtualized row wrappers
 *   (identified by their data-vkey attribute);
 * - clientHeight returns a configurable mock viewport height for elements
 *   marked with data-mock-viewport.
 * scrollTop works natively in happy-dom (get/set stores the value).
 */

const mockRowHeights = new Map<string, number>();
let mockViewportHeight = 600;

/**
 * Stubs window.matchMedia so tests control the Tailwind `sm` breakpoint
 * (min-width: 640px). The VirtualList reads it to pick the 16px vs 24px
 * edge pad. Listeners registered via addEventListener are notified on
 * subsequent setMockMatchMedia calls.
 */
const matchMediaListeners = new Set<(e: { matches: boolean }) => void>();
let mockMatches = false;
export function setMockMatchMedia(matches: boolean): void {
  mockMatches = matches;
  for (const l of matchMediaListeners) l({ matches });
  (window as unknown as { __mockSmUp?: boolean }).__mockSmUp = matches;
}
function installMatchMediaMock(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("640") ? mockMatches : false,
      media: query,
      addEventListener: (_t: string, l: (e: { matches: boolean }) => void) => {
        matchMediaListeners.add(l);
      },
      removeEventListener: (_t: string, l: (e: { matches: boolean }) => void) => {
        matchMediaListeners.delete(l);
      },
    }),
  });
}

export function setMockRowHeight(key: string, height: number): void {
  mockRowHeights.set(key, height);
}

export function setAllMockRowHeights(keys: string[], height: number): void {
  for (const key of keys) mockRowHeights.set(key, height);
}

export function clearMockRowHeights(): void {
  mockRowHeights.clear();
}

export function setMockViewportHeight(height: number): void {
  mockViewportHeight = height;
}

export function installLayoutMocks(): void {
  // Default to the mobile breakpoint (sm-): existing expectations use the
  // 16px edge pad. Tests for sm+ override via setMockMatchMedia().
  installMatchMediaMock();
  setMockMatchMedia(false);
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement): number {
      const key = this.dataset?.["vkey"];
      if (key != null && mockRowHeights.has(key)) return mockRowHeights.get(key)!;
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement): number {
      if (this.hasAttribute("data-mock-viewport")) {
        // A hidden surface has no layout, like display:none in the app.
        return this.hasAttribute("hidden") ? 0 : mockViewportHeight;
      }
      return 0;
    },
  });
}

/** Make requestAnimationFrame run synchronously for deterministic tests. */
export function mockSyncRaf(): void {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
}

export function unmockRaf(): void {
  vi.restoreAllMocks();
}
