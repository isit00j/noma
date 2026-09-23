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
