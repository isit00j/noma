package app.noma.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * Builds and applies RemoteViews for Noma's widgets.
 *
 * Rules:
 * - Purely presentational: renders the last projection pushed by the WebView
 *   (or the locked card). Never reads the database, never polls.
 * - Fail closed: when Noma is locked — or no lock state was ever pushed —
 *   every widget renders the locked card.
 * - All taps are deep links into Noma ({@code app.noma.notes://widget/…});
 *   the web layer re-checks App Lock before acting on them.
 */
public final class NomaWidgetUpdater {

    /** Deep-link actions handled by the web layer (see shortcut.ts). */
    public static final String DEEP_LINK_OPEN = "app.noma.notes://widget/open";
    public static final String DEEP_LINK_OPEN_TASKS = "app.noma.notes://widget/open-tasks";
    public static final String DEEP_LINK_OPEN_SETTINGS = "app.noma.notes://widget/open-settings";
    public static final String DEEP_LINK_NEW_NOTE = "app.noma.notes://new-note";

    public static String deepLinkOpenNote(String noteId) {
        return "app.noma.notes://widget/open-note?noteId=" + Uri.encode(noteId);
    }

    public static String deepLinkToggleTask(String taskId) {
        return "app.noma.notes://widget/toggle-task?taskId=" + Uri.encode(taskId);
    }

    // Semantic colors (not theme-dependent).
    private static final int COLOR_OVERDUE = 0xFFE5484D;
    private static final int COLOR_TODAY = 0xFFF5A524;
    private static final int COLOR_PRIORITY_HIGH = 0xFFE5484D;
    private static final int COLOR_PRIORITY_MEDIUM = 0xFFF5A524;
    private static final int COLOR_PRIORITY_LOW = 0xFF30A46C;

    private NomaWidgetUpdater() {
    }

    // ------------------------------------------------------------------
    // Entry points
    // ------------------------------------------------------------------

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        updateProviderWidgets(context, manager, NomaNoteWidgetProvider.class);
        updateProviderWidgets(context, manager, NomaTaskWidgetProvider.class);
        updateProviderWidgets(context, manager, NomaFocusWidgetProvider.class);
    }

    private static void updateProviderWidgets(
            Context context, AppWidgetManager manager, Class<?> providerClass) {
        try {
            int[] ids = manager.getAppWidgetIds(
                    new ComponentName(context, providerClass));
            for (int id : ids) {
                updateWidget(context, id);
            }
        } catch (Exception ignored) {
            // A failing provider must never break the others.
        }
    }

    /**
     * Renders a widget instance. Never throws: any failure renders the
     * locked card instead (fail closed), so the launcher never shows its
     * generic "Problem loading widget" error.
     */
    public static void updateWidget(Context context, int widgetId) {
        try {
            updateWidgetInternal(context, widgetId);
            NomaWidgetStore.clearError(context);
        } catch (Exception e) {
            Log.e("NomaWidget", "updateWidget failed for widgetId=" + widgetId, e);
            NomaWidgetStore.recordError(context, e.toString());
            applyLockedCardQuietly(context, widgetId);
        }
    }

    /**
     * Last-resort render: a bare locked card built defensively. Used when
     * the normal render path threw, so the widget fails closed no matter
     * what went wrong.
     */
    private static void applyLockedCardQuietly(Context context, int widgetId) {
        try {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_locked);
            try {
                views.setOnClickPendingIntent(
                        R.id.widget_root, pendingDeepLink(context, widgetId, 1, DEEP_LINK_OPEN));
            } catch (Exception ignored) {
                // A broken tap action must not break the fail-closed card.
            }
            if (BuildConfig.DEBUG) {
                // Surface the failure on the widget itself so a screenshot
                // of the test build reveals the exact cause.
                String err = NomaWidgetStore.getLastError(context);
                if (err != null) {
                    try {
                        views.setTextViewText(R.id.widget_locked_sub, truncate(err, 140));
                        views.setTextColor(R.id.widget_locked_sub, 0xFFE5484D);
                    } catch (Exception ignored) {
                    }
                }
            }
            AppWidgetManager.getInstance(context).updateAppWidget(widgetId, views);
        } catch (Exception ignored) {
        }
    }

    private static String truncate(String value, int maxLength) {
        if (value == null) return "";
        return value.length() <= maxLength ? value : value.substring(0, maxLength) + "...";
    }

    private static void updateWidgetInternal(Context context, int widgetId) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        String kind = kindForWidget(context, manager, widgetId);
        if (kind == null) return;

        RemoteViews views;
        if (NomaWidgetStore.isLocked(context)) {
            views = buildLocked(context, widgetId);
        } else {
            String projectionJson = NomaWidgetStore.getProjection(context, widgetId);
            views = buildContent(context, manager, widgetId, kind, projectionJson);
        }
        try {
            manager.updateAppWidget(widgetId, views);
        } catch (Exception ignored) {
        }
    }

    private static String kindForWidget(
            Context context, AppWidgetManager manager, int widgetId) {
        try {
            android.appwidget.AppWidgetProviderInfo info =
                    manager.getAppWidgetInfo(widgetId);
            if (info == null || info.provider == null) return null;
            String className = info.provider.getClassName();
            if (className.equals(NomaNoteWidgetProvider.class.getName())) return "note";
            if (className.equals(NomaTaskWidgetProvider.class.getName())) return "task";
            if (className.equals(NomaFocusWidgetProvider.class.getName())) return "focus";
        } catch (Exception ignored) {
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Theme
    // ------------------------------------------------------------------

    private static final class Theme {
        int background = 0xFFFFFFFF;
        int card = 0xFFFFFFFF;
        int foreground = 0xFF1C1C1E;
        int mutedForeground = 0xFF8E8E93;
        int primary = 0xFF2563EB;
        int primaryForeground = 0xFFFFFFFF;
        int border = 0xFFE5E5EA;
    }

    private static Theme readTheme(Context context) {
        Theme theme = new Theme();
        try {
            String envJson = NomaWidgetStore.getEnvironment(context);
            if (envJson == null) return theme;
            JSONObject themeObj = new JSONObject(envJson).optJSONObject("theme");
            if (themeObj == null) return theme;
            JSONObject colors = themeObj.optJSONObject("colors");
            if (colors == null) return theme;
            theme.background = parseColor(colors.optString("background"), theme.background);
            theme.card = parseColor(colors.optString("card"), theme.card);
            theme.foreground = parseColor(colors.optString("foreground"), theme.foreground);
            theme.mutedForeground = parseColor(
                    colors.optString("mutedForeground"), theme.mutedForeground);
            theme.primary = parseColor(colors.optString("primary"), theme.primary);
            theme.primaryForeground = parseColor(
                    colors.optString("primaryForeground"), theme.primaryForeground);
            theme.border = parseColor(colors.optString("border"), theme.border);
        } catch (Exception ignored) {
        }
        return theme;
    }

    private static int parseColor(String value, int fallback) {
        if (value == null || value.isEmpty()) return fallback;
        try {
            return Color.parseColor(value);
        } catch (Exception e) {
            return fallback;
        }
    }

    // ------------------------------------------------------------------
    // Locked card (fail closed)
    // ------------------------------------------------------------------

    private static RemoteViews buildLocked(Context context, int widgetId) {
        Theme theme = readTheme(context);
        boolean hasEnv = NomaWidgetStore.getEnvironment(context) != null;
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_locked);
        if (hasEnv) {
            views.setInt(R.id.widget_root, "setBackgroundColor", theme.background);
            views.setTextColor(R.id.widget_locked_title, theme.foreground);
            views.setTextColor(R.id.widget_locked_sub, theme.mutedForeground);
            views.setInt(R.id.widget_lock_icon, "setColorFilter", theme.mutedForeground);
        }
        views.setOnClickPendingIntent(
                R.id.widget_root, pendingDeepLink(context, widgetId, 1, DEEP_LINK_OPEN));
        return views;
    }

    // ------------------------------------------------------------------
    // Content
    // ------------------------------------------------------------------

    private static RemoteViews buildContent(
            Context context, AppWidgetManager manager, int widgetId,
            String kind, String projectionJson) {
        JSONObject projection = null;
        try {
            if (projectionJson != null) projection = new JSONObject(projectionJson);
        } catch (Exception ignored) {
        }
        switch (kind) {
            case "note":
                return buildNoteWidget(context, manager, widgetId, projection);
            case "task":
                return buildTaskWidget(context, manager, widgetId, projection);
            default:
                return buildFocusWidget(context, widgetId, projection);
        }
    }

    /** Rows that fit: at least 1, at most maxItems, ~rowHeightDp per row. */
    private static int rowsForHeight(
            AppWidgetManager manager, int widgetId, int maxItems, int rowHeightDp) {
        try {
            Bundle options = manager.getAppWidgetOptions(widgetId);
            int maxHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            if (maxHeight > 0) {
                return Math.max(1, Math.min(maxItems, maxHeight / rowHeightDp));
            }
        } catch (Exception ignored) {
        }
        return Math.max(1, maxItems);
    }

    private static RemoteViews buildNoteWidget(
            Context context, AppWidgetManager manager, int widgetId, JSONObject projection) {
        Theme theme = readTheme(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_note);
        paintChrome(views, theme);

        JSONArray notes = projection != null ? projection.optJSONArray("notes") : null;
        String title = projection != null ? projection.optString("title", "Notes") : "Notes";
        views.setTextViewText(R.id.widget_title, title);
        views.setTextColor(R.id.widget_title, theme.foreground);
        views.setInt(R.id.widget_action, "setColorFilter", theme.mutedForeground);
        views.setOnClickPendingIntent(R.id.widget_title,
                pendingDeepLink(context, widgetId, 10, DEEP_LINK_OPEN));
        views.setOnClickPendingIntent(R.id.widget_action,
                pendingDeepLink(context, widgetId, 11, DEEP_LINK_NEW_NOTE));

        if (notes == null || notes.length() == 0) {
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            views.setTextColor(R.id.widget_empty, theme.mutedForeground);
            views.setOnClickPendingIntent(R.id.widget_root,
                    pendingDeepLink(context, widgetId, 12, DEEP_LINK_OPEN));
            if (notes == null) {
                views.setTextViewText(R.id.widget_empty, "Open Noma to sync");
            }
            return views;
        }

        int rows = rowsForHeight(manager, widgetId, 6, 88);
        String packageName = context.getPackageName();
        for (int i = 0; i < Math.min(rows, notes.length()); i++) {
            JSONObject note = notes.optJSONObject(i);
            if (note == null) continue;
            RemoteViews row = new RemoteViews(packageName, R.layout.widget_note_row);
            String noteTitle = note.optString("title", "Untitled");
            if (noteTitle.isEmpty()) noteTitle = "Untitled";
            row.setTextViewText(R.id.row_title, noteTitle);
            row.setTextColor(R.id.row_title, theme.foreground);
            String preview = note.optString("preview", "");
            if (preview.isEmpty()) {
                row.setViewVisibility(R.id.row_preview, View.GONE);
            } else {
                row.setTextViewText(R.id.row_preview, preview);
                row.setTextColor(R.id.row_preview, theme.mutedForeground);
            }
            int accent = parseColor(note.optString("accent", ""), theme.primary);
            row.setInt(R.id.row_rail, "setColorFilter", accent);
            String noteId = note.optString("id", "");
            row.setOnClickPendingIntent(R.id.widget_note_row_root,
                    pendingDeepLink(context, widgetId, 100 + i,
                            noteId.isEmpty() ? DEEP_LINK_OPEN : deepLinkOpenNote(noteId)));
            views.addView(R.id.widget_list, row);
        }
        return views;
    }

    private static RemoteViews buildTaskWidget(
            Context context, AppWidgetManager manager, int widgetId, JSONObject projection) {
        Theme theme = readTheme(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_task);
        paintChrome(views, theme);

        JSONArray tasks = projection != null ? projection.optJSONArray("tasks") : null;
        String title = projection != null ? projection.optString("title", "Tasks") : "Tasks";
        views.setTextViewText(R.id.widget_title, title);
        views.setTextColor(R.id.widget_title, theme.foreground);
        views.setOnClickPendingIntent(R.id.widget_title,
                pendingDeepLink(context, widgetId, 20, DEEP_LINK_OPEN_TASKS));

        if (tasks == null || tasks.length() == 0) {
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            views.setTextColor(R.id.widget_empty, theme.mutedForeground);
            views.setOnClickPendingIntent(R.id.widget_root,
                    pendingDeepLink(context, widgetId, 21, DEEP_LINK_OPEN_TASKS));
            if (tasks == null) {
                views.setTextViewText(R.id.widget_empty, "Open Noma to sync");
            }
            return views;
        }

        views.setTextViewText(R.id.widget_count, String.valueOf(tasks.length()));
        views.setTextColor(R.id.widget_count, theme.mutedForeground);

        int rows = rowsForHeight(manager, widgetId, 6, 68);
        String packageName = context.getPackageName();
        long now = System.currentTimeMillis();
        for (int i = 0; i < Math.min(rows, tasks.length()); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task == null) continue;
            RemoteViews row = new RemoteViews(packageName, R.layout.widget_task_row);
            String taskTitle = task.optString("title", "Untitled");
            if (taskTitle.isEmpty()) taskTitle = "Untitled";
            row.setTextViewText(R.id.row_title, taskTitle);
            row.setTextColor(R.id.row_title, theme.foreground);
            row.setInt(R.id.row_check, "setColorFilter", theme.mutedForeground);

            long dueAt = task.optLong("dueAt", -1);
            if (dueAt > 0) {
                DueLabel due = dueLabel(dueAt, now);
                row.setTextViewText(R.id.row_due, due.text);
                row.setTextColor(R.id.row_due, due.color != 0 ? due.color : theme.mutedForeground);
            } else {
                String listName = task.optString("listName", "");
                if (!listName.isEmpty()) {
                    row.setTextViewText(R.id.row_due, listName);
                    row.setTextColor(R.id.row_due, theme.mutedForeground);
                } else {
                    row.setViewVisibility(R.id.row_due, View.GONE);
                }
            }

            String priority = task.optString("priority", "none");
            int priorityColor = priorityColor(priority);
            if (priorityColor == 0) {
                row.setViewVisibility(R.id.row_priority, View.GONE);
            } else {
                row.setInt(R.id.row_priority, "setColorFilter", priorityColor);
            }

            String taskId = task.optString("id", "");
            if (!taskId.isEmpty()) {
                // Tapping the circle asks Noma to complete the task (App Lock still applies).
                row.setOnClickPendingIntent(R.id.row_check,
                        pendingDeepLink(context, widgetId, 200 + i, deepLinkToggleTask(taskId)));
            }
            row.setOnClickPendingIntent(R.id.widget_task_row_root,
                    pendingDeepLink(context, widgetId, 300 + i, DEEP_LINK_OPEN_TASKS));
            views.addView(R.id.widget_list, row);
        }
        return views;
    }

    private static RemoteViews buildFocusWidget(
            Context context, int widgetId, JSONObject projection) {
        Theme theme = readTheme(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_focus);
        views.setInt(R.id.widget_root, "setBackgroundColor", theme.background);
        views.setTextColor(R.id.widget_title, theme.foreground);
        views.setInt(R.id.widget_divider, "setBackgroundColor", theme.border);
        views.setOnClickPendingIntent(R.id.widget_title,
                pendingDeepLink(context, widgetId, 30, DEEP_LINK_OPEN));

        boolean hasContent = false;

        JSONObject note = projection != null ? projection.optJSONObject("note") : null;
        if (note != null) {
            hasContent = true;
            String noteTitle = note.optString("title", "Untitled");
            if (noteTitle.isEmpty()) noteTitle = "Untitled";
            views.setTextViewText(R.id.focus_note_title, noteTitle);
            views.setTextColor(R.id.focus_note_title, theme.foreground);
            String preview = note.optString("preview", "");
            if (preview.isEmpty()) {
                views.setViewVisibility(R.id.focus_note_preview, View.GONE);
            } else {
                views.setTextViewText(R.id.focus_note_preview, preview);
                views.setTextColor(R.id.focus_note_preview, theme.mutedForeground);
            }
            int accent = parseColor(note.optString("accent", ""), theme.primary);
            views.setInt(R.id.focus_rail, "setColorFilter", accent);
            String noteId = note.optString("id", "");
            views.setOnClickPendingIntent(R.id.focus_note_card,
                    pendingDeepLink(context, widgetId, 31,
                            noteId.isEmpty() ? DEEP_LINK_OPEN : deepLinkOpenNote(noteId)));
        } else {
            views.setViewVisibility(R.id.focus_note_card, View.GONE);
        }

        int dueToday = projection != null ? projection.optInt("dueToday", 0) : 0;
        int overdue = projection != null ? projection.optInt("overdue", 0) : 0;
        String stats = dueToday + " due today · " + overdue + " overdue";
        views.setTextViewText(R.id.focus_stats, stats);
        views.setTextColor(R.id.focus_stats, theme.mutedForeground);

        JSONObject next = projection != null ? projection.optJSONObject("nextTask") : null;
        if (next != null) {
            hasContent = true;
            String nextTitle = next.optString("title", "Untitled");
            if (nextTitle.isEmpty()) nextTitle = "Untitled";
            views.setTextViewText(R.id.focus_next_title, nextTitle);
            views.setTextColor(R.id.focus_next_title, theme.foreground);
            long dueAt = next.optLong("dueAt", -1);
            if (dueAt > 0) {
                DueLabel due = dueLabel(dueAt, System.currentTimeMillis());
                views.setTextViewText(R.id.focus_next_due, "Next: " + due.text);
                views.setTextColor(R.id.focus_next_due,
                        due.color != 0 ? due.color : theme.mutedForeground);
            } else {
                views.setViewVisibility(R.id.focus_next_due, View.GONE);
            }
            views.setInt(R.id.focus_next_check, "setColorFilter", theme.mutedForeground);
            String taskId = next.optString("id", "");
            if (!taskId.isEmpty()) {
                views.setOnClickPendingIntent(R.id.focus_next_check,
                        pendingDeepLink(context, widgetId, 32, deepLinkToggleTask(taskId)));
            }
            views.setOnClickPendingIntent(R.id.focus_next_row,
                    pendingDeepLink(context, widgetId, 33, DEEP_LINK_OPEN_TASKS));
        } else {
            views.setViewVisibility(R.id.focus_next_row, View.GONE);
        }

        if (projection == null) {
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            views.setTextViewText(R.id.widget_empty, "Open Noma to sync");
            views.setTextColor(R.id.widget_empty, theme.mutedForeground);
        } else if (!hasContent && dueToday == 0 && overdue == 0) {
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            views.setTextColor(R.id.widget_empty, theme.mutedForeground);
        }
        views.setOnClickPendingIntent(R.id.widget_root,
                pendingDeepLink(context, widgetId, 34, DEEP_LINK_OPEN));
        return views;
    }

    /** Shared header/divider theming for the note and task widgets. */
    private static void paintChrome(RemoteViews views, Theme theme) {
        views.setInt(R.id.widget_root, "setBackgroundColor", theme.background);
        views.setInt(R.id.widget_divider, "setBackgroundColor", theme.border);
    }

    // ------------------------------------------------------------------
    // Deep links
    // ------------------------------------------------------------------

    private static PendingIntent pendingDeepLink(
            Context context, int widgetId, int actionCode, String deepLink) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(deepLink),
                context, MainActivity.class);
        int requestCode = (widgetId * 7919 + actionCode * 131 + deepLink.hashCode()) & 0x0FFFFFFF;
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, requestCode, intent, flags);
    }

    // ------------------------------------------------------------------
    // Due labels + priority
    // ------------------------------------------------------------------

    private static final class DueLabel {
        final String text;
        /** 0 = use the theme's muted color. */
        final int color;

        DueLabel(String text, int color) {
            this.text = text;
            this.color = color;
        }
    }

    private static DueLabel dueLabel(long dueAt, long now) {
        Calendar day = Calendar.getInstance();
        day.setTimeInMillis(now);
        day.set(Calendar.HOUR_OF_DAY, 0);
        day.set(Calendar.MINUTE, 0);
        day.set(Calendar.SECOND, 0);
        day.set(Calendar.MILLISECOND, 0);
        long startOfToday = day.getTimeInMillis();
        day.add(Calendar.DAY_OF_YEAR, 1);
        long startOfTomorrow = day.getTimeInMillis();
        day.add(Calendar.DAY_OF_YEAR, 1);
        long startOfDayAfter = day.getTimeInMillis();

        if (dueAt < startOfToday) {
            return new DueLabel("Overdue", COLOR_OVERDUE);
        }
        if (dueAt < startOfTomorrow) {
            return new DueLabel("Today", COLOR_TODAY);
        }
        if (dueAt < startOfDayAfter) {
            return new DueLabel("Tomorrow", 0);
        }
        SimpleDateFormat format = new SimpleDateFormat("d MMM", Locale.getDefault());
        return new DueLabel(format.format(dueAt), 0);
    }

    private static int priorityColor(String priority) {
        if ("high".equals(priority)) return COLOR_PRIORITY_HIGH;
        if ("medium".equals(priority)) return COLOR_PRIORITY_MEDIUM;
        if ("low".equals(priority)) return COLOR_PRIORITY_LOW;
        return 0;
    }
}
