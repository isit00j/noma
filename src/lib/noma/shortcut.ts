import { useEffect, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp, type URLOpenListenerEvent } from "@capacitor/app";

let pendingShortcut: { id: number; action: string; env?: "emulator" | "device" } | null = null;
let lastProcessedId = 0;
let isInitialized = false;
const listeners = new Set<() => void>();

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
  // TEMP-PERF: automated benchmark trigger for CI emulator runs.
  // Strict validation: only `app.noma.notes://autoperf` with an optional
  // `?env=emulator` parameter. Anything else is ignored.
  const auto = parseAutoPerfUrl(url);
  if (auto.ok) {
    const id = Date.now();
    if (id !== lastProcessedId) {
      pendingShortcut = { id, action: "autoperf", env: auto.env };
      notifyListeners();
    }
  }
}

/**
 * TEMP-PERF: strict validation for the automated-benchmark deep link.
 * Accepts only `app.noma.notes://autoperf` with an optional `?env=emulator`
 * query parameter. Delete with `perf-instrumentation.ts`.
 */
function parseAutoPerfUrl(urlString: string): { ok: boolean; env: "emulator" | "device" } {
  const no = { ok: false as const, env: "device" as const };
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "app.noma.notes:") return no;
    if (parsed.host !== "autoperf") return no;
    if (parsed.pathname !== "" && parsed.pathname !== "/") return no;
    if (parsed.hash !== "") return no;
    const keys = [...parsed.searchParams.keys()];
    if (keys.some((k) => k !== "env")) return no;
    const env = parsed.searchParams.get("env");
    if (env !== null && env !== "emulator") return no;
    return { ok: true, env: env === "emulator" ? "emulator" : "device" };
  } catch {
    return no;
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
  // TEMP-PERF: environment tag for the autoperf deep link.
  const shortcutEnv = pendingShortcut?.env ?? null;

  const consumeShortcut = () => {
    if (pendingShortcut) {
      lastProcessedId = pendingShortcut.id;
      pendingShortcut = null;
      notifyListeners();
    }
  };

  return { action, shortcutEnv, consumeShortcut, isValidNewNoteUrl };
}
