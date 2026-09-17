package app.noma.notes;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Re-renders widgets after a reboot or app update from the cached projections.
 *
 * No data is fetched here: the lock mirror defaults to locked, so widgets fail
 * closed (locked card) until Noma runs and the WebView pushes fresh state.
 */
public class NomaWidgetBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            NomaWidgetUpdater.updateAll(context.getApplicationContext());
        }
    }
}
