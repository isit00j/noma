import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDatabase } from "@/lib/noma/DatabaseContext";
import { noteTitle } from "@/lib/noma/notes";
import {
  NomaWidget,
  WIDGET_KIND_LABEL,
  defaultWidgetConfig,
  isWidgetSupported,
  notifyWidgetConfigChanged,
  type FocusWidgetConfig,
  type NoteWidgetConfig,
  type PlacedWidget,
  type TaskWidgetConfig,
  type WidgetConfig,
  type WidgetKind,
} from "@/lib/noma/widget-bridge";
import { INBOX_LIST_ID } from "@/lib/noma/types";

/**
 * Android-only widget configuration. Lists every Noma widget currently on
 * the home screen, lets the user tune each instance's source/view, and offers
 * one-tap pinning for new widgets. Configuration is stored natively per
 * widget ID and never leaves the device.
 */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id="widgets" className="border-b border-border py-8 last:border-0">
      <h2 className="font-serif text-xl font-medium">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
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

function configSummary(widget: PlacedWidget): string {
  if (widget.kind === "note") {
    const c = asNoteConfig(widget.config);
    const source =
      c.source === "recent"
        ? "Recent notes"
        : c.source === "pinned"
          ? "Pinned"
          : c.source === "favorites"
            ? "Favorites"
            : c.source === "folder"
              ? "Folder"
              : "Tag";
    return `${source} · ${c.maxItems} items`;
  }
  if (widget.kind === "task") {
    const c = asTaskConfig(widget.config);
    const view =
      c.view === "today"
        ? "Today"
        : c.view === "upcoming"
          ? "Upcoming"
          : c.view === "overdue"
            ? "Overdue"
            : "List";
    return `${view} · ${c.maxItems} items`;
  }
  return "Focus note";
}

const NOTE_SOURCES = [
  { value: "recent", label: "Recent notes" },
  { value: "pinned", label: "Pinned" },
  { value: "favorites", label: "Favorites" },
  { value: "folder", label: "Folder" },
  { value: "tag", label: "Tag" },
] as const;

const TASK_VIEWS = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "overdue", label: "Overdue" },
  { value: "list", label: "Task list" },
] as const;

const MAX_ITEMS_OPTIONS = [1, 2, 3, 4, 5, 6];

export function WidgetSection() {
  const supported = isWidgetSupported();
  const { db } = useDatabase();
  const [widgets, setWidgets] = useState<PlacedWidget[]>([]);
  const [drafts, setDrafts] = useState<Record<number, WidgetConfig>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [pinning, setPinning] = useState<WidgetKind | null>(null);

  const folders = useLiveQuery(() => db?.folders.toArray() ?? [], [db]);
  const tags = useLiveQuery(() => db?.tags.toArray() ?? [], [db]);
  const taskLists = useLiveQuery(() => db?.taskLists.toArray() ?? [], [db]);
  const notes = useLiveQuery(
    () => (db ? db.notes.orderBy("updatedAt").reverse().limit(30).toArray() : []),
    [db],
  );

  const refresh = async () => {
    if (!supported) return;
    try {
      const { widgets: placed } = await NomaWidget.getWidgets();
      setWidgets(placed);
    } catch {
      // Plugin unavailable — widgets simply stay off.
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  if (!supported) return null;

  const draftFor = (widget: PlacedWidget): WidgetConfig => {
    const existing = drafts[widget.id];
    if (existing) return existing;
    if (widget.kind === "note") return asNoteConfig(widget.config);
    if (widget.kind === "task") return asTaskConfig(widget.config);
    return asFocusConfig(widget.config);
  };

  const setDraft = (id: number, config: WidgetConfig) =>
    setDrafts((prev) => ({ ...prev, [id]: config }));

  const save = async (widget: PlacedWidget) => {
    setSaving(widget.id);
    try {
      await NomaWidget.saveWidgetConfig({ widgetId: widget.id, config: draftFor(widget) });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[widget.id];
        return next;
      });
      toast.success("Widget updated");
      notifyWidgetConfigChanged();
      void refresh();
    } catch {
      toast.error("Couldn't update the widget");
    } finally {
      setSaving(null);
    }
  };

  const pin = async (kind: WidgetKind) => {
    setPinning(kind);
    try {
      const { pinned } = await NomaWidget.requestPinWidget({ kind });
      if (pinned) {
        toast.success("Confirm on your home screen to place it");
      } else {
        toast.info("Your launcher doesn't support direct pinning — add it from the widget list");
      }
    } catch {
      toast.error("Couldn't add the widget");
    } finally {
      setPinning(null);
    }
  };

  return (
    <Section
      title="Home-screen widgets"
      description="Widgets live on your Android home screen and update when Noma does. They stay locked while Noma is locked, and their settings never leave this device."
    >
      {widgets.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No Noma widgets on your home screen yet. Add one below, or long-press your home screen and
          pick it from the widget list.
        </p>
      )}

      {widgets.map((widget) => {
        const draft = draftFor(widget);
        return (
          <div key={widget.id} className="space-y-4 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{WIDGET_KIND_LABEL[widget.kind]} widget</p>
                <p className="text-xs text-muted-foreground">{configSummary(widget)}</p>
              </div>
              <Button size="sm" onClick={() => void save(widget)} disabled={saving === widget.id}>
                {saving === widget.id ? "Saving…" : "Save"}
              </Button>
            </div>

            {widget.kind === "note" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Shows</Label>
                  <Select
                    value={(draft as NoteWidgetConfig).source}
                    onValueChange={(value) =>
                      setDraft(widget.id, {
                        ...(draft as NoteWidgetConfig),
                        source: value as NoteWidgetConfig["source"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTE_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(draft as NoteWidgetConfig).source === "folder" && (
                  <div className="space-y-2">
                    <Label>Folder</Label>
                    <Select
                      value={(draft as NoteWidgetConfig).folderId ?? ""}
                      onValueChange={(value) =>
                        setDraft(widget.id, {
                          ...(draft as NoteWidgetConfig),
                          folderId: value || null,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a folder" />
                      </SelectTrigger>
                      <SelectContent>
                        {(folders ?? []).map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(draft as NoteWidgetConfig).source === "tag" && (
                  <div className="space-y-2">
                    <Label>Tag</Label>
                    <Select
                      value={(draft as NoteWidgetConfig).tagId ?? ""}
                      onValueChange={(value) =>
                        setDraft(widget.id, {
                          ...(draft as NoteWidgetConfig),
                          tagId: value || null,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a tag" />
                      </SelectTrigger>
                      <SelectContent>
                        {(tags ?? []).map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            #{t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Items shown</Label>
                  <Select
                    value={String((draft as NoteWidgetConfig).maxItems)}
                    onValueChange={(value) =>
                      setDraft(widget.id, {
                        ...(draft as NoteWidgetConfig),
                        maxItems: Number(value),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAX_ITEMS_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {widget.kind === "task" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Shows</Label>
                  <Select
                    value={(draft as TaskWidgetConfig).view}
                    onValueChange={(value) =>
                      setDraft(widget.id, {
                        ...(draft as TaskWidgetConfig),
                        view: value as TaskWidgetConfig["view"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_VIEWS.map((v) => (
                        <SelectItem key={v.value} value={v.value}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(draft as TaskWidgetConfig).view === "list" && (
                  <div className="space-y-2">
                    <Label>Task list</Label>
                    <Select
                      value={(draft as TaskWidgetConfig).listId ?? INBOX_LIST_ID}
                      onValueChange={(value) =>
                        setDraft(widget.id, {
                          ...(draft as TaskWidgetConfig),
                          listId: value === INBOX_LIST_ID ? null : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={INBOX_LIST_ID}>Inbox</SelectItem>
                        {(taskLists ?? []).map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Items shown</Label>
                  <Select
                    value={String((draft as TaskWidgetConfig).maxItems)}
                    onValueChange={(value) =>
                      setDraft(widget.id, {
                        ...(draft as TaskWidgetConfig),
                        maxItems: Number(value),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAX_ITEMS_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {widget.kind === "focus" && (
              <div className="space-y-2">
                <Label>Focus note</Label>
                <Select
                  value={(draft as FocusWidgetConfig).noteId ?? ""}
                  onValueChange={(value) =>
                    setDraft(widget.id, { noteId: value === "__auto__" ? null : value || null })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Automatic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">Automatic</SelectItem>
                    {(notes ?? [])
                      .filter((n) => !n.deleted && !n.archived)
                      .map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          {noteTitle(n).slice(0, 40)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Automatic picks your most recent pinned note, or your latest note.
                </p>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2 pt-1">
        {(["note", "task", "focus"] as const).map((kind) => (
          <Button
            key={kind}
            variant="outline"
            size="sm"
            onClick={() => void pin(kind)}
            disabled={pinning === kind}
          >
            {pinning === kind ? "Adding…" : `Add ${WIDGET_KIND_LABEL[kind]} widget`}
          </Button>
        ))}
      </div>
    </Section>
  );
}
