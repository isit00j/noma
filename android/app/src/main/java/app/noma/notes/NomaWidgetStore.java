package app.noma.notes;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Device-local persistence for Noma's home-screen widgets.
 *
 * Contents:
 * - Lock mirror: whether the widgets must render the locked card. Defaults
 *   to {@code true} (fail closed) so widgets never expose content before the
 *   WebView has pushed the real lock state.
 * - Environment JSON: last pushed theme (+ lock flag) used for rendering.
 * - Per-widget projections: last pushed content JSON, keyed by widget ID.
 * - Per-widget configuration JSON, keyed by widget ID.
 *
 * Everything here is device-local. It is intentionally NOT part of Noma's
 * Drive backup (which serializes Dexie tables only) and it is excluded from
 * Android Auto Backup via res/xml/backup_rules.xml.
 */
public final class NomaWidgetStore {

    private static final String PREFS = "noma_widget_prefs";
    private static final String KEY_LOCKED = "lock_locked";
    private static final String KEY_ENV = "env_json";
    private static final String KEY_PROJECTION_PREFIX = "projection_";
    private static final String KEY_CONFIG_PREFIX = "config_";

    private NomaWidgetStore() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ------------------------------------------------------------------
    // Lock mirror (fail closed)
    // ------------------------------------------------------------------

    /** True unless the WebView explicitly pushed {@code locked:false}. */
    public static boolean isLocked(Context context) {
        return prefs(context).getBoolean(KEY_LOCKED, true);
    }

    public static void setLocked(Context context, boolean locked) {
        prefs(context).edit().putBoolean(KEY_LOCKED, locked).apply();
    }

    // ------------------------------------------------------------------
    // Environment (theme + lock flag)
    // ------------------------------------------------------------------

    public static void saveEnvironment(Context context, String envJson) {
        prefs(context).edit().putString(KEY_ENV, envJson).apply();
    }

    public static String getEnvironment(Context context) {
        return prefs(context).getString(KEY_ENV, null);
    }

    // ------------------------------------------------------------------
    // Projections (per widget ID)
    // ------------------------------------------------------------------

    public static void saveProjection(Context context, int widgetId, String projectionJson) {
        prefs(context).edit().putString(KEY_PROJECTION_PREFIX + widgetId, projectionJson).apply();
    }

    public static String getProjection(Context context, int widgetId) {
        return prefs(context).getString(KEY_PROJECTION_PREFIX + widgetId, null);
    }

    // ------------------------------------------------------------------
    // Configuration (per widget ID)
    // ------------------------------------------------------------------

    public static void saveConfig(Context context, int widgetId, String configJson) {
        prefs(context).edit().putString(KEY_CONFIG_PREFIX + widgetId, configJson).apply();
    }

    public static String getConfig(Context context, int widgetId) {
        return prefs(context).getString(KEY_CONFIG_PREFIX + widgetId, null);
    }

    /** Remove projection + config for a deleted widget instance. */
    public static void removeWidgetData(Context context, int widgetId) {
        prefs(context).edit()
                .remove(KEY_PROJECTION_PREFIX + widgetId)
                .remove(KEY_CONFIG_PREFIX + widgetId)
                .apply();
    }

    /** All widget IDs that have a stored config (for diagnostics). */
    public static List<Integer> configuredWidgetIds(Context context) {
        List<Integer> ids = new ArrayList<>();
        Map<String, ?> all = prefs(context).getAll();
        for (String key : all.keySet()) {
            if (key.startsWith(KEY_CONFIG_PREFIX)) {
                try {
                    ids.add(Integer.parseInt(key.substring(KEY_CONFIG_PREFIX.length())));
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return ids;
    }
}
