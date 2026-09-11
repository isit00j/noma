package app.noma.notes;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.UUID;

@CapacitorPlugin(
    name = "NomaBackup",
    permissions = {
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class NomaBackupPlugin extends Plugin {

    private static final String PREFS_NAME = "NomaBackupPrefs";
    private static final String KEY_TREE_URI = "noma_tree_uri";

    private ActivityResultLauncher<Intent> treePickerLauncher;
    private PluginCall activePermissionCall;

    @Override
    public void load() {
        super.load();
        treePickerLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            this::handleTreePickerResult
        );
    }

    private boolean hasValidTreeUri() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uriStr = prefs.getString(KEY_TREE_URI, null);
        if (uriStr == null) return false;
        try {
            Uri uri = Uri.parse(uriStr);
            for (android.content.UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
                if (p.getUri().equals(uri) && p.isWritePermission()) {
                    DocumentFile file = DocumentFile.fromTreeUri(getContext(), uri);
                    if (file != null && file.exists() && file.canWrite()) {
                        return true;
                    }
                }
            }
        } catch (Exception e) {
            // Invalid URI or missing permission
        }
        return false;
    }

    @PluginMethod
    public void ensureStorageAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (hasValidTreeUri()) {
                JSObject res = new JSObject();
                res.put("granted", true);
                call.resolve(res);
                return;
            }

            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            intent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION |
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
                Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
            );
            activePermissionCall = call;
            try {
                treePickerLauncher.launch(intent);
            } catch (Exception e) {
                activePermissionCall = null;
                call.reject("Failed to launch storage picker: " + e.getMessage(), "INTENT_FAILED");
            }
        } else {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
                JSObject res = new JSObject();
                res.put("granted", true);
                call.resolve(res);
            } else {
                requestPermissionForAlias("storage", call, "storageCallback");
            }
        }
    }

    @PermissionCallback
    private void storageCallback(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
        } else {
            call.reject("Storage permission was denied.", "USER_CANCELLED");
        }
    }

    private void handleTreePickerResult(ActivityResult result) {
        PluginCall call = activePermissionCall;
        activePermissionCall = null;

        if (call == null) return;

        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Storage directory selection was cancelled.", "USER_CANCELLED");
            return;
        }

        Intent data = result.getData();
        Uri treeUri = data.getData();
        if (treeUri == null) {
            call.reject("No directory was selected.", "NO_DIRECTORY");
            return;
        }

        try {
            int takeFlags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (takeFlags == 0) {
                takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            }
            getContext().getContentResolver().takePersistableUriPermission(treeUri, takeFlags);

            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_TREE_URI, treeUri.toString()).apply();

            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Failed to persist storage permission: " + e.getMessage(), "PERM_FAILED");
        }
    }

    @PluginMethod
    public void startSaveSession(PluginCall call) {
        String sessionId = UUID.randomUUID().toString();
        File tempFile = new File(getContext().getCacheDir(), "noma_export_" + sessionId + ".tmp");
        try {
            if (tempFile.exists()) tempFile.delete();
            boolean created = tempFile.createNewFile();
            if (!created) {
                call.reject("Failed to create temporary export file.", "TEMP_FILE_FAILED");
                return;
            }
            JSObject res = new JSObject();
            res.put("sessionId", sessionId);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Error initializing export session: " + e.getMessage(), "TEMP_FILE_FAILED");
        }
    }

    @PluginMethod
    public void appendChunk(PluginCall call) {
        String sessionId = call.getString("sessionId");
        String chunkBase64 = call.getString("chunkBase64");

        if (sessionId == null || chunkBase64 == null) {
            call.reject("Invalid session or chunk data.", "INVALID_INPUT");
            return;
        }

        File tempFile = new File(getContext().getCacheDir(), "noma_export_" + sessionId + ".tmp");
        if (!tempFile.exists()) {
            call.reject("Export session not found or expired.", "SESSION_EXPIRED");
            return;
        }

        try {
            byte[] bytes = Base64.decode(chunkBase64, Base64.DEFAULT);
            try (FileOutputStream fos = new FileOutputStream(tempFile, true)) {
                fos.write(bytes);
            }
            JSObject res = new JSObject();
            res.put("success", true);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Failed to write backup chunk: " + e.getMessage(), "WRITE_FAILED");
        }
    }

    @PluginMethod
    public void finalizeSave(PluginCall call) {
        String sessionId = call.getString("sessionId");
        String fileName = call.getString("fileName");

        if (sessionId == null || fileName == null || fileName.trim().isEmpty()) {
            call.reject("Invalid session or file name.", "INVALID_INPUT");
            return;
        }

        File tempFile = new File(getContext().getCacheDir(), "noma_export_" + sessionId + ".tmp");
        if (!tempFile.exists()) {
            call.reject("Export session not found or expired.", "SESSION_EXPIRED");
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                String uriStr = prefs.getString(KEY_TREE_URI, null);
                if (uriStr == null) {
                    tempFile.delete();
                    call.reject("Storage permission was not established.", "PERM_MISSING");
                    return;
                }

                Uri uri = Uri.parse(uriStr);
                DocumentFile treeDir = DocumentFile.fromTreeUri(getContext(), uri);
                if (treeDir == null || !treeDir.exists()) {
                    tempFile.delete();
                    call.reject("Selected directory is no longer accessible.", "DIR_INACCESSIBLE");
                    return;
                }

                DocumentFile targetFolder = treeDir;
                String treeDirName = treeDir.getName();
                if (treeDirName == null || !"Noma".equalsIgnoreCase(treeDirName)) {
                    DocumentFile existingNoma = treeDir.findFile("Noma");
                    if (existingNoma != null && existingNoma.isDirectory()) {
                        targetFolder = existingNoma;
                    } else {
                        DocumentFile createdDir = treeDir.createDirectory("Noma");
                        if (createdDir != null) {
                            targetFolder = createdDir;
                        }
                    }
                }

                String baseName = fileName;
                String ext = "";
                int dotIdx = fileName.lastIndexOf('.');
                if (dotIdx > 0) {
                    baseName = fileName.substring(0, dotIdx);
                    ext = fileName.substring(dotIdx);
                }

                String finalFileName = fileName;
                int counter = 1;
                while (targetFolder.findFile(finalFileName) != null) {
                    finalFileName = baseName + " (" + counter + ")" + ext;
                    counter++;
                }

                DocumentFile newDoc = targetFolder.createFile("application/zip", finalFileName);
                if (newDoc == null) {
                    tempFile.delete();
                    call.reject("Failed to create backup file in destination folder.", "CREATE_FILE_FAILED");
                    return;
                }

                try (InputStream is = new FileInputStream(tempFile);
                     OutputStream os = getContext().getContentResolver().openOutputStream(newDoc.getUri())) {
                    if (os == null) {
                        tempFile.delete();
                        call.reject("Failed to open destination stream.", "STREAM_FAILED");
                        return;
                    }
                    byte[] buffer = new byte[16384];
                    int bytesRead;
                    while ((bytesRead = is.read(buffer)) != -1) {
                        os.write(buffer, 0, bytesRead);
                    }
                    os.flush();
                }

                tempFile.delete();

                String folderDisplayName = targetFolder.getName() != null ? targetFolder.getName() : "Noma";
                String displayPath = "Internal storage/" + folderDisplayName + "/" + finalFileName;

                JSObject res = new JSObject();
                res.put("saved", true);
                res.put("fileName", finalFileName);
                res.put("path", folderDisplayName + "/" + finalFileName);
                res.put("fullDisplayPath", displayPath);
                call.resolve(res);

            } else {
                File storageDir = Environment.getExternalStorageDirectory();
                File nomaDir = new File(storageDir, "Noma");
                if (!nomaDir.exists()) {
                    boolean created = nomaDir.mkdirs();
                    if (!created && !nomaDir.exists()) {
                        tempFile.delete();
                        call.reject("Failed to create Noma directory.", "DIR_CREATE_FAILED");
                        return;
                    }
                }

                String baseName = fileName;
                String ext = "";
                int dotIdx = fileName.lastIndexOf('.');
                if (dotIdx > 0) {
                    baseName = fileName.substring(0, dotIdx);
                    ext = fileName.substring(dotIdx);
                }

                String finalFileName = fileName;
                int counter = 1;
                File destFile = new File(nomaDir, finalFileName);
                while (destFile.exists()) {
                    finalFileName = baseName + " (" + counter + ")" + ext;
                    destFile = new File(nomaDir, finalFileName);
                    counter++;
                }

                try (InputStream is = new FileInputStream(tempFile);
                     OutputStream os = new FileOutputStream(destFile)) {
                    byte[] buffer = new byte[16384];
                    int bytesRead;
                    while ((bytesRead = is.read(buffer)) != -1) {
                        os.write(buffer, 0, bytesRead);
                    }
                    os.flush();
                }

                tempFile.delete();

                JSObject res = new JSObject();
                res.put("saved", true);
                res.put("fileName", finalFileName);
                res.put("path", "Noma/" + finalFileName);
                res.put("fullDisplayPath", "Internal storage/Noma/" + finalFileName);
                call.resolve(res);
            }
        } catch (Exception e) {
            tempFile.delete();
            call.reject("Export failed: " + e.getMessage(), "EXPORT_FAILED");
        }
    }

    @PluginMethod
    public void cancelSaveSession(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (sessionId != null) {
            File tempFile = new File(getContext().getCacheDir(), "noma_export_" + sessionId + ".tmp");
            if (tempFile.exists()) {
                tempFile.delete();
            }
        }
        JSObject res = new JSObject();
        res.put("cancelled", true);
        call.resolve(res);
    }
}
