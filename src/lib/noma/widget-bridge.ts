import { Capacitor, registerPlugin } from "@capacitor/core";
import { resolveTheme } from "./theme";
import type { ThemeSetting } from "./types";

/**
 * Web ↔ native bridge for Noma's Android home-screen widgets.
 *
 * Design rules (product invariants):
 * - The WebView is the only thing that ever reads Dexie. Native never opens
 *   the database; it renders whatever privacy-scrubbed projection the web
 *   layer pushed last.
 * - Pushes are one-way and event-driven (data / theme / lock changes, app
 *   foreground). There is deliberately no polling anywhere.
 * - When Noma is locked (or the lock state is still resolving) the web layer
 *   pushes `{ locked: true }` and no content. Native fails closed: with no
 *   environment cached it renders the locked card by default.
 * - Widget taps never bypass App Lock: every tap is a deep link into Noma
 *   (`app.noma.notes://widget/…`) and the web layer re-checks the lock
 *   before acting on it.
 * - Per-widget configuration lives in native SharedPreferences, keyed by
 *   Android widget ID. It is device-local and never enters the Drive backup.
 */

export type WidgetKind = "note" | "task" | "focus";

/** Hex colors (e.g. "#0a0a0a") resolved from the active CSS theme. */
export interface WidgetColors {
  background: string;
  card: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  border: string;
}

export interface WidgetTheme {
  /** The user's theme setting, e.g. "light" | "dark" | "system" | "nature" | "amoled". */
  choice: ThemeSetting;
  /** Resolved dark mode after applying the setting. */
  dark: boolean;
  colors: WidgetColors;
}

export interface WidgetNoteItem {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  /** Accent rail color as hex, or null for the default rail. */
  accent: string | null;
}

export interface WidgetTaskItem {
  id: string;
  title: string;
  /** Epoch ms, or null when the task has no due date. */
  dueAt: number | null;
  priority: "none" | "low" | "medium" | "high";
  listName: string;
}

export type WidgetProjection =
  | { kind: "note"; title: string; notes: WidgetNoteItem[] }
  | { kind: "task"; title: string; tasks: WidgetTaskItem[] }
  | {
      kind: "focus";
      note: WidgetNoteItem | null;
      dueToday: number;
      overdue: number;
      nextTask: WidgetTaskItem | null;
    };

export type NoteWidgetSource = "recent" | "pinned" | "favorites" | "folder" | "tag";

export interface NoteWidgetConfig {
  source: NoteWidgetSource;
  folderId?: string | null;
  tagId?: string | null;
  maxItems: number;
}

export type TaskWidgetView = "today" | "upcoming" | "overdue" | "list";

export interface TaskWidgetConfig {
  view: TaskWidgetView;
  listId?: string | null;
  maxItems: number;
}

export interface FocusWidgetConfig {
  /** Optional hand-picked focus note; when null the most recently updated pinned/recent note is used. */
  noteId?: string | null;
}

export type WidgetConfig = NoteWidgetConfig | TaskWidgetConfig | FocusWidgetConfig;

export interface PlacedWidget {
  id: number;
  kind: WidgetKind;
  config: WidgetConfig | null;
}

interface NomaWidgetPluginInterface {
  /** Widgets currently placed on the launcher, with their stored configs. */
  getWidgets(): Promise<{ widgets: PlacedWidget[] }>;
  /** Lock state + theme. Native re-renders every widget from its cache. */
  pushEnvironment(options: { locked: boolean; theme: WidgetTheme }): Promise<void>;
  /**
   * Per-widget content projections, keyed by widget ID (as a string, since
   * JSON object keys are strings). Native caches each and re-renders.
   */
  pushProjections(options: { projections: Record<string, WidgetProjection> }): Promise<void>;
  /** Persist per-widget config natively and re-render that widget. */
  saveWidgetConfig(options: { widgetId: number; config: WidgetConfig }): Promise<void>;
  /** Ask the launcher to pin a new widget (Android 8+). */
  requestPinWidget(options: { kind: WidgetKind }): Promise<{ pinned: boolean }>;
}

export const NomaWidget = registerPlugin<NomaWidgetPluginInterface>("NomaWidget");

/** Widgets are an Android-native feature; never available on web/PWA. */
export function isWidgetSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

const DEFAULT_WIDGET_COLORS: WidgetColors = {
  background: "#ffffff",
  card: "#ffffff",
  foreground: "#171717",
  mutedForeground: "#737373",
  primary: "#2563eb",
  primaryForeground: "#ffffff",
  border: "#e5e5e5",
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Parse `oklch(L C H)` or `oklch(L C H / A)` into [l, c, hDeg, alpha]. */
function parseOklch(value: string): [number, number, number, number] | null {
  const match = value
    .trim()
    .match(/^oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/);
  if (!match) return null;
  const [, lStr = "", cStr = "", hStr = "", alphaStr] = match;
  let alpha = 1;
  if (alphaStr !== undefined) {
    alpha = alphaStr.endsWith("%")
      ? Number.parseFloat(alphaStr) / 100
      : Number.parseFloat(alphaStr);
  }
  return [Number.parseFloat(lStr), Number.parseFloat(cStr), Number.parseFloat(hStr), alpha];
}

/** Convert Oklch to gamma-corrected sRGB in 0..1. */
function oklchToLinearSrgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  return [clamp01(gamma(r)), clamp01(gamma(g)), clamp01(gamma(bl))];
}

function toHex(r: number, g: number, b: number): string {
  const byte = (x: number) =>
    Math.round(clamp01(x) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/**
 * Resolve a CSS custom property (expected in oklch()) to a hex color.
 * Alpha channels are composited over the given backdrop first.
 */
function cssTokenToHex(name: string, backdrop: [number, number, number]): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    const parsed = parseOklch(raw);
    if (!parsed) return toHex(...backdrop);
    const [l, c, h, alpha] = parsed;
    const [r, g, b] = oklchToLinearSrgb(l, c, h);
    const mixed: [number, number, number] = [
      r * alpha + backdrop[0] * (1 - alpha),
      g * alpha + backdrop[1] * (1 - alpha),
      b * alpha + backdrop[2] * (1 - alpha),
    ];
    return toHex(...mixed);
  } catch {
    return toHex(...backdrop);
  }
}

/**
 * Read the currently applied theme (after `applyTheme` ran) and resolve the
 * handful of colors the native widgets need. Must run in the browser DOM.
 */
export function readWidgetTheme(choice: ThemeSetting): WidgetTheme {
  const dark = resolveTheme(choice) === "dark";
  try {
    const root = getComputedStyle(document.documentElement);
    const parsedBg = parseOklch(root.getPropertyValue("--background"));
    const bg: [number, number, number] = parsedBg
      ? oklchToLinearSrgb(parsedBg[0], parsedBg[1], parsedBg[2])
      : [1, 1, 1];
    const background = toHex(...bg);
    return {
      choice,
      dark,
      colors: {
        background,
        card: cssTokenToHex("--card", bg),
        foreground: cssTokenToHex("--foreground", bg),
        mutedForeground: cssTokenToHex("--muted-foreground", bg),
        primary: cssTokenToHex("--primary", bg),
        primaryForeground: cssTokenToHex("--primary-foreground", bg),
        border: cssTokenToHex("--border", bg),
      },
    };
  } catch {
    return { choice, dark, colors: DEFAULT_WIDGET_COLORS };
  }
}

export function defaultWidgetConfig(kind: WidgetKind): WidgetConfig {
  switch (kind) {
    case "note":
      return { source: "recent", folderId: null, tagId: null, maxItems: 3 };
    case "task":
      return { view: "today", listId: null, maxItems: 5 };
    case "focus":
      return { noteId: null };
  }
}

export const WIDGET_KIND_LABEL: Record<WidgetKind, string> = {
  note: "Note",
  task: "Task",
  focus: "Focus",
};

/**
 * Replicates the note-card fingerprint rail color from styles.css
 * (`oklch(l c calc(h + step * spread))`) as a hex string for native widgets.
 */
export function noteAccentHex(bucket: number): string | null {
  try {
    const root = getComputedStyle(document.documentElement);
    const num = (name: string) => Number.parseFloat(root.getPropertyValue(name));
    const l = num("--note-accent-l");
    const c = num("--note-accent-c");
    const h = num("--note-accent-h");
    const spread = num("--note-accent-spread");
    if (![l, c, h, spread].every(Number.isFinite)) return null;
    const [r, g, b] = oklchToLinearSrgb(l, c, h + bucket * spread);
    return toHex(r, g, b);
  } catch {
    return null;
  }
}
