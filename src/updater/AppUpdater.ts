import { registerPlugin, Capacitor } from '@capacitor/core';

// Bridge către pluginul nativ AppUpdater (Android: DownloadManager + instalare).
// Pe web/desktop lipsește — Updater folosește fallback (deschide Release-ul).
export type DlState = 'idle' | 'downloading' | 'done' | 'failed';

export interface AppUpdaterPlugin {
  getVersion(): Promise<{ version: string; build: number }>;
  downloadAndInstall(opts: { url: string; title?: string }): Promise<{ started: boolean }>;
  /** Progresul descărcării curente (pentru ecranul de update forțat). */
  getProgress(): Promise<{ state: DlState; downloaded: number; total: number }>;
  /** Relansează intentul de instalare cu APK-ul deja descărcat. */
  openInstaller(): Promise<{ opened: boolean }>;
}

const stub: AppUpdaterPlugin = {
  getVersion: () => Promise.reject(new Error('native indisponibil')),
  downloadAndInstall: () => Promise.reject(new Error('native indisponibil')),
  getProgress: () => Promise.reject(new Error('native indisponibil')),
  openInstaller: () => Promise.reject(new Error('native indisponibil')),
};

export const AppUpdater: AppUpdaterPlugin =
  Capacitor.isNativePlatform()
    ? registerPlugin<AppUpdaterPlugin>('AppUpdater')
    : stub;
