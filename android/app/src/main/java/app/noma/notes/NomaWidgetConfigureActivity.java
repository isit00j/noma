package app.noma.notes;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;

/**
 * Shown by the launcher when a Noma widget is first placed.
 *
 * Writes a sensible default configuration for the new widget instance, then
 * lets the user either place it immediately or jump into Noma's widget
 * settings for finer control. Full configuration lives inside Noma (where
 * Dexie is available); this activity stays intentionally thin.
 */
public abstract class NomaWidgetConfigureActivity extends Activity {

    /** Default config JSON for the widget kind being placed. */
    protected abstract String defaultConfigJson();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_widget_configure);

        int widgetId = getIntent().getIntExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            setResult(RESULT_CANCELED);
            finish();
            return;
        }

        Button addButton = findViewById(R.id.configure_add);
        Button customizeButton = findViewById(R.id.configure_customize);

        addButton.setOnClickListener(v -> {
            NomaWidgetStore.saveConfig(this, widgetId, defaultConfigJson());
            NomaWidgetUpdater.updateWidget(this, widgetId);
            finishWithResult(widgetId, RESULT_OK);
        });

        customizeButton.setOnClickListener(v -> {
            NomaWidgetStore.saveConfig(this, widgetId, defaultConfigJson());
            NomaWidgetUpdater.updateWidget(this, widgetId);
            finishWithResult(widgetId, RESULT_OK);
            // Hand the user to Noma's widget settings for finer control.
            Intent intent = new Intent(Intent.ACTION_VIEW,
                    Uri.parse(NomaWidgetUpdater.DEEP_LINK_OPEN_SETTINGS),
                    this, MainActivity.class);
            startActivity(intent);
        });
    }

    private void finishWithResult(int widgetId, int resultCode) {
        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        setResult(resultCode, result);
        finish();
    }
}
