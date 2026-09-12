import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp, type URLOpenListenerEvent } from "@capacitor/app";

let pendingShortcut: { id: number; action: string } | null = null;
let lastProcessedId = 0;
let isInitialized = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function processUrl(url: string | undefined) {
  if (!url) return;
  if (url.includes("new-note") || url.startsWith("app.noma.notes://new-note")) {
    const id = Date.now();
    if (id !== lastProcessedId) {
      pendingShortcut = { id, action: "new-note" };
      notifyListeners();
    }
  }
}

function initShortcutListener() {
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

  return { action, consumeShortcut };
}
