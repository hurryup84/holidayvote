package com.moidev.holidayvote;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IncomingSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
