package com.novaarena.game.updater;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * AppUpdater — sistem propriu de actualizări OTA (fără servicii terțe).
 * Descarcă APK-ul din GitHub Releases via DownloadManager și lansează
 * instalarea prin FileProvider. Semnătura debug e stabilă (debug.keystore
 * comis în repo), deci update-urile se instalează peste versiunea veche.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String FILE_NAME = "nova-arena-update.apk";
    private long downloadId = -1;
    private BroadcastReceiver receiver = null;

    @Override
    public void load() {
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id == downloadId) {
                    downloadId = -1;
                    launchInstall();
                }
            }
        };
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 33) {
            ctx.registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_NOT_EXPORTED);
        } else {
            ctx.registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (receiver != null) {
                getContext().unregisterReceiver(receiver);
                receiver = null;
            }
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageManager pm = ctx.getPackageManager();
            PackageInfo pi = pm.getPackageInfo(ctx.getPackageName(), 0);
            JSObject ret = new JSObject();
            ret.put("version", pi.versionName);
            if (Build.VERSION.SDK_INT >= 28) {
                ret.put("build", pi.getLongVersionCode());
            } else {
                ret.put("build", pi.versionCode);
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("nu pot citi versiunea", e);
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("lipsește url-ul APK-ului");
            return;
        }
        try {
            Context ctx = getContext();
            File out = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), FILE_NAME);
            if (out.exists()) {
                //noinspection ResultOfMethodCallIgnored
                out.delete();
            }
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle("Nova Arena — se descarcă actualizarea");
            req.setDescription("Nova Arena " + url.substring(url.lastIndexOf('/') + 1));
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationUri(Uri.fromFile(out));
            req.setMimeType("application/vnd.android.package-archive");
            req.setAllowedOverMetered(true);
            DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            downloadId = dm.enqueue(req);
            // Dacă fișierul e deja în cache complet (retry rapid), instalează direct.
            if (queryComplete(dm, downloadId)) {
                launchInstall();
            }
            JSObject ret = new JSObject();
            ret.put("started", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("descărcarea a eșuat", e);
        }
    }

    private boolean queryComplete(DownloadManager dm, long id) {
        Cursor c = null;
        try {
            DownloadManager.Query q = new DownloadManager.Query().setFilterById(id);
            c = dm.query(q);
            if (c != null && c.moveToFirst()) {
                int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                return status == DownloadManager.STATUS_SUCCESSFUL;
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.close();
        }
        return false;
    }

    private void launchInstall() {
        try {
            Context ctx = getContext();
            File apk = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), FILE_NAME);
            if (!apk.exists()) return;
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            ctx.startActivity(intent);
        } catch (Exception e) {
            openUnknownSources();
        }
    }

    private void openUnknownSources() {
        try {
            Context ctx = getContext();
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + ctx.getPackageName()));
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
        } catch (Exception ignored) {}
    }
}
