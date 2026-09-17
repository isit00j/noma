import { useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatabase } from "@/lib/noma/DatabaseContext";
import { useSettings } from "@/hooks/use-noma";
import { useAppLock } from "@/lib/noma/AppLockContext";
import {
  NomaWidget,
  defaultWidgetConfig,
  isWidgetSupported,
  noteAccentHex,
  readWidgetTheme,
  subscribeWidgetConfigChanged,
  type FocusWidgetConfig,
  type NoteWidgetConfig,
  type PlacedWidget,
  type TaskWidgetConfig,
  type WidgetConfig,
  type WidgetProjection,
  type WidgetNoteItem,
  type WidgetTaskItem,
} from "@/lib/noma/widget-bridge";
import { noteAccentBucket } from "@/lib/noma/note-accent";
import { notePreview, noteTitle } from "@/lib/noma/notes";
import { getOverdueTasks, getTasksByList, getTodayTasks, getUpcomingTasks } from "@/lib/noma/tasks";
import {
  INBOX_LIST_ID,
  type Folder,
  type Note,
  type Tag,
  type Task,
  type TaskList,
} from "@/lib/noma/types";

/**
 * Keeps Noma's Android home-screen widgets in sync — mounted once, above the
 * App Lock gate, so lock transitions are always observed.
 *
 * - Pushes `{ locked, theme }` on every lock-state / theme change.
 * - Pushes privacy-scrubbed per-widget projections when unlocked and at
 *   least one widget is placed (debounced).
 * - Never runs on web/PWA, never polls, never pushes content while locked.
 */
const PREVIEW_LENGTH = 120;
const MAX_POOL_NOTES = 60;
const MAX_POOL_TASKS = 120;

function clampMaxItems(value: number): number {
  return Math.min(6, Math.max(1, Math.floor(value) || 3));
}

/**
 * Deterministic signature of a widget's configuration. The projection
 * pipeline keys off this, so saving a new config (same widget ID) always
 * rebuilds and re-pushes that widget's projection — no polling needed.
 */
function configSignature(config: WidgetConfig | null): string {
  if (!config) return "∅";
  const entries = Object.entries(config as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
}

function toNoteItem(note: Note): WidgetNoteItem {
  return {
    id: note.id,
    title: noteTitle(note),
    preview: notePreview(note, PREVIEW_LENGTH),
    updatedAt: note.updatedAt,
    accent: noteAccentHex(noteAccentBucket(note)),
  };
}

function toTaskItem(task: Task, listName: string): WidgetTaskItem {
  return {
    id: task.id,
    title: task.title.trim() || "Untitled",
    dueAt: task.dueAt,
    priority: task.priority,
    listName,
  };
}

function visibleNotes(notes: Note[]): Note[] {
  return notes.filter((n) => !n.deleted && !n.archived);
}

function listNameFor(taskLists: TaskList[], listId: string): string {
  if (listId === INBOX_LIST_ID) return "Inbox";
  return taskLists.find((l) => l.id === listId)?.name ?? "";
}

function buildNoteProjection(
  config: NoteWidgetConfig,
  notes: Note[],
  folders: Folder[],
  tags: Tag[],
): WidgetProjection {
  const pool = visibleNotes(notes);
  let items: Note[];
  let title: string;
  switch (config.source) {
    case "pinned":
      items = pool.filter((n) => n.pinned);
      title = "Pinned";
      break;
    case "favorites":
      items = pool.filter((n) => n.favorite);
      title = "Favorites";
      break;
    case "folder": {
      const folder = folders.find((f) => f.id === config.folderId);
      title = folder?.name ?? "Folder";
      items = config.folderId ? pool.filter((n) => n.folderId === config.folderId) : [];
      break;
    }
    case "tag": {
      const tag = tags.find((t) => t.id === config.tagId);
      title = tag ? `#${tag.name}` : "Tag";
      items = config.tagId ? pool.filter((n) => n.tagIds.includes(config.tagId!)) : [];
      break;
    }
    case "recent":
    default:
      items = pool;
      title = "Recent notes";
      break;
  }
  const max = clampMaxItems(config.maxItems);
  const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, max);
  return { kind: "note", title, notes: sorted.map(toNoteItem) };
}

interface TaskPools {
  today: Task[];
  overdue: Task[];
  upcoming: Task[];
  byList: Record<string, Task[]>;
  taskLists: TaskList[];
}

function buildTaskProjection(config: TaskWidgetConfig, pools: TaskPools): WidgetProjection {
  const max = clampMaxItems(config.maxItems);
  let tasks: Task[];
  let title: string;
  switch (config.view) {
    case "upcoming":
      tasks = pools.upcoming;
      title = "Upcoming";
      break;
    case "overdue":
      tasks = pools.overdue;
      title = "Overdue";
      break;
    case "list": {
      const listId = config.listId ?? INBOX_LIST_ID;
      tasks = pools.byList[listId] ?? [];
      title = listNameFor(pools.taskLists, listId) || "Tasks";
      break;
    }
    case "today":
    default:
      tasks = pools.today;
      title = "Today";
      break;
  }
  return {
    kind: "task",
    title,
    tasks: tasks.slice(0, max).map((t) => toTaskItem(t, listNameFor(pools.taskLists, t.listId))),
  };
}

function buildFocusProjection(
  config: FocusWidgetConfig,
  notes: Note[],
  pools: TaskPools,
): WidgetProjection {
  const pool = visibleNotes(notes);
  const pinnedFirst = [...pool].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
  const note =
    (config.noteId ? pool.find((n) => n.id === config.noteId) : undefined) ??
    pinnedFirst[0] ??
    null;

  const now = Date.now();
  const withDue = [...pools.today, ...pools.upcoming]
    .filter((t) => t.dueAt != null && t.dueAt >= now)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  const next = withDue[0] ?? pools.overdue[0] ?? null;

  return {
    kind: "focus",
    note: note ? toNoteItem(note) : null,
    dueToday: pools.today.length,
    overdue: pools.overdue.length,
    nextTask: next ? toTaskItem(next, listNameFor(pools.taskLists, next.listId)) : null,
  };
}

function asNoteConfig(config: WidgetConfig | null): NoteWidgetConfig {
  const fallback = defaultWidgetConfig("note") as NoteWidgetConfig;
  if (!config || !("source" in config)) return fallback;
  return { ...fallback, ...(config as NoteWidgetConfig) };
}

function asTaskConfig(config: WidgetConfig | null): TaskWidgetConfig {
  const fallback = defaultWidgetConfig("task") as TaskWidgetConfig;
  if (!config || !("view" in config)) return fallback;
  return { ...fallback, ...(config as TaskWidgetConfig) };
}

function asFocusConfig(config: WidgetConfig | null): FocusWidgetConfig {
  if (!config || "source" in config || "view" in config) return { noteId: null };
  return config as FocusWidgetConfig;
}

export function WidgetSync() {
  const supported = isWidgetSupported();
  const { db } = useDatabase();
  const { settings, ready } = useSettings();
  const { isLocked, isLockStateResolving } = useAppLock();
  const [widgets, setWidgets] = useState<PlacedWidget[]>([]);
  /** Re-render trigger for OS dark-mode changes when the theme is "system". */
  const [systemTick, setSystemTick] = useState(0);

  const locked = !ready || isLockStateResolving || isLocked;
  // Keyed by kind, ID *and* serialized config: a config change must
  // deterministically rebuild that widget's projection, even when the
  // widget ID stays the same.
  const widgetsKey = widgets.map((w) => `${w.kind}:${w.id}:${configSignature(w.config)}`).join("|");

  const refreshWidgets = async () => {
    if (!supported) return;
    try {
      const { widgets: placed } = await NomaWidget.getWidgets();
      setWidgets(placed);
    } catch {
      // The plugin is unavailable (e.g. web build): widgets simply stay off.
    }
  };

  // Refresh the placed-widget list on mount and whenever Noma returns to the
  // foreground (covers widgets added/removed while the app was away).
  useEffect(() => {
    if (!supported) return;
    void refreshWidgets();
    let appListener: { remove: () => void } | null = null;
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void refreshWidgets();
    }).then((listener) => {
      appListener = listener;
    });
    return () => {
      appListener?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  // Re-read configs when one is saved from Noma's UI (Settings → Widgets).
  // The config signature in `widgetsKey` then deterministically rebuilds and
  // re-pushes that widget's projection.
  useEffect(() => {
    if (!supported) return;
    return subscribeWidgetConfigChanged(() => {
      void refreshWidgets();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  // Re-push when the OS light/dark mode flips under the "system" theme.
  useEffect(() => {
    if (!supported || settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTick((t) => t + 1);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [supported, settings.theme]);

  // Push lock state + theme. Runs even with zero widgets so the native lock
  // mirror is always current the moment a widget is placed.
  useEffect(() => {
    if (!supported || !ready) return;
    try {
      const theme = readWidgetTheme(settings.theme);
      void NomaWidget.pushEnvironment({ locked, theme }).catch(() => {});
    } catch {
      // Never let widget sync break the app.
    }
  }, [supported, ready, locked, settings.theme, systemTick]);

  // Data pools for projections. Skipped entirely while locked — widgets must
  // not even read content into memory for pushing in that state.
  const pools = useLiveQuery(async () => {
    if (!supported || !db || locked || widgets.length === 0) return null;
    const [allNotes, folders, tags, taskLists, today, overdue, upcoming] = await Promise.all([
      db.notes.orderBy("updatedAt").reverse().limit(MAX_POOL_NOTES).toArray(),
      db.folders.toArray(),
      db.tags.toArray(),
      db.taskLists.toArray(),
      getTodayTasks(db),
      getOverdueTasks(db),
      getUpcomingTasks(db),
    ]);
    const listIds = new Set<string>();
    for (const w of widgets) {
      if (w.kind === "task") {
        const cfg = asTaskConfig(w.config);
        if (cfg.view === "list") listIds.add(cfg.listId ?? INBOX_LIST_ID);
      }
    }
    const byList: Record<string, Task[]> = {};
    for (const listId of listIds) {
      const tasks = (await getTasksByList(db, listId))
        .filter((t) => !t.completed && !t.deleted && t.parentTaskId == null)
        .slice(0, MAX_POOL_TASKS);
      byList[listId] = tasks;
    }
    return { notes: allNotes, folders, tags, taskLists, today, overdue, upcoming, byList };
  }, [supported, db, locked, widgetsKey]);

  // Build per-widget projections and push them (debounced).
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!supported || locked || !pools || widgets.length === 0) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      try {
        const projections: Record<string, WidgetProjection> = {};
        for (const widget of widgets) {
          if (widget.kind === "note") {
            projections[String(widget.id)] = buildNoteProjection(
              asNoteConfig(widget.config),
              pools.notes,
              pools.folders,
              pools.tags,
            );
          } else if (widget.kind === "task") {
            const config = asTaskConfig(widget.config);
            projections[String(widget.id)] = buildTaskProjection(config, {
              today: pools.today,
              overdue: pools.overdue,
              upcoming: pools.upcoming,
              byList: pools.byList,
              taskLists: pools.taskLists,
            });
          } else {
            projections[String(widget.id)] = buildFocusProjection(
              asFocusConfig(widget.config),
              pools.notes,
              {
                today: pools.today,
                overdue: pools.overdue,
                upcoming: pools.upcoming,
                byList: pools.byList,
                taskLists: pools.taskLists,
              },
            );
          }
        }
        void NomaWidget.pushProjections({ projections }).catch(() => {});
      } catch {
        // Never let widget sync break the app.
      }
    }, 400);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, locked, pools, widgetsKey]);

  // Re-push projections when Noma returns to the foreground (day boundaries,
  // e.g. tasks rolling into "today", are the main reason).
  useEffect(() => {
    if (!supported) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshWidgets();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  return null;
}
