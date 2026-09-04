package com.novaarena.game;

import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;
import com.novaarena.game.updater.AppUpdaterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        hideSystemUI();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUI();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    /** Fullscreen imersiv: fără bară de navigare/stare peste joc (revine la swipe). */
    private void hideSystemUI() {
        try {
            View decor = getWindow().getDecorView();
            int flags = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN;
            decor.setSystemUiVisibility(flags);
        } catch (Exception ignored) {}
    }
}
