package app.noma.notes;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

@CapacitorPlugin(name = "NomaBiometric")
public class NomaBiometricPlugin extends Plugin {

    @PluginMethod
    public void checkBiometricSupport(PluginCall call) {
        BiometricManager biometricManager = BiometricManager.from(getContext());
        int canAuthenticate = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);

        JSObject ret = new JSObject();

        switch (canAuthenticate) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                ret.put("available", true);
                ret.put("code", "SUCCESS");
                ret.put("message", "Biometric authentication is available.");
                break;
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                ret.put("available", false);
                ret.put("code", "NO_HARDWARE");
                ret.put("message", "No biometric hardware available on this device.");
                break;
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                ret.put("available", false);
                ret.put("code", "HARDWARE_UNAVAILABLE");
                ret.put("message", "Biometric hardware is currently unavailable.");
                break;
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                ret.put("available", false);
                ret.put("code", "NONE_ENROLLED");
                ret.put("message", "No biometrics enrolled on this device.");
                break;
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                ret.put("available", false);
                ret.put("code", "SECURITY_UPDATE_REQUIRED");
                ret.put("message", "A security update is required for biometric authentication.");
                break;
            default:
                ret.put("available", false);
                ret.put("code", "UNAVAILABLE");
                ret.put("message", "Biometric authentication is unavailable.");
                break;
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        String title = call.getString("title", "Unlock Noma");
        String subtitle = call.getString("subtitle", "Confirm your biometric to proceed");
        String cancelTitle = call.getString("cancelTitle", "Cancel");

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Executor executor = ContextCompat.getMainExecutor(getContext());
                    FragmentActivity activity = (FragmentActivity) getActivity();

                    BiometricPrompt biometricPrompt = new BiometricPrompt(activity, executor,
                            new BiometricPrompt.AuthenticationCallback() {
                                @Override
                                public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                                    super.onAuthenticationError(errorCode, errString);
                                    JSObject ret = new JSObject();
                                    ret.put("success", false);
                                    ret.put("errorCode", errorCode);
                                    ret.put("errorMessage", errString.toString());
                                    call.resolve(ret);
                                }

                                @Override
                                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                                    super.onAuthenticationSucceeded(result);
                                    JSObject ret = new JSObject();
                                    ret.put("success", true);
                                    call.resolve(ret);
                                }

                                @Override
                                public void onAuthenticationFailed() {
                                    super.onAuthenticationFailed();
                                    // Individual attempt failed (e.g. wrong finger), prompt remains visible.
                                }
                            });

                    BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                            .setTitle(title)
                            .setSubtitle(subtitle)
                            .setNegativeButtonText(cancelTitle)
                            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                            .build();

                    biometricPrompt.authenticate(promptInfo);
                } catch (Exception e) {
                    call.reject("Biometric authentication error: " + e.getMessage(), e);
                }
            }
        });
    }
}
