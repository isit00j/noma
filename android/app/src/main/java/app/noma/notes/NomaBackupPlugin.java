package app.noma.notes;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Exports Noma backups to a user-visible Internal storage/Noma folder.
 *
 * Android 9 and below can create the folder directly with the legacy storage
 * permission. Android 10+ uses the system folder picker once, persists the
 * selected Noma folder, and writes subsequent backups there without another
 * prompt.
 */
@CapacitorPlugin(name = "NomaBackup")
public class NomaBackupPlugin extends Plugin {
    private static final String PREFS = "noma_backup";
    private static final String TREE_URI = "tree_uri";
    private static final int WRITE_PERMISSION_REQUEST = 7301;

    private ActivityResultLauncher<Intent> treePickerLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        super.load();
        treePickerLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            this::handleTreePickerResult
        );
    }

    @PluginMethod
    public void save(PluginCall call) {
        String fileName = call.getString("fileName");
        String base64 = call.getString("base64");
        if (fileName == null || fileName.isEmpty() || base64 == null) {
            call.reject("A backup filename and data are required.", "INVALID_INPUT");
            return;
        }

        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            saveLegacy(call, fileName, base64);
            return;
        }

        Uri treeUri = getSavedTreeUri();
        if (treeUri != null) {
            if (saveToTree(call, treeUri, fileName, base64)) return;
            clearSavedTreeUri();
        }

        pendingCall = call;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        treePickerLauncher.launch(intent);
    }

    private void handleTreePickerResult(ActivityResult result) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;

        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Choose the Noma folder to save your backup.", "USER_CANCELLED");
            return;
        }

        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("No folder was selected.", "NO_FOLDER");
            return;
        }

        try {
            int takeFlags = result.getData().getFlags()
                & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getActivity().getContentResolver().takePersistableUriPermission(treeUri, takeFlags);
        } catch (Exception ignored) {
            // Some providers do not support persisted permissions; the current
            // export can still succeed using the temporary grant.
        }

        saveTreeUri(treeUri);
        String fileName = call.getString("fileName");
        String base64 = call.getString("base64");
        if (fileName == null || base64 == null || !saveToTree(call, treeUri, fileName, base64)) {
            clearSavedTreeUri();
        }
    }

    private boolean saveToTree(PluginCall call, Uri treeUri, String fileName, String base64) {
        try {
            DocumentFile directory = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (directory == null || !directory.canWrite()) {
                return false;
            }

            DocumentFile existing = directory.findFile(fileName);
            if (existing != null) existing.delete();
            DocumentFile target = directory.createFile("application/zip", fileName);
            if (target == null) {
                call.reject("Noma could not create the backup file.", "CREATE_FAILED");
                return true;
            }

            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            try (OutputStream output = getContext().getContentResolver().openOutputStream(target.getUri())) {
                if (output == null) throw new IllegalStateException("Could not open backup destination.");
                output.write(bytes);
                output.flush();
            }

            JSObject result = new JSObject();
            result.put("path", "Internal storage/Noma/" + fileName);
            call.resolve(result);
            return true;
        } catch (Exception e) {
            call.reject("Could not save the backup: " + e.getMessage(), "WRITE_FAILED");
            return true;
        }
    }

    private void saveLegacy(PluginCall call, String fileName, String base64) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && getContext().checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            pendingCall = call;
            getActivity().requestPermissions(
                new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE },
                WRITE_PERMISSION_REQUEST
            );
            return;
        }
        writeLegacyFile(call, fileName, base64);
    }

    @Override
    public void handleOnRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.handleOnRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != WRITE_PERMISSION_REQUEST) return;

        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;
        if (grantResults.length == 0
            || grantResults[0] != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            call.reject("Storage permission is required to save backups on this Android version.", "PERMISSION_DENIED");
            return;
        }

        String fileName = call.getString("fileName");
        String base64 = call.getString("base64");
        if (fileName == null || base64 == null) {
            call.reject("A backup filename and data are required.", "INVALID_INPUT");
            return;
        }
        writeLegacyFile(call, fileName, base64);
    }

    private void writeLegacyFile(PluginCall call, String fileName, String base64) {
        try {
            File directory = new File(Environment.getExternalStorageDirectory(), "Noma");
            if (!directory.exists() && !directory.mkdirs()) {
                call.reject("Noma could not create its backup folder.", "FOLDER_FAILED");
                return;
            }

            File target = new File(directory, fileName);
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            try (FileOutputStream output = new FileOutputStream(target, false)) {
                output.write(bytes);
                output.flush();
            }

            JSObject result = new JSObject();
            result.put("path", "Internal storage/Noma/" + fileName);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not save the backup: " + e.getMessage(), "WRITE_FAILED");
        }
    }

    private Uri getSavedTreeUri() {
        String value = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(TREE_URI, null);
        return value == null ? null : Uri.parse(value);
    }

    private void saveTreeUri(Uri uri) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(TREE_URI, uri.toString()).apply();
    }

    private void clearSavedTreeUri() {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().remove(TREE_URI).apply();
    }
}
