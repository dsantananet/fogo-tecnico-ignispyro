package pt.ignispyro.fogotecnico;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.os.Bundle;
import android.util.Base64;
import java.io.IOException;
import java.io.OutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle state) {
        registerPlugin(DocumentFiles.class);
        registerPlugin(ReleaseUpdates.class);
        registerPlugin(DriveAuthorization.class);
        super.onCreate(state);
    }

    @CapacitorPlugin(name = "DocumentFiles")
    public static class DocumentFiles extends Plugin {
        private WebView printView;

        @PluginMethod
        public void save(PluginCall call) {
            Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType(call.getString("mime", "application/octet-stream"));
            picker.putExtra(Intent.EXTRA_TITLE, call.getString("name", "registo"));
            startActivityForResult(call, picker, "writeDocument");
        }

        @ActivityCallback
        private void writeDocument(PluginCall call, ActivityResult result) {
            if (call == null) return;
            Intent data = result.getData();
            if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
                call.reject("Gravação cancelada");
                return;
            }

            try (OutputStream stream = getContext().getContentResolver().openOutputStream(data.getData())) {
                if (stream == null) throw new IOException("Destino indisponível");
                stream.write(Base64.decode(call.getString("base64", ""), Base64.DEFAULT));
            } catch (IOException | IllegalArgumentException | SecurityException error) {
                call.reject("Não foi possível gravar o ficheiro", error);
                return;
            }
            call.resolve();
        }

        @PluginMethod
        public void openHistory(PluginCall call) {
            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("*/*");
            startActivityForResult(call, picker, "readHistory");
        }

        @ActivityCallback
        private void readHistory(PluginCall call, ActivityResult result) {
            if (call == null) return;
            Intent data = result.getData();
            if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
                call.resolve();
                return;
            }

            try (InputStream stream = getContext().getContentResolver().openInputStream(data.getData());
                 ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                if (stream == null) throw new IOException("Ficheiro indisponível");
                byte[] buffer = new byte[16384];
                int length;
                while ((length = stream.read(buffer)) != -1) {
                    if (bytes.size() + length > 32 * 1024 * 1024) {
                        call.reject("A cópia excede 32 MB. Usa uma cópia menor.");
                        return;
                    }
                    bytes.write(buffer, 0, length);
                }
                JSObject response = new JSObject();
                response.put("text", new String(bytes.toByteArray(), StandardCharsets.UTF_8));
                call.resolve(response);
            } catch (IOException | SecurityException error) {
                call.reject("Não foi possível abrir a cópia.", error);
            }
        }

        @PluginMethod
        public void print(PluginCall call) {
            getActivity().runOnUiThread(() -> {
                printView = new WebView(getActivity());
                printView.getSettings().setBlockNetworkLoads(true);
                printView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        manager.print("POQ – Fogo Técnico", view.createPrintDocumentAdapter("POQ"), null);
                        call.resolve();
                    }
                });
                printView.loadDataWithBaseURL(null, call.getString("html", ""), "text/html", "UTF-8", null);
            });
        }
    }
}
