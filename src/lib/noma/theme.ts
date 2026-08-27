export type ThemeChoice = "light" | "dark" | "system";

/** Mirror of the stored preference so the theme can apply before IndexedDB opens. */
export const THEME_STORAGE_KEY = "noma-theme";

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return choice;
}

/** Applies the theme to <html> immediately; safe to call on every change. */
export function applyTheme(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(choice);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* private mode — the stored setting still wins next load */
  }
}

/** Inline, render-blocking snippet that prevents a theme flash on first paint. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var d=c==='dark'||(c==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
