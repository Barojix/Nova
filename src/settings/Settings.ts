export type Quality = 'low' | 'medium' | 'high';

export interface SettingsData {
  quality: Quality;
  fpsTarget: 30 | 60 | 90 | 120;
  master: number; // 0..1
  music: number;
  sfx: number;
  sensitivity: number; // 0.5..2
  joystickSize: number; // 0.8..1.4
  autoAim: boolean;
  vibration: boolean;
  showPerf: boolean;
}

const KEY = 'nova-arena-settings-v1';

const DEFAULTS: SettingsData = {
  quality: 'medium',
  fpsTarget: 120,
  master: 0.7,
  music: 0.7,
  sfx: 0.8,
  sensitivity: 1,
  joystickSize: 1,
  autoAim: true,
  vibration: true,
  showPerf: true,
};

export class Settings {
  data: SettingsData = { ...DEFAULTS };
  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch { /* ignore */ }
  }
  get renderScale() {
    return this.data.quality === 'low' ? 0.7 : this.data.quality === 'medium' ? 0.9 : 1;
  }
  get shadows() {
    return this.data.quality === 'high';
  }
  get particleMul() {
    return this.data.quality === 'low' ? 0.4 : this.data.quality === 'medium' ? 0.75 : 1;
  }
}

export const settings = new Settings();
