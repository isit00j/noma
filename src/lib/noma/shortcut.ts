import { useEffect, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp, type URLOpenListenerEvent } from "@capacitor/app";

let pendingShortcut: { id: number; action: string } | null = null;
let lastProcessedId = 0;
let isInitialized = false;
const listeners = new Set<() => void>();

/**
 * Actions fired by tapping Noma's home-screen widgets. Every tap is a deep
 * link into Noma — the web layer re-checks App Lock before acting, so widget
 * taps can never bypass it. A pending action waits (in memory only) until the
 * app is unlocked, then executes exactly once.
 */
export type WidgetAction =
  | { kind: "toggle-task"; taskId: string }
  | { kind: "open-note"; noteId: string }
  | { kind: "open-tasks" }
  | { kind: "open" }
  | { kind: "open-settings" };

let pendingWidgetAction: { id: number; action: WidgetAction } | null = null;
let lastProcessedWidgetId = 0;
const widgetListeners = new Set<() => void>();

function notifyWidgetListeners() {
  widgetListeners.forEach((listener) => listener());
}

/** Widget deep links look like `app.noma.notes://widget/<action>?<params>`. */
const WIDGET_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function parseWidgetActionUrl(urlString: string): WidgetAction | null {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "app.noma.notes:") return null;
    if (parsed.host !== "widget") return null;
    if (parsed.hash !== "") return null;
    const idParam = (name: string) => {
      const value = parsed.searchParams.get(name);
      return value !== null && WIDGET_ID_PATTERN.test(value) ? value : null;
    };
    switch (parsed.pathname) {
      case "/toggle-task": {
        const taskId = idParam("taskId");
        return taskId ? { kind: "toggle-task", taskId } : null;
      }
      case "/open-note": {
        const noteId = idParam("noteId");
        return noteId ? { kind: "open-note", noteId } : null;
      }
      case "/open-tasks":
        return parsed.search === "" ? { kind: "open-tasks" } : null;
      case "/open":
        return parsed.search === "" ? { kind: "open" } : null;
      case "/open-settings":
        return parsed.search === "" ? { kind: "open-settings" } : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

/**
 * Strict validation for Noma native launcher deep link URLs.
 * Accepts only `app.noma.notes://new-note` or `app.noma.notes://new-note/`.
 * Rejects any arbitrary string, unknown scheme, host, path, or query parameter.
 */
function isValidNewNoteUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "app.noma.notes:") return false;
    if (parsed.host !== "new-note") return false;
    if (parsed.pathname !== "" && parsed.pathname !== "/") return false;
    if (parsed.search !== "" || parsed.hash !== "") return false;
    return true;
  } catch {
    return false;
  }
}

function processUrl(url: string | undefined) {
  if (!url) return;
  if (isValidNewNoteUrl(url)) {
    const id = Date.now();
    if (id !== lastProcessedId) {
      pendingShortcut = { id, action: "new-note" };
      notifyListeners();
    }
    return;
  }
  const widgetAction = parseWidgetActionUrl(url);
  if (widgetAction) {
    const id = Date.now();
    if (id !== lastProcessedWidgetId) {
      pendingWidgetAction = { id, action: widgetAction };
      notifyWidgetListeners();
    }
  }
}

export function initShortcutListener() {
  if (isInitialized || !Capacitor.isNativePlatform()) return;
  isInitialized = true;

  // Cold launch URL check
  void CapacitorApp.getLaunchUrl().then((launchUrl) => {
    if (launchUrl?.url) {
      processUrl(launchUrl.url);
    }
  });

  // Warm / background launch URL check
  void CapacitorApp.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
    processUrl(event.url);
  });
}

/**
 * Component mounted high in the root provider tree to ensure native launch URL
 * events are captured regardless of App Lock state or current route.
 */
export function ShortcutListener({ children }: { children?: ReactNode }) {
  useEffect(() => {
    initShortcutListener();
  }, []);

  return children;
}

/**
 * Hook to consume any pending launcher shortcut actions.
 * Returns the active action (e.g., 'new-note') if one is pending, and a function to clear it.
 */
export function usePendingShortcut() {
  const [, setTick] = useState(0);

  useEffect(() => {
    initShortcutListener();

    const onChange = () => setTick((t) => t + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const action = pendingShortcut?.action ?? null;

  const consumeShortcut = () => {
    if (pendingShortcut) {
      lastProcessedId = pendingShortcut.id;
      pendingShortcut = null;
      notifyListeners();
    }
  };

  return { action, consumeShortcut, isValidNewNoteUrl };
}

/**
 * Hook to consume a pending widget tap action. The action stays pending while
 * Noma is locked and executes once the app unlocks — widget taps can therefore
 * never bypass App Lock.
 */
export function usePendingWidgetAction() {
  const [, setTick] = useState(0);

  useEffect(() => {
    initShortcutListener();

    const onChange = () => setTick((t) => t + 1);
    widgetListeners.add(onChange);
    return () => {
      widgetListeners.delete(onChange);
    };
  }, []);

  const consumeWidgetAction = () => {
    if (pendingWidgetAction) {
      lastProcessedWidgetId = pendingWidgetAction.id;
      pendingWidgetAction = null;
      notifyWidgetListeners();
    }
  };

  return { widgetAction: pendingWidgetAction?.action ?? null, consumeWidgetAction };
}
