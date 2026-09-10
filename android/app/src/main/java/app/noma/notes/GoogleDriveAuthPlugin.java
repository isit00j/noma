package app.noma.notes;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Scope;

import java.util.Collections;

/**
 * Native Capacitor Plugin for Google Drive Authorization using Google Identity Services
 * AuthorizationClient (Play Services Auth).
 *
 * Obtains a real OAuth 2.0 access token (ya29...) for Google Drive API requests
 * using Capacitor 7's ActivityResultLauncher and StartIntentSenderForResult contract.
 */
@CapacitorPlugin(name = "GoogleDriveAuth")
public class GoogleDriveAuthPlugin extends Plugin {

    private static final String DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
    private ActivityResultLauncher<IntentSenderRequest> intentSenderLauncher;
    private PluginCall activeCall;

    @Override
    public void load() {
        super.load();
        intentSenderLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::handleActivityResult
        );
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is null", "NO_ACTIVITY");
            return;
        }

        try {
            AuthorizationClient client = Identity.getAuthorizationClient(activity);
            AuthorizationRequest request = AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_FILE_SCOPE)))
                .build();

            client.authorize(request)
                .addOnSuccessListener(result -> {
                    if (result.hasResolution()) {
                        try {
                            activeCall = call;
                            IntentSender intentSender = result.getPendingIntent().getIntentSender();
                            IntentSenderRequest requestLauncher = new IntentSenderRequest.Builder(intentSender).build();
                            intentSenderLauncher.launch(requestLauncher);
                        } catch (Exception e) {
                            activeCall = null;
                            call.reject("Failed to launch Google authorization dialog: " + e.getMessage(), "INTENT_FAILED");
                        }
                    } else {
                        String accessToken = result.getAccessToken();
                        if (accessToken != null && !accessToken.isEmpty()) {
                            com.getcapacitor.JSObject res = new com.getcapacitor.JSObject();
                            res.put("accessToken", accessToken);
                            call.resolve(res);
                        } else {
                            call.reject("No access token returned from Google Drive authorization", "NO_TOKEN");
                        }
                    }
                })
                .addOnFailureListener(e -> {
                    activeCall = null;
                    if (e instanceof ApiException) {
                        ApiException apiException = (ApiException) e;
                        if (apiException.getStatusCode() == CommonStatusCodes.CANCELED) {
                            call.reject("Authorization was cancelled by the user.", "USER_CANCELLED");
                            return;
                        }
                    }
                    call.reject("Google Drive authorization failed: " + e.getMessage(), "AUTH_FAILED");
                });
        } catch (Exception e) {
            activeCall = null;
            call.reject("Google Drive authorization failed: " + e.getMessage(), "UNEXPECTED_ERROR");
        }
    }

    private void handleActivityResult(ActivityResult result) {
        PluginCall call = activeCall;
        activeCall = null;

        if (call == null) {
            return;
        }

        if (result == null || result.getResultCode() == Activity.RESULT_CANCELED) {
            call.reject("Authorization was cancelled or denied. Google Drive is still not connected.", "USER_CANCELLED");
            return;
        }

        try {
            Intent data = result.getData();
            if (data == null) {
                call.reject("Authorization result data was empty.", "NO_DATA");
                return;
            }

            AuthorizationResult authResult = Identity.getAuthorizationClient(getActivity())
                .getAuthorizationResultFromIntent(data);

            String accessToken = authResult != null ? authResult.getAccessToken() : null;
            if (accessToken != null && !accessToken.isEmpty()) {
                com.getcapacitor.JSObject res = new com.getcapacitor.JSObject();
                res.put("accessToken", accessToken);
                call.resolve(res);
            } else {
                call.reject("No access token returned after Google Drive authorization", "NO_TOKEN");
            }
        } catch (ApiException e) {
            if (e.getStatusCode() == CommonStatusCodes.CANCELED) {
                call.reject("Authorization was cancelled by the user.", "USER_CANCELLED");
            } else {
                call.reject("Google Drive authorization failed: " + e.getMessage(), "AUTH_FAILED");
            }
        } catch (Exception e) {
            call.reject("Google Drive authorization failed: " + e.getMessage(), "UNEXPECTED_ERROR");
        }
    }
}
