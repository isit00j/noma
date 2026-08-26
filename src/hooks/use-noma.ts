import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";
import { db, saveSettings } from "@/lib/noma/db";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/noma/types";

export function useSettings() {
  // Live queries must stay read-only — Dexie rejects writes inside them, so the
  // defaults row is seeded from an effect instead of the observable.
  const stored = useLiveQuery(() => db().settings.get("app"), [], undefined);
  const settings: AppSettings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };

  useEffect(() => {
    if (stored === undefined) return;
    if (stored === null || stored === undefined) void db().settings.put(DEFAULT_SETTINGS);
  }, [stored]);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    await saveSettings(patch);
  }, []);

  return { settings, update, ready: stored !== undefined };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}
