package app.noma.notes;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.provider.AlarmClock;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * Minimal native bridge for Noma's "Phone alarm" reminder alert type.
 *
 * Design rules:
 * - Noma never implements its own alarm engine. The system/default Clock app
 *   owns ringing, snooze, dismiss, lock-screen behavior, alarm volume and UI.
 * - This plugin only (1) fires the standard ACTION_SET_ALARM intent,
 *   (2) opens the system ringtone picker, (3) opens the Storage Access
 *   Framework audio picker, and (4) briefly previews a tone via MediaPlayer.
 * - Android offers no reliable cross-device API to cancel or enumerate alarms
 *   created in an external Clock app, so this plugin deliberately exposes no
 *   cancellation. The web layer documents that limitation to the user.
 */
@CapacitorPlugin(name = "NomaAlarm")
public class NomaAlarmPlugin extends Plugin {

    private ActivityResultLauncher<Intent> ringtonePickerLauncher;
    private ActivityResultLauncher<Intent> audioPickerLauncher;
    private PluginCall pendingRingtoneCall;
    private PluginCall pendingAudioCall;
    private MediaPlayer previewPlayer;

    @Override
    public void load() {
        super.load();
        ringtonePickerLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            this::handleRingtonePickerResult
        );
        audioPickerLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            this::handleAudioPickerResult
        );
    }

    // ------------------------------------------------------------------
    // Capability + alarm handoff
    // ------------------------------------------------------------------

    /** True when at least one installed app can handle ACTION_SET_ALARM. */
    @PluginMethod
    public void checkAlarmCapability(PluginCall call) {
        boolean available = resolveAlarmHandler() != null;
        JSObject res = new JSObject();
        res.put("available", available);
        call.resolve(res);
    }

    /**
     * Launch the device alarm-clock app with a pre-filled alarm.
     * Options: hour (0-23), minute (0-59), message, vibrate, ringtoneUri?.
     * Shows the Clock app UI so the user confirms — Noma never sets the alarm
     * silently and never learns whether the user completed it.
     */
    @PluginMethod
    public void setAlarm(PluginCall call) {
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");
        String message = call.getString("message", "Noma reminder");
        boolean vibrate = Boolean.TRUE.equals(call.getBoolean("vibrate", true));
        String ringtoneUriStr = call.getString("ringtoneUri");

        if (hour == null || minute == null || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            call.reject("Invalid alarm time.", "INVALID_TIME");
            return;
        }

        ResolveInfo handler = resolveAlarmHandler();
        if (handler == null) {
            call.reject("No alarm-clock application is installed on this device.", "NO_ALARM_APP");
            return;
        }

        Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM);
        intent.putExtra(AlarmClock.EXTRA_HOUR, hour);
        intent.putExtra(AlarmClock.EXTRA_MINUTES, minute);
        intent.putExtra(AlarmClock.EXTRA_MESSAGE, message);
        intent.putExtra(AlarmClock.EXTRA_VIBRATE, vibrate);

        // Custom tone: attach only if the URI is still readable; otherwise the
        // Clock app falls back to its own default sound.
        if (ringtoneUriStr != null && !ringtoneUriStr.isEmpty()) {
            try {
                Uri ringtoneUri = Uri.parse(ringtoneUriStr);
                if (isUriReadable(ringtoneUri)) {
                    intent.putExtra(AlarmClock.EXTRA_RINGTONE, ringtoneUri);
                    grantRingtoneReadAccess(ringtoneUri);
                }
            } catch (Exception e) {
                // Ignore: alarm is still created with the Clock app's default tone.
            }
        }

        Activity activity = getActivity();
        Runnable launch = () -> {
            try {
                if (activity != null) {
                    activity.startActivity(intent);
                } else {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                }
                JSObject res = new JSObject();
                res.put("launched", true);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Could not open the alarm-clock application: " + e.getMessage(), "INTENT_FAILED");
            }
        };
        if (activity != null) {
            activity.runOnUiThread(launch);
        } else {
            launch.run();
        }
    }

    private ResolveInfo resolveAlarmHandler() {
        PackageManager pm = getContext().getPackageManager();
        Intent probe = new Intent(AlarmClock.ACTION_SET_ALARM);
        return pm.resolveActivity(probe, PackageManager.MATCH_DEFAULT_ONLY);
    }

    /** Let the chosen Clock app read our tone URI (SAF grants are per-app). */
    private void grantRingtoneReadAccess(Uri uri) {
        try {
            PackageManager pm = getContext().getPackageManager();
            List<ResolveInfo> handlers = pm.queryIntentActivities(
                new Intent(AlarmClock.ACTION_SET_ALARM),
                PackageManager.MATCH_DEFAULT_ONLY
            );
            for (ResolveInfo info : handlers) {
                if (info.activityInfo != null) {
                    getContext().grantUriPermission(
                        info.activityInfo.packageName,
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    );
                }
            }
        } catch (Exception ignored) {
            // Best effort; the Clock app may still read world-readable URIs.
        }
    }

    // ------------------------------------------------------------------
    // System ringtone picker
    // ------------------------------------------------------------------

    @PluginMethod
    public void pickSystemRingtone(PluginCall call) {
        Intent intent = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Choose alarm sound");
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false);
        String existing = call.getString("existingUri");
        if (existing != null && !existing.isEmpty()) {
            try {
                intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(existing));
            } catch (Exception ignored) {
            }
        }
        if (resolveIntent(intent) == null) {
            call.reject("No system ringtone picker is available on this device.", "NO_PICKER");
            return;
        }
        pendingRingtoneCall = call;
        try {
            ringtonePickerLauncher.launch(intent);
        } catch (Exception e) {
            pendingRingtoneCall = null;
            call.reject("Failed to open the ringtone picker: " + e.getMessage(), "INTENT_FAILED");
        }
    }

    private void handleRingtonePickerResult(ActivityResult result) {
        PluginCall call = pendingRingtoneCall;
        pendingRingtoneCall = null;
        if (call == null) return;

        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Ringtone selection was cancelled.", "USER_CANCELLED");
            return;
        }
        Uri uri = result.getData().getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
        JSObject res = new JSObject();
        if (uri == null) {
            res.put("uri", null);
            res.put("name", null);
        } else {
            res.put("uri", uri.toString());
            res.put("name", resolveToneName(uri));
        }
        call.resolve(res);
    }

    // ------------------------------------------------------------------
    // Device audio picker (Storage Access Framework)
    // ------------------------------------------------------------------

    /**
     * Opens the system document picker filtered to audio. Uses
     * CATEGORY_OPENABLE and persists the read grant so the URI survives
     * app restarts. No broad storage permission is requested.
     */
    @PluginMethod
    public void pickAudioFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.setType("audio/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        if (resolveIntent(intent) == null) {
            call.reject("No document picker is available on this device.", "NO_PICKER");
            return;
        }
        pendingAudioCall = call;
        try {
            audioPickerLauncher.launch(intent);
        } catch (Exception e) {
            pendingAudioCall = null;
            call.reject("Failed to open the audio picker: " + e.getMessage(), "INTENT_FAILED");
        }
    }

    private void handleAudioPickerResult(ActivityResult result) {
        PluginCall call = pendingAudioCall;
        pendingAudioCall = null;
        if (call == null) return;

        if (result == null || result.getResultCode() != Activity.RESULT_OK
                || result.getData() == null || result.getData().getData() == null) {
            call.reject("Audio file selection was cancelled.", "USER_CANCELLED");
            return;
        }
        Uri uri = result.getData().getData();
        int takeFlags = result.getData().getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, takeFlags);
        } catch (Exception ignored) {
            // Provider may not offer persistable grants; the URI still works for this session.
        }
        JSObject res = new JSObject();
        res.put("uri", uri.toString());
        res.put("name", resolveToneName(uri));
        call.resolve(res);
    }

    // ------------------------------------------------------------------
    // Tone validation + preview
    // ------------------------------------------------------------------

    /** Check whether a stored tone URI can still be opened for reading. */
    @PluginMethod
    public void validateToneUri(PluginCall call) {
        String uriStr = call.getString("uri");
        JSObject res = new JSObject();
        if (uriStr == null || uriStr.isEmpty()) {
            res.put("accessible", false);
            res.put("name", null);
            call.resolve(res);
            return;
        }
        try {
            Uri uri = Uri.parse(uriStr);
            boolean accessible = isUriReadable(uri);
            res.put("accessible", accessible);
            res.put("name", accessible ? resolveToneName(uri) : null);
        } catch (Exception e) {
            res.put("accessible", false);
            res.put("name", null);
        }
        call.resolve(res);
    }

    /**
     * Briefly preview a tone through the alarm audio stream.
     * Lightweight on purpose: one MediaPlayer, released on completion,
     * error, or when a new preview starts.
     */
    @PluginMethod
    public void previewTone(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.isEmpty()) {
            call.reject("No tone URI provided.", "INVALID_URI");
            return;
        }
        stopPreviewPlayer();
        try {
            Uri uri = Uri.parse(uriStr);
            if (!isUriReadable(uri)) {
                call.reject("The selected audio file is no longer available.", "TONE_UNAVAILABLE");
                return;
            }
            MediaPlayer player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build());
            player.setDataSource(getContext(), uri);
            player.setOnCompletionListener(mp -> stopPreviewPlayer());
            player.setOnErrorListener((mp, what, extra) -> {
                stopPreviewPlayer();
                return true;
            });
            previewPlayer = player;
            player.setOnPreparedListener(MediaPlayer::start);
            player.prepareAsync();
            call.resolve();
        } catch (Exception e) {
            stopPreviewPlayer();
            call.reject("Could not preview the tone: " + e.getMessage(), "PREVIEW_FAILED");
        }
    }

    @PluginMethod
    public void stopPreview(PluginCall call) {
        stopPreviewPlayer();
        call.resolve();
    }

    private void stopPreviewPlayer() {
        if (previewPlayer != null) {
            try {
                previewPlayer.stop();
            } catch (Exception ignored) {
            }
            try {
                previewPlayer.release();
            } catch (Exception ignored) {
            }
            previewPlayer = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopPreviewPlayer();
        super.handleOnDestroy();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private ResolveInfo resolveIntent(Intent intent) {
        return getContext().getPackageManager()
            .resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
    }

    private boolean isUriReadable(Uri uri) {
        try {
            getContext().getContentResolver().openInputStream(uri).close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String resolveToneName(Uri uri) {
        String name = queryDisplayName(uri);
        if (name != null && !name.isEmpty()) return name;
        try {
            android.media.Ringtone ringtone = RingtoneManager.getRingtone(getContext(), uri);
            if (ringtone != null) {
                String title = ringtone.getTitle(getContext());
                if (title != null && !title.isEmpty()) return title;
            }
        } catch (Exception ignored) {
        }
        String last = uri.getLastPathSegment();
        return last != null ? last : uri.toString();
    }

    private String queryDisplayName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(
                uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) return cursor.getString(idx);
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return null;
    }
}
