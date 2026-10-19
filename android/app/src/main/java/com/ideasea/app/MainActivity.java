package com.ideasea.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
    private int keyboardHeight;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            int next = insets.isVisible(WindowInsetsCompat.Type.ime())
                ? insets.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0;
            if (next != keyboardHeight) {
                keyboardHeight = next;
                reportKeyboard();
            }
            // Keep the native render surface and CSS viewport at full height.
            // System bars/cutout still reach WebView as safe-area insets.
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .setVisible(WindowInsetsCompat.Type.ime(), false)
                .build();
        });
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                reportKeyboard();
            }
        });
        ViewCompat.requestApplyInsets(decor);
    }

    private void reportKeyboard() {
        float height = keyboardHeight / getResources().getDisplayMetrics().density;
        bridge.getWebView().evaluateJavascript(
            "window.__ideaSeaKeyboardHeight=" + height + ";" +
            "window.dispatchEvent(new Event('idea-sea-keyboard'));", null);
    }
}
