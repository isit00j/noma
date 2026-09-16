import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format, isThisYear } from "date-fns";
import {
  CalendarPlus,
  ListPlus,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useDatabase } from "@/lib/noma/DatabaseContext";
import {
  completeTask,
  createTask,
  createTaskList,
  deleteTaskList,
  ensureDefaultTaskLists,
  filterTasks,
  getCompletedTasks,
  getOverdueTasks,
  getTodayTasks,
  getUpcomingTasks,
  renameTaskList,
  type TaskFilter,
} from "@/lib/noma/tasks";
import {
  INBOX_LIST_ID,
  type Note,
  type ReminderAlertType,
  type Task,
  type TaskList,
  type TaskPriority,
} from "@/lib/noma/types";
import { cn } from "@/lib/utils";
import { TaskDetail } from "./task-detail";
import { TaskRow } from "./task-row";

type TasksSubView = "today" | "upcoming" | "overdue" | "completed" | "all";

const TABS: Array<{ value: TasksSubView; label: string }> = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
];

const QUICK_DUE_OPTIONS = [
  { value: "none", label: "No due date" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "Next week" },
] as const;

const PRIORITY_FILTERS: Array<{ value: TaskPriority | "any"; label: string }> = [
  { value: "any", label: "Any" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const EMPTY_COPY: Record<TasksSubView, { title: string; body: string }> = {
  today: { title: "Nothing due today", body: "Enjoy the quiet." },
  upcoming: { title: "Nothing scheduled ahead", body: "Add a due date to see tasks here." },
  overdue: { title: "All caught up", body: "Nothing is overdue." },
  completed: { title: "No completed tasks", body: "Finished tasks will appear here." },
  all: { title: "No tasks here yet", body: "Add one above to begin." },
};

function groupLabel(dueAt: number): string {
  const now = Date.now();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const dayIndex = Math.floor((dueAt - start.getTime()) / 86_400_000);
  if (dayIndex <= 1) return dayIndex === 0 ? "Today" : "Tomorrow";
  const d = new Date(dueAt);
  return isThisYear(d) ? format(d, "EEEE d MMM") : format(d, "EEEE d MMM yyyy");
}

interface TasksViewProps {
  onOpenNote?: (note: Note) => void;
}

export function TasksView({ onOpenNote }: TasksViewProps) {
  const { db } = useDatabase();

  const [subView, setSubView] = useState<TasksSubView>("today");
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "any">("any");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  // Quick-add state
  const [draft, setDraft] = useState("");
  const [quickDue, setQuickDue] = useState<(typeof QUICK_DUE_OPTIONS)[number]["value"]>("none");
  const [quickPriority, setQuickPriority] = useState<TaskPriority>("none");
  const [quickOpen, setQuickOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // List management state
  const [manageOpen, setManageOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingList, setDeletingList] = useState<TaskList | null>(null);

  useEffect(() => {
    if (db) void ensureDefaultTaskLists(db).catch(() => {});
  }, [db]);

  const lists = useLiveQuery(() => db?.taskLists.orderBy("createdAt").toArray() ?? [], [db], []);
  const allLists = useMemo<TaskList[]>(
    () => [{ id: INBOX_LIST_ID, name: "Inbox", createdAt: 0, updatedAt: 0 }, ...(lists ?? [])],
    [lists],
  );
  const listNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of allLists) map.set(list.id, list.name);
    return map;
  }, [allLists]);

  const tasks = useLiveQuery(async () => {
    if (!db) return [];
    const now = Date.now();
    switch (subView) {
      case "today":
        return getTodayTasks(db, now);
      case "upcoming":
        return getUpcomingTasks(db, now);
      case "overdue":
        return getOverdueTasks(db, now);
      case "completed":
        return getCompletedTasks(db);
      case "all": {
        const filter: TaskFilter = {};
        if (activeListId) filter.listId = activeListId;
        if (!showCompleted) filter.completed = false;
        return filterTasks(db, filter, now);
      }
    }
  }, [db, subView, activeListId, showCompleted]);

  const overdueForToday = useLiveQuery(async () => {
    if (!db || subView !== "today") return [];
    return getOverdueTasks(db);
  }, [db, subView]);

  // IDs of every row currently rendered, including the Today tab's separate
  // overdue section, so progress/reminder metadata covers them all.
  const allVisibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasks ?? []) ids.add(t.id);
    for (const t of overdueForToday ?? []) ids.add(t.id);
    return [...ids];
  }, [tasks, overdueForToday]);
  const taskIdKey = allVisibleIds.join(",");
  const progressMap = useLiveQuery(async () => {
    const map = new Map<string, { done: number; total: number }>();
    if (!db || !allVisibleIds.length) return map;
    const subs = await db.tasks
      .where("parentTaskId")
      .anyOf(allVisibleIds)
      .filter((t) => !t.deleted)
      .toArray();
    for (const id of allVisibleIds) map.set(id, { done: 0, total: 0 });
    for (const sub of subs) {
      const entry = sub.parentTaskId ? map.get(sub.parentTaskId) : undefined;
      if (entry) {
        entry.total += 1;
        if (sub.completed) entry.done += 1;
      }
    }
    return map;
  }, [db, taskIdKey]);

  const reminderTypeMap = useLiveQuery(async () => {
    const map = new Map<string, ReminderAlertType>();
    if (!db || !allVisibleIds.length) return map;
    const rows = await db.reminders.where("taskId").anyOf(allVisibleIds).toArray();
    for (const row of rows) {
      if (row.taskId) map.set(row.taskId, row.alertType ?? "notification");
    }
    return map;
  }, [db, taskIdKey]);

  const allLabels = useLiveQuery(async () => {
    if (!db) return [];
    const set = new Set<string>();
    await db.tasks.each((t) => {
      if (!t.deleted) for (const label of t.labelIds) set.add(label);
    });
    return [...set].sort();
  }, [db]);

  const applyClientFilters = useCallback(
    (list: Task[]): Task[] => {
      const q = query.trim().toLowerCase();
      return list.filter((task) => {
        if (q && !task.title.toLowerCase().includes(q) && !task.details.toLowerCase().includes(q))
          return false;
        if (priorityFilter !== "any" && task.priority !== priorityFilter) return false;
        if (labelFilter && !task.labelIds.includes(labelFilter)) return false;
        if (overdueOnly) {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          if (task.completed || task.dueAt == null || task.dueAt >= start.getTime()) return false;
        }
        return true;
      });
    },
    [query, priorityFilter, labelFilter, overdueOnly],
  );

  const visibleTasks = useMemo(() => applyClientFilters(tasks ?? []), [tasks, applyClientFilters]);
  const visibleOverdue = useMemo(
    () => applyClientFilters(overdueForToday ?? []),
    [overdueForToday, applyClientFilters],
  );

  const upcomingGroups = useMemo(() => {
    if (subView !== "upcoming") return [];
    const groups = new Map<string, Task[]>();
    for (const task of visibleTasks) {
      if (task.dueAt == null) continue;
      const label = groupLabel(task.dueAt);
      const group = groups.get(label) ?? [];
      group.push(task);
      groups.set(label, group);
    }
    return [...groups.entries()];
  }, [subView, visibleTasks]);

  const filtersActive =
    priorityFilter !== "any" || labelFilter != null || overdueOnly || query.trim() !== "";

  const resolveQuickDue = (): number | null => {
    if (quickDue === "none") return null;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (quickDue === "tomorrow") d.setDate(d.getDate() + 1);
    if (quickDue === "week") d.setDate(d.getDate() + 7);
    return d.getTime();
  };

  const handleQuickAdd = async () => {
    const title = draft.trim();
    if (!title || !db) return;
    try {
      await createTask(db, {
        title,
        listId: activeListId ?? INBOX_LIST_ID,
        priority: quickPriority,
        dueAt: resolveQuickDue(),
      });
      setDraft("");
      setQuickDue("none");
      setQuickPriority("none");
      setQuickOpen(false);
      inputRef.current?.focus();
    } catch {
      toast.error("Couldn't create the task.");
    }
  };

  const handleToggle = (task: Task, completed: boolean) => {
    if (!db) return;
    void completeTask(db, task.id, completed).catch(() => toast.error("Couldn't update the task."));
  };

  const selectTab = (tab: TasksSubView) => {
    setSubView(tab);
    setActiveListId(null);
  };

  const selectList = (listId: string) => {
    if (activeListId === listId && subView === "all") {
      setActiveListId(null);
    } else {
      setActiveListId(listId);
      setSubView("all");
    }
  };

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name || !db) return;
    try {
      const list = await createTaskList(db, name);
      setNewListName("");
      setManageOpen(false);
      selectList(list.id);
      toast.success(`List "${list.name}" created.`);
    } catch {
      toast.error("Couldn't create the list.");
    }
  };

  const handleRenameList = async () => {
    const name = renameDraft.trim();
    if (!name || !db || !renamingId) return;
    try {
      await renameTaskList(db, renamingId, name);
      setRenamingId(null);
      setRenameDraft("");
    } catch {
      toast.error("Couldn't rename the list.");
    }
  };

  const handleDeleteList = async () => {
    if (!db || !deletingList) return;
    try {
      await deleteTaskList(db, deletingList.id);
      if (activeListId === deletingList.id) setActiveListId(null);
      toast.success(`List "${deletingList.name}" deleted — its tasks moved to Inbox.`);
    } catch {
      toast.error("Couldn't delete the list.");
    } finally {
      setDeletingList(null);
    }
  };

  const renderTaskList = (list: Task[], opts?: { showListName?: boolean }) => (
    <div className="divide-y divide-border/40">
      {list.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          listName={opts?.showListName ? listNameMap.get(task.listId) : undefined}
          subtaskProgress={progressMap?.get(task.id)}
          reminderAlertType={reminderTypeMap?.get(task.id)}
          onOpen={(t) => setDetailTaskId(t.id)}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );

  const empty = EMPTY_COPY[subView];
  const hasTasks = visibleTasks.length > 0 || (subView === "today" && visibleOverdue.length > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      {/* Quick-add */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleQuickAdd();
              }
            }}
            placeholder="Add a task…"
            aria-label="New task title"
            className="h-11 bg-card pr-4 text-[15px]"
          />
        </div>
        <Popover open={quickOpen} onOpenChange={setQuickOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                "size-11 shrink-0",
                (quickDue !== "none" || quickPriority !== "none") && "border-primary/50",
              )}
              aria-label="Task options: due date and priority"
            >
              <CalendarPlus className="size-4" />
              {(quickDue !== "none" || quickPriority !== "none") && (
                <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 space-y-3 p-3" align="end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Due</Label>
              <div className="grid grid-cols-2 gap-1">
                {QUICK_DUE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setQuickDue(option.value)}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                      quickDue === option.value && "bg-muted font-medium",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    { value: "none", label: "None" },
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setQuickPriority(option.value)}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                      quickPriority === option.value && "bg-muted font-medium",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          size="icon"
          className="size-11 shrink-0"
          onClick={() => void handleQuickAdd()}
          disabled={!draft.trim()}
          aria-label="Add task"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Search + filter toggle */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="h-9 bg-card pr-8 pl-9 text-sm"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5 rotate-45" />
            </button>
          )}
        </div>
        <Button
          variant={filtersOpen || filtersActive ? "secondary" : "outline"}
          size="sm"
          className="h-9 gap-1.5 text-xs"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {filtersActive && <span className="size-1.5 rounded-full bg-primary" />}
        </Button>
      </div>

      {filtersOpen && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-card p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Priority</span>
            {PRIORITY_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPriorityFilter(option.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs",
                  priorityFilter === option.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {(allLabels ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Label</span>
              {(allLabels ?? []).map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setLabelFilter((v) => (v === label ? null : label))}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs",
                    labelFilter === label
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="tasks-overdue-only" className="text-xs text-muted-foreground">
              Overdue only
            </Label>
            <Switch
              id="tasks-overdue-only"
              checked={overdueOnly}
              onCheckedChange={setOverdueOnly}
            />
          </div>
          {subView === "all" && (
            <div className="flex items-center justify-between">
              <Label htmlFor="tasks-show-completed" className="text-xs text-muted-foreground">
                Show completed
              </Label>
              <Switch
                id="tasks-show-completed"
                checked={showCompleted}
                onCheckedChange={setShowCompleted}
              />
            </div>
          )}
        </div>
      )}

      {/* View tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Task views">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={subView === tab.value}
            onClick={() => selectTab(tab.value)}
            className={cn(
              "flex-1 rounded-md px-1 py-1.5 text-xs font-medium transition-colors",
              subView === tab.value
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" aria-label="Task lists">
        {allLists.map((list) => {
          const active = subView === "all" && (activeListId ?? INBOX_LIST_ID) === list.id;
          return (
            <button
              key={list.id}
              type="button"
              onClick={() => selectList(list.id)}
              aria-pressed={active}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {list.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ListPlus className="size-3.5" />
          Manage
        </button>
      </div>

      {/* Task list */}
      {!hasTasks ? (
        <div className="flex flex-col items-center py-14 text-center">
          <p className="font-serif text-base font-medium text-foreground">{empty.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{empty.body}</p>
        </div>
      ) : subView === "today" ? (
        <div className="space-y-6">
          {visibleOverdue.length > 0 && (
            <section aria-label="Overdue">
              <h2 className="mb-1 px-1 text-xs font-semibold tracking-wider text-destructive uppercase">
                Overdue ({visibleOverdue.length})
              </h2>
              {renderTaskList(visibleOverdue, { showListName: true })}
            </section>
          )}
          {visibleTasks.length > 0 && (
            <section aria-label="Due today">
              <h2 className="mb-1 px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Today ({visibleTasks.length})
              </h2>
              {renderTaskList(visibleTasks, { showListName: true })}
            </section>
          )}
        </div>
      ) : subView === "upcoming" ? (
        <div className="space-y-6">
          {upcomingGroups.map(([label, group]) => (
            <section key={label} aria-label={label}>
              <h2 className="mb-1 px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {label} ({group.length})
              </h2>
              {renderTaskList(group, { showListName: true })}
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {renderTaskList(visibleTasks, {
            showListName: subView !== "all" || activeListId == null,
          })}
        </div>
      )}

      <TaskDetail
        taskId={detailTaskId}
        lists={lists ?? []}
        onClose={() => setDetailTaskId(null)}
        onOpenNote={onOpenNote}
      />

      {/* Manage lists */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">Task lists</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {allLists.map((list) => {
              const isInbox = list.id === INBOX_LIST_ID;
              const renaming = renamingId === list.id;
              return (
                <div
                  key={list.id}
                  className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted/60"
                >
                  {renaming ? (
                    <>
                      <Input
                        value={renameDraft}
                        autoFocus
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleRenameList();
                          }
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="h-8 text-sm"
                        aria-label="List name"
                      />
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => void handleRenameList()}
                      >
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-sm">{list.name}</span>
                      {!isInbox && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Rename ${list.name}`}
                            onClick={() => {
                              setRenamingId(list.id);
                              setRenameDraft(list.name);
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${list.name}`}
                            onClick={() => setDeletingList(list)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter className="flex-row items-center gap-1.5 sm:justify-start">
            <Input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateList();
                }
              }}
              placeholder="New list name…"
              aria-label="New list name"
              className="h-9 flex-1 text-sm"
            />
            <Button
              size="sm"
              className="h-9 shrink-0 text-xs"
              onClick={() => void handleCreateList()}
            >
              <Plus className="size-3.5" /> Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletingList != null} onOpenChange={(v) => !v && setDeletingList(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deletingList?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its tasks will be moved to the Inbox. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteList()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
