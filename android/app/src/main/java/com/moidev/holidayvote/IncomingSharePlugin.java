package com.moidev.holidayvote;

import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.UUID;
import org.json.JSONException;

@CapacitorPlugin(name = "IncomingShare")
public class IncomingSharePlugin extends Plugin {
    private SharedPreferences inbox() {
        return getContext().getSharedPreferences("incoming_houses", 0);
    }

    @Override
    public void load() {
        capture(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        capture(intent);
    }

    private void capture(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        if (intent.getType() == null || !intent.getType().startsWith("text/")) return;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text == null) return;
        String id = System.currentTimeMillis() + "-" + UUID.randomUUID();
        JSObject share = new JSObject();
        share.put("id", id);
        share.put("text", text.toString());
        String title = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (title != null && !title.equals(text.toString())) share.put("title", title);
        if (!inbox().edit().putString(id, share.toString()).commit()) {
            Log.e("IncomingShare", "Could not persist shared holiday home");
            android.widget.Toast.makeText(getContext(), R.string.share_save_error, android.widget.Toast.LENGTH_LONG).show();
            return;
        }
        // The persisted entry, not the Activity intent, owns the share after capture.
        intent.removeExtra(Intent.EXTRA_TEXT);
        notifyListeners("shareReceived", new JSObject(), true);
    }

    @PluginMethod
    public void pending(PluginCall call) {
        try {
            ArrayList<String> ids = new ArrayList<>(inbox().getAll().keySet());
            ids.sort(Comparator.naturalOrder());
            JSArray shares = new JSArray();
            for (String id : ids) shares.put(new JSObject(inbox().getString(id, "")));
            JSObject result = new JSObject();
            result.put("shares", shares);
            call.resolve(result);
        } catch (JSONException error) {
            call.reject("Could not read shared holiday homes", error);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("Missing share id");
        } else if (!inbox().edit().remove(id).commit()) {
            call.reject("Could not remove shared holiday home");
        } else {
            call.resolve();
        }
    }
}
