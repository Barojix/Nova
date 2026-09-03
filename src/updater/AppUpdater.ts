import { registerPlugin, Capacitor } from '@capacitor/core';

// Bridge către pluginul nativ AppUpdater (Android: DownloadManager + instalare).
// Pe web/desktop lipsește — Updater folosește fallback (deschide Release-ul).
export interface AppUpdaterPlugin {
  getVersion(): Promise<{ version: string; build: number }>;
  downloadAndInstall(opts: { url: string; title?: string }): Promise<{ started: boolean }>;
}

const stub: AppUpdaterPlugin = {
  getVersion: () => Promise.reject(new Error('native indisponibil')),
  downloadAndInstall: () => Promise.reject(new Error('native indisponibil')),
};

export const AppUpdater: AppUpdaterPlugin =
  Capacitor.isNativePlatform()
    ? registerPlugin<AppUpdaterPlugin>('AppUpdater')
    : stub;
