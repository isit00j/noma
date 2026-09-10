package app.noma.notes;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;

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
 * This obtains a real OAuth 2.0 access token (ya29...) for Google Drive API requests
 * without opening an external browser / WebView origin_mismatch flow.
 */
@CapacitorPlugin(name = "GoogleDriveAuth")
public class GoogleDriveAuthPlugin extends Plugin {

    private static final String DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

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
                            saveCall(call);
                            activity.startIntentSenderForResult(
                                result.getPendingIntent().getIntentSender(),
                                9823,
                                null,
                                0,
                                0,
                                0
                            );
                        } catch (IntentSender.SendIntentException e) {
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
            call.reject("Google Drive authorization failed: " + e.getMessage(), "UNEXPECTED_ERROR");
        }
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);

        if (requestCode != 9823) {
            return;
        }

        PluginCall call = getSavedCall();
        if (call == null) {
            return;
        }

        if (resultCode == Activity.RESULT_CANCELED) {
            call.reject("Authorization was cancelled or denied. Google Drive is still not connected.", "USER_CANCELLED");
            return;
        }

        try {
            AuthorizationResult authResult = Identity.getAuthorizationClient(getActivity())
                .getAuthorizationResultFromIntent(data);

            String accessToken = authResult.getAccessToken();
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
