package com.novaarena.game;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.novaarena.game.updater.AppUpdaterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
