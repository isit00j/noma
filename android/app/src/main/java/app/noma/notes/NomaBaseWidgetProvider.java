package app.noma.notes;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.util.Log;

import java.util.Arrays;

/**
 * Shared base for Noma's widget providers.
 *
 * Behavior:
 * - {@code onUpdate}: render each instance from the cached projection (or the
 *   locked card). Called by the system on placement, resize and periodic
 *   updates (period is 0 — we never poll).
 * - {@code onDeleted}: drop the instance's cached projection + config.
 * - {@code onAppWidgetOptionsChanged}: re-render so row counts follow resizes.
 * - {@code onEnabled}: refresh everything (covers process-death recovery).
 */
public abstract class NomaBaseWidgetProvider extends AppWidgetProvider {

    private static final String TAG = "NomaWidget";

    /** "note" | "task" | "focus". */
    protected abstract String kind();

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        Log.d(TAG, "provider onUpdate: kind=" + kind() + " ids=" + Arrays.toString(appWidgetIds));
        for (int widgetId : appWidgetIds) {
            NomaWidgetUpdater.updateWidget(context, widgetId);
        }
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        Log.d(TAG, "provider onDeleted: kind=" + kind() + " ids=" + Arrays.toString(appWidgetIds));
        for (int widgetId : appWidgetIds) {
            NomaWidgetStore.removeWidgetData(context, widgetId);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(
            Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
        Log.d(TAG, "provider onAppWidgetOptionsChanged: kind=" + kind() + " id=" + appWidgetId);
        NomaWidgetUpdater.updateWidget(context, appWidgetId);
    }

    @Override
    public void onEnabled(Context context) {
        Log.d(TAG, "provider onEnabled: kind=" + kind());
        NomaWidgetUpdater.updateAll(context);
    }

    @Override
    public void onDisabled(Context context) {
        Log.d(TAG, "provider onDisabled: kind=" + kind());
    }
}
