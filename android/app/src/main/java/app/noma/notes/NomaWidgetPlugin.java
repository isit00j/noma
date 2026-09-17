package app.noma.notes;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;

/**
 * Bridge between the Noma WebView and the native home-screen widgets.
 *
 * The WebView owns all data (Dexie) and pushes privacy-scrubbed projections;
 * native only caches and renders them. There is no polling in either
 * direction. Widget configuration is stored natively per widget ID and is
 * device-local (excluded from Drive backup and Auto Backup).
 */
@CapacitorPlugin(name = "NomaWidget")
public class NomaWidgetPlugin extends Plugin {

    private static final Class<?>[] PROVIDERS = {
            NomaNoteWidgetProvider.class,
            NomaTaskWidgetProvider.class,
            NomaFocusWidgetProvider.class,
    };

    private static final String[] KINDS = {"note", "task", "focus"};

    // ------------------------------------------------------------------
    // getWidgets
    // ------------------------------------------------------------------

    /** Widgets currently on the launcher, with their stored configs. */
    @PluginMethod
    public void getWidgets(PluginCall call) {
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
            JSONArray widgets = new JSONArray();
            for (int i = 0; i < PROVIDERS.length; i++) {
                int[] ids = manager.getAppWidgetIds(
                        new ComponentName(getContext(), PROVIDERS[i]));
                for (int id : ids) {
                    JSONObject entry = new JSONObject();
                    entry.put("id", id);
                    entry.put("kind", KINDS[i]);
                    String configJson = NomaWidgetStore.getConfig(getContext(), id);
                    entry.put("config",
                            configJson != null ? new JSONObject(configJson) : JSONObject.NULL);
                    widgets.put(entry);
                }
            }
            JSObject result = new JSObject();
            result.put("widgets", widgets);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not list widgets: " + e.getMessage(), "WIDGET_LIST_FAILED");
        }
    }

    // ------------------------------------------------------------------
    // pushEnvironment
    // ------------------------------------------------------------------

    /**
     * Lock state + theme. Expected on every lock/unlock change, on theme
     * change, and when the app comes to the foreground. Re-renders all
     * widgets from the cache. When {@code locked} is true the widgets render
     * the locked card and no content is expected.
     */
    @PluginMethod
    public void pushEnvironment(PluginCall call) {
        try {
            // Default to locked when the flag is absent: fail closed.
            boolean locked = Boolean.TRUE.equals(call.getBoolean("locked", true));
            JSObject theme = call.getObject("theme");
            NomaWidgetStore.setLocked(getContext(), locked);
            JSONObject env = new JSONObject();
            env.put("locked", locked);
            if (theme != null) {
                env.put("theme", new JSONObject(theme.toString()));
            }
            NomaWidgetStore.saveEnvironment(getContext(), env.toString());
            NomaWidgetUpdater.updateAll(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not push widget environment: " + e.getMessage(), "PUSH_FAILED");
        }
    }

    // ------------------------------------------------------------------
    // pushProjections
    // ------------------------------------------------------------------

    /**
     * Per-widget content projections, keyed by widget ID (as strings).
     * The web layer builds these from Dexie, already privacy-scrubbed and
     * trimmed; native just caches and renders them.
     */
    @PluginMethod
    public void pushProjections(PluginCall call) {
        try {
            JSObject projections = call.getObject("projections");
            if (projections == null) {
                call.reject("Missing projections.", "INVALID_PROJECTIONS");
                return;
            }
            Iterator<String> keys = projections.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                int widgetId;
                try {
                    widgetId = Integer.parseInt(key);
                } catch (NumberFormatException e) {
                    continue;
                }
                Object value = projections.get(key);
                if (value == null) continue;
                NomaWidgetStore.saveProjection(getContext(), widgetId, value.toString());
                NomaWidgetUpdater.updateWidget(getContext(), widgetId);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not push widget projections: " + e.getMessage(), "PUSH_FAILED");
        }
    }

    // ------------------------------------------------------------------
    // saveWidgetConfig
    // ------------------------------------------------------------------

    /** Persist per-widget configuration (from Noma's widget settings) and re-render. */
    @PluginMethod
    public void saveWidgetConfig(PluginCall call) {
        try {
            Integer widgetId = call.getInt("widgetId");
            JSObject config = call.getObject("config");
            if (widgetId == null || config == null) {
                call.reject("Missing widgetId or config.", "INVALID_CONFIG");
                return;
            }
            NomaWidgetStore.saveConfig(getContext(), widgetId, config.toString());
            NomaWidgetUpdater.updateWidget(getContext(), widgetId);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not save widget config: " + e.getMessage(), "CONFIG_SAVE_FAILED");
        }
    }

    // ------------------------------------------------------------------
    // requestPinWidget
    // ------------------------------------------------------------------

    /** Ask the launcher to pin a new widget of the given kind (Android 8+). */
    @PluginMethod
    public void requestPinWidget(PluginCall call) {
        String kind = call.getString("kind", "");
        Class<?> provider = providerForKind(kind);
        if (provider == null) {
            call.reject("Unknown widget kind.", "INVALID_KIND");
            return;
        }
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                JSObject result = new JSObject();
                result.put("pinned", false);
                call.resolve(result);
                return;
            }
            AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
            boolean supported = manager.isRequestPinAppWidgetSupported();
            JSObject result = new JSObject();
            if (!supported) {
                result.put("pinned", false);
                call.resolve(result);
                return;
            }
            ComponentName component = new ComponentName(getContext(), provider);
            boolean accepted = manager.requestPinAppWidget(component, null, null);
            result.put("pinned", accepted);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not pin widget: " + e.getMessage(), "PIN_FAILED");
        }
    }

    private static Class<?> providerForKind(String kind) {
        for (int i = 0; i < KINDS.length; i++) {
            if (KINDS[i].equals(kind)) return PROVIDERS[i];
        }
        return null;
    }
}
