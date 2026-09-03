import { Capacitor } from '@capacitor/core';
import { APP_VERSION, compareVersions } from '../core/Version';
import { GITHUB_REPO, isUpdaterConfigured } from './repo';
import { AppUpdater } from './AppUpdater';

export interface UpdateInfo {
  version: string;
  notes: string;
  apkUrl: string;
  pageUrl: string;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface ReleaseJson {
  tag_name: string;
  body: string;
  html_url: string;
  assets: ReleaseAsset[];
}

/** Verifică ultimul Release GitHub. Aruncă eroare cu mesaj prietenos la eșec. */
export async function checkForUpdate(): Promise<{ update: boolean; info: UpdateInfo | null }> {
  if (!isUpdaterConfigured()) {
    throw new Error('Actualizările se activează după conectarea repo-ului GitHub.');
  }
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) {
    throw new Error('Niciun release publicat încă — revino mai târziu.');
  }
  if (!res.ok) {
    throw new Error(`GitHub a răspuns ${res.status} — încearcă mai târziu.`);
  }
  const rel = (await res.json()) as ReleaseJson;
  const apk = rel.assets.find((a) => a.name.endsWith('.apk'));
  if (compareVersions(rel.tag_name, APP_VERSION) <= 0 || !apk) {
    return { update: false, info: null };
  }
  return {
    update: true,
    info: {
      version: rel.tag_name,
      notes: (rel.body || 'Îmbunătățiri și reparări.').slice(0, 600),
      apkUrl: apk.browser_download_url,
      pageUrl: rel.html_url,
    },
  };
}

/** Instalează: nativ (DownloadManager + prompt instalare) sau fallback browser. */
export async function installUpdate(info: UpdateInfo): Promise<'native' | 'browser'> {
  if (Capacitor.isNativePlatform()) {
    try {
      await AppUpdater.downloadAndInstall({ url: info.apkUrl, title: 'Starforge' });
      return 'native';
    } catch {
      // cade pe deschiderea în browser
    }
  }
  window.open(info.apkUrl, '_blank', 'noopener');
  return 'browser';
}
