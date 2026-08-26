import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";
import { getSettings, saveSettings } from "@/lib/noma/db";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/noma/types";

export function useSettings() {
  const stored = useLiveQuery(() => getSettings(), [], undefined);
  const settings: AppSettings = stored ?? DEFAULT_SETTINGS;

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    await saveSettings(patch);
  }, []);

  // Apply theme as soon as settings are known.
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark =
        settings.theme === "dark" ||
        (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
    };
    apply();
    if (settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);

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
