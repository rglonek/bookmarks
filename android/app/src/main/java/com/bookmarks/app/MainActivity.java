package com.bookmarks.app;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Text shared from another app through the Android share sheet opens the
    // app's "Save Shared Link" dialog. The web app reads ?text=&title= the same
    // way the PWA share target does (see parseSharedLink in src/url.ts).
    // Capacitor calls this for the launch intent as well as for later ones.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (bridge == null || intent == null) return;

        String type = intent.getType();
        if (!Intent.ACTION_SEND.equals(intent.getAction()) || type == null || !type.startsWith("text/")) return;

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) return;
        String title = intent.getStringExtra(Intent.EXTRA_SUBJECT);

        Uri.Builder url = Uri.parse(bridge.getLocalUrl()).buildUpon().path("/").appendQueryParameter("text", text);
        if (title != null && !title.trim().isEmpty()) {
            url.appendQueryParameter("title", title);
        }
        String target = url.build().toString();
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(target));

        // Handled: don't open the same share again if the activity is recreated
        setIntent(new Intent(Intent.ACTION_MAIN));
    }
}
