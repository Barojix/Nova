// Sunete 100% originale, sintetizate procedural cu WebAudio — zero asset-uri copiate.
import { settings } from '../settings/Settings';

type SfxName =
  | 'ui' | 'shoot' | 'super' | 'hit' | 'ko' | 'hurt'
  | 'coin' | 'win' | 'lose' | 'click' | 'spawn' | 'heal' | 'countdown'
  | 'crate' | 'powerup' | 'gas' | 'upgrade' | 'select' | 'denied' | 'ammo' | 'boom';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;

  private ensure(): AudioContext | null {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  unlock() {
    this.ensure();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    const v = vol * settings.data.master * settings.data.sfx;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  sfx(name: SfxName) {
    if (settings.data.master <= 0.01) return;
    switch (name) {
      case 'ui': case 'click': this.tone(660, 0.08, 'sine', 0.25, 120); break;
      case 'shoot': this.tone(520 + Math.random() * 120, 0.12, 'square', 0.12, -260); break;
      case 'super': this.tone(180, 0.5, 'sawtooth', 0.22, 620); this.tone(90, 0.5, 'square', 0.14, 300, 0.05); break;
      case 'hit': this.tone(220, 0.09, 'triangle', 0.22, -80); break;
      case 'hurt': this.tone(160, 0.18, 'sawtooth', 0.2, -60); break;
      case 'ko': this.tone(400, 0.35, 'square', 0.2, -320); this.tone(800, 0.25, 'sine', 0.15, -500, 0.08); break;
      case 'coin': this.tone(880, 0.1, 'sine', 0.2, 440); this.tone(1320, 0.14, 'sine', 0.16, 0, 0.07); break;
      case 'spawn': this.tone(300, 0.25, 'sine', 0.2, 300); break;
      case 'heal': this.tone(500, 0.3, 'sine', 0.16, 250); break;
      case 'countdown': this.tone(440, 0.12, 'square', 0.18); break;
      case 'crate': this.tone(180, 0.12, 'square', 0.2, -60); this.tone(120, 0.16, 'triangle', 0.2, -40, 0.06); break;
      case 'powerup': [660, 880, 1320].forEach((f, i) => this.tone(f, 0.14, 'sine', 0.2, 0, i * 0.06)); break;
      case 'gas': this.tone(140, 0.5, 'sawtooth', 0.12, -40); break;
      case 'upgrade': [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, 'square', 0.18, 0, i * 0.07)); break;
      case 'select': this.tone(740, 0.1, 'triangle', 0.22, 220); break;
      case 'denied': this.tone(220, 0.15, 'sawtooth', 0.16, -80); break;
      case 'ammo': this.tone(980, 0.06, 'sine', 0.14, 200); break;
      case 'boom': this.tone(90, 0.5, 'sawtooth', 0.26, -50); this.tone(55, 0.6, 'sine', 0.24, -20, 0.03); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, 0, i * 0.13)); break;
      case 'lose': [400, 340, 280, 200].forEach((f, i) => this.tone(f, 0.25, 'sawtooth', 0.15, -40, i * 0.15)); break;
    }
  }

  startMusic(battle: boolean) {
    this.stopMusic();
    if (settings.data.music <= 0.01) return;
    // loop arpeggio simplu, diferit meniu vs luptă
    const base = battle ? [110, 130.8, 164.8, 196] : [220, 261.6, 329.6, 392];
    this.musicStep = 0;
    const tick = () => {
      if (settings.data.music <= 0.01 || settings.data.master <= 0.01) return;
      const ctx = this.ensure();
      if (!ctx) return;
      const f = base[this.musicStep % base.length] * (this.musicStep % 8 >= 4 ? 1.5 : 1);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const v = 0.05 * settings.data.master * settings.data.music;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(v, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.45);
      this.musicStep++;
    };
    tick();
    this.musicTimer = window.setInterval(tick, battle ? 300 : 520);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const audio = new AudioEngine();
