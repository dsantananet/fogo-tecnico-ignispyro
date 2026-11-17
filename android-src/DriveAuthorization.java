package pt.ignispyro.fogotecnico;

import android.accounts.Account;
import android.app.Activity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;

@CapacitorPlugin(name = "DriveAuthorization")
public class DriveAuthorization extends Plugin {
    private static final String SCOPE = "https://www.googleapis.com/auth/drive.appdata";
    private PluginCall pending;
    private ActivityResultLauncher<IntentSenderRequest> consent;

    @Override
    public void load() {
        consent = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(), result -> {
                PluginCall call = pending;
                pending = null;
                if (call == null) return;
                if (result.getData() == null) {
                    call.reject("Autorização do Google cancelada.", "CONSENT_REQUIRED");
                    return;
                }
                try {
                    AuthorizationResult authorization = Identity.getAuthorizationClient(getActivity())
                        .getAuthorizationResultFromIntent(result.getData());
                    if (result.getResultCode() != Activity.RESULT_OK) {
                        call.reject("Autorização do Google cancelada.", "CONSENT_REQUIRED");
                        return;
                    }
                    resolve(call, authorization);
                } catch (ApiException error) {
                    call.reject("O Google recusou a autorização (" + error.getStatusCode() + ").");
                }
            });
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pending != null) {
                call.reject("Já existe um pedido ao Google.");
                return;
            }
            var request = AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(SCOPE)));
            String email = call.getString("email", "").trim();
            if (!email.isEmpty()) request.setAccount(new Account(email, "com.google"));
            pending = call;
            Identity.getAuthorizationClient(getActivity()).authorize(request.build())
                .addOnSuccessListener(result -> {
                    if (!result.hasResolution()) {
                        pending = null;
                        resolve(call, result);
                    } else if (Boolean.TRUE.equals(call.getBoolean("interactive", false))
                            && result.getPendingIntent() != null) {
                        try {
                            consent.launch(new IntentSenderRequest.Builder(result.getPendingIntent()).build());
                        } catch (IllegalStateException error) {
                            pending = null;
                            call.reject("Volta a abrir a aplicação e tenta ligar ao Google Drive.");
                        }
                    } else {
                        pending = null;
                        call.reject("É preciso autorizar o Google Drive.", "CONSENT_REQUIRED");
                    }
                })
                .addOnFailureListener(error -> {
                    pending = null;
                    String code = error instanceof ApiException api ? " (" + api.getStatusCode() + ")" : "";
                    call.reject("O Google Drive não devolveu autorização" + code + ".");
                });
        });
    }

    private void resolve(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            call.reject("A autorização não inclui acesso ao Drive.", "CONSENT_REQUIRED");
            return;
        }
        JSObject response = new JSObject();
        response.put("accessToken", token);
        call.resolve(response);
    }
}
