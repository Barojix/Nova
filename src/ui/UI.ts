import { HEROES, RARITY_COLOR } from '../data/heroes';
import { MODES } from '../data/modes';
import { QUESTS } from '../data/economy';
import { save } from '../save/SaveSystem';
import { settings } from '../settings/Settings';
import { Shop } from '../shop/Shop';
import { Progression } from '../progression/Progression';
import { audio } from '../audio/Audio';
import { perf } from '../core/Perf';
import { APP_VERSION } from '../core/Version';
import { checkForUpdate, installUpdate, type UpdateInfo } from '../updater/Updater';
import type { GameManager, IGameUI } from '../game/GameManager';

const HERO_FACE: Record<string, string> = { volt: '⚡', moss: '🌱', blip: '💜' };

export class UI implements IGameUI {
  private game!: GameManager;
  private selectedMode = 'knockout';
  private playerName: string;
  private mmTimer: number | null = null;
  private perfTimer: number | null = null;

  constructor(private root: HTMLElement) {
    this.playerName =
      localStorage.getItem('nova-name') || `Erou#${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem('nova-name', this.playerName);
    this.renderMenu();
    Progression.claimDaily();
    this.loopPerf();
  }

  attach(game: GameManager) {
    this.game = game;
    // re-randăm ca să pornească vitrina 3D (necesită game atașat)
    this.renderMenu();
  }

  // ---------- MENIU ----------

  private renderMenu() {
    const d = save.data;
    const hero = HEROES.find((h) => h.id === d.selectedHero) ?? HEROES[0];
    const need = 100 + d.level * 60 - 60;
    this.root.innerHTML = `
    <div class="screen clear" id="scr-menu">
      <div class="pheader">
        <div class="avatar">🦊</div>
        <div class="pinfo">
          <div class="pname">${this.playerName}</div>
          <div class="plevel">Nv ${d.level} • 🏆 ${d.trophies}</div>
          <div class="xpbar"><div style="width:${Math.min(100, (d.xp / need) * 100)}%"></div></div>
        </div>
        <div class="cur">
          <div class="pill">🪙 ${d.coins}</div>
          <div class="pill">💎 ${d.gems}</div>
        </div>
      </div>
      <div class="hero-stage">
        <div class="hero-orb" style="border-color:${RARITY_COLOR[hero.rarity]}">${HERO_FACE[hero.id] ?? '🦸'}</div>
        <div class="hero-name">${hero.name}</div>
        <div class="hero-title">${hero.title}</div>
        <div class="hero-tags">
          <span class="tag" style="color:${RARITY_COLOR[hero.rarity]}">${hero.rarity.toUpperCase()}</span>
          <span class="tag">❤️ ${hero.hp}</span>
          <span class="tag">⚔️ ${hero.damage}</span>
          <span class="tag trofeu">🏆 ${d.trophies}</span>
        </div>
      </div>
      <div class="modes">${MODES.map((m) => `
        <div class="mode-card ${m.id === this.selectedMode ? 'sel' : ''}" data-mode="${m.id}">
          <div class="ic">${m.icon}</div><div class="nm">${m.name}</div><div class="ds">${m.players} • ${m.target}</div>
        </div>`).join('')}</div>
      <div class="play-row">
        <button class="btn-play" id="btn-play">JOACĂ</button>
        <div class="online-row"><span class="dot off" id="net-dot"></span><span id="net-txt">Offline — boți • serverul pornește separat</span></div>
      </div>
      <div class="navbar">
        <button class="navbtn" data-nav="brawlers">🦸<br>Eroi</button>
        <button class="navbtn" data-nav="shop">🛒<br>Shop</button>
        <button class="navbtn" data-nav="quests">📜<br>Misiuni</button>
        <button class="navbtn" data-nav="settings">⚙️<br>Setări</button>
      </div>
    </div>
    <div id="hud">
      <div class="hud-top">
        <div class="scorebox"><small id="hud-mode">KNOCKOUT</small><span id="hud-score">0 : 0</span></div>
        <div class="hpwrap">
          <div class="hpbar" id="hud-hpbar"><div id="hud-hpfill"></div></div>
          <div class="hptext" id="hud-hptext">3400</div>
          <div class="superbar" id="hud-superbar"><div id="hud-superfill"></div></div>
        </div>
        <button class="pausebtn" id="btn-pause">⏸</button>
      </div>
      <div id="killfeed"></div>
      <div id="countdown"></div>
      <div id="respawn"></div>
      <div id="banner"></div>
    </div>
    <div id="toast"></div>
    <div id="perf"></div>`;
    this.root.querySelectorAll('[data-mode]').forEach((el) => {
      el.addEventListener('click', () => {
        audio.sfx('click');
        this.selectedMode = (el as HTMLElement).dataset.mode!;
        this.renderMenu();
      });
    });
    this.root.querySelector('#btn-play')?.addEventListener('click', () => this.startMatchmaking());
    this.root.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => {
        audio.sfx('ui');
        this.openPage((el as HTMLElement).dataset.nav!);
      });
    });
    this.root.querySelector('#btn-pause')?.addEventListener('click', () => this.openPause());
    this.probeServer();
    // vitrină 3D cu eroul selectat (doar după attach)
    try {
      (this as unknown as { game?: { showShowcase?: (h: string) => void } }).game?.showShowcase?.(save.data.selectedHero);
    } catch { /* meniul funcționează și fără 3D */ }
    void this.autoCheckUpdate();
  }

  private updateChecked = false;

  /** Verificare silențioasă o dată pe sesiune — anunță doar dacă există update. */
  private async autoCheckUpdate() {
    if (this.updateChecked) return;
    this.updateChecked = true;
    try {
      const { update, info } = await checkForUpdate();
      if (update && info) {
        this.toast(`⬇️ Update disponibil: ${info.version} (Setări → Verifică actualizări)`);
      }
    } catch { /* silențios — butonul din Setări arată eroarea */ }
  }

  private probeServer() {
    // verificare rapidă dacă serverul e sus (pentru eticheta online)
    const dot = this.root.querySelector('#net-dot');
    const txt = this.root.querySelector('#net-txt');
    if (!dot || !txt) return;
    try {
      const ws = new WebSocket(
        (import.meta.env.VITE_NOVA_SERVER as string | undefined) || 'ws://localhost:2567'
      );
      const to = window.setTimeout(() => {
        try { ws.close(); } catch { /* noop */ }
      }, 2500);
      ws.onopen = () => {
        dot.classList.remove('off');
        txt.textContent = 'Server ONLINE — meciuri reale multiplayer';
        window.clearTimeout(to);
        try { ws.close(); } catch { /* noop */ }
      };
      ws.onerror = () => window.clearTimeout(to);
    } catch { /* offline */ }
  }

  // ---------- MATCHMAKING ----------

  private startMatchmaking() {
    audio.sfx('ui');
    const mode = MODES.find((m) => m.id === this.selectedMode)!;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'mm-ov';
    ov.innerHTML = `
      <div class="mm-box">
        <div class="spinner">🌀</div>
        <h2>CAUT MECI…</h2>
        <div class="mm-tips" id="mm-tip">${mode.icon} ${mode.name} • ${mode.desc}</div>
        <div class="mm-tips">Camera ${Math.floor(Math.random() * 9000 + 1000)} • Jucători 1/6…</div>
        <button class="mbtn ghost" id="mm-cancel">Anulează</button>
      </div>`;
    this.root.appendChild(ov);
    let n = 1;
    const tips = [
      '💡 Folosește tufișurile ca să te ascunzi!',
      '💡 Super-ul se încarcă lovind inamicii!',
      '💡 În Star Rush, la moarte scapi stelele!',
      '💡 Boții fug când au HP mic — urmărește-i!',
    ];
    let ti = 0;
    this.mmTimer = window.setInterval(() => {
      n++;
      const el = ov.querySelectorAll('.mm-tips')[1];
      if (el) el.textContent = `Camera ${Math.floor(Math.random() * 9000 + 1000)} • Jucători ${Math.min(6, n)}/6…`;
      if (n % 2 === 0) {
        const tip = ov.querySelector('#mm-tip');
        if (tip) tip.textContent = tips[ti++ % tips.length];
      }
      if (n >= 4) {
        this.cancelMatchmaking();
        this.beginMatch();
      }
    }, 600);
    ov.querySelector('#mm-cancel')?.addEventListener('click', () => {
      audio.sfx('click');
      this.cancelMatchmaking();
    });
  }

  private cancelMatchmaking() {
    if (this.mmTimer !== null) {
      clearInterval(this.mmTimer);
      this.mmTimer = null;
    }
    this.root.querySelector('#mm-ov')?.remove();
  }

  private beginMatch() {
    if (!this.game) {
      this.toast('3D indisponibil pe acest dispozitiv/browser.');
      this.root.querySelector('#scr-menu')?.classList.remove('hidden');
      return;
    }
    this.root.querySelector('#scr-menu')?.classList.add('hidden');
    // online dacă serverul răspunde — GameManager face fallback automat la boți
    this.game?.startMatch(this.selectedMode, save.data.selectedHero, this.playerName, true);
  }

  // ---------- PAGINI ----------

  private openPage(which: string) {
    const d = save.data;
    const page = document.createElement('div');
    page.className = 'page';
    let body = '';
    let title = '';
    if (which === 'brawlers') {
      title = '🦸 EROI';
      body = HEROES.map((h) => {
        const sel = d.selectedHero === h.id;
        return `<div class="bcard ${sel ? 'sel' : ''}">
          <div class="face" style="background:#${h.color.toString(16).padStart(6, '0')}33">${HERO_FACE[h.id]}</div>
          <div class="inf">
            <div class="nm">${h.name} <span class="tag" style="color:${RARITY_COLOR[h.rarity]}">${h.rarity}</span></div>
            <div class="tt">${h.title} — ${h.desc}</div>
            <div class="statgrid">
              <div>❤️<b>${h.hp}</b></div><div>⚔️<b>${h.damage}</b></div><div>🏃<b>${h.speed}</b></div>
            </div>
          </div>
          <button class="mbtn ${sel ? 'ghost' : 'green'}" data-hero="${h.id}" ${sel ? 'disabled' : ''}>${sel ? 'ALES' : 'JOACĂ'}</button>
        </div>`;
      }).join('');
    } else if (which === 'shop') {
      title = `🛒 SHOP <span style="font-size:13px">🪙 ${d.coins} • 💎 ${d.gems}</span>`;
      body = Shop.items().map((i) => {
        const owned = Shop.owned(i.id);
        return `<div class="bcard">
          <div class="face" style="background:#${(i.color ?? 0x2d7dff).toString(16).padStart(6, '0')}33">${i.kind === 'skin' ? '🎨' : i.kind === 'emote' ? '😎' : '🪙'}</div>
          <div class="inf"><div class="nm">${i.name}</div>
          <div class="tt">${i.tag ?? ''} ${i.heroId ? '• pentru ' + i.heroId.toUpperCase() : ''}</div></div>
          <button class="mbtn ${owned ? 'ghost' : 'gold'}" data-buy="${i.id}" ${owned ? 'disabled' : ''}>${owned ? 'DEȚINUT' : `${i.currency === 'coins' ? '🪙' : '💎'} ${i.price}`}</button>
        </div>`;
      }).join('');
    } else if (which === 'quests') {
      title = '📜 MISIUNI';
      body = QUESTS.map((q) => {
        const prog = Math.min(q.target, d.quests[q.id] ?? 0);
        const claimed = d.questsClaimed.includes(q.id);
        const done = prog >= q.target;
        return `<div class="bcard"><div class="inf">
          <div class="nm">${q.name}</div><div class="tt">${q.desc} — ${prog}/${q.target}</div>
          <div class="qbar"><div style="width:${(prog / q.target) * 100}%"></div></div>
          <div class="tt">🎁 🪙${q.rewardCoins} + ✨${q.rewardXp} XP</div></div>
          <button class="mbtn ${done && !claimed ? 'green' : 'ghost'}" data-quest="${q.id}" ${!done || claimed ? 'disabled' : ''}>${claimed ? 'LUAT' : done ? 'REVENDICĂ' : `${prog}/${q.target}`}</button>
        </div>`;
      }).join('') + `<div class="bcard"><div class="inf"><div class="nm">📊 Statistici</div><div class="tt">Victorii ${d.wins} • Eliminări ${d.kills} • Super-uri ${d.supers} • Stele ${d.stars}</div></div></div>`;
    } else {
      title = '⚙️ SETĂRI';
      const s = settings.data;
      body = `
        <div class="setrow"><label>Calitate grafică</label><div class="seg" id="seg-q">
          ${(['low', 'medium', 'high'] as const).map((q) => `<button data-q="${q}" class="${s.quality === q ? 'sel' : ''}">${q === 'low' ? 'Joasă' : q === 'medium' ? 'Medie' : 'Înaltă'}</button>`).join('')}
        </div></div>
        <div class="setrow"><label>FPS maxim</label><div class="seg" id="seg-fps">
          ${([30, 60, 120] as const).map((f) => `<button data-f="${f}" class="${s.fpsTarget === f ? 'sel' : ''}">${f}</button>`).join('')}
        </div></div>
        <div class="setrow"><label>Volum general <span id="v-master">${Math.round(s.master * 100)}%</span></label>
          <input type="range" id="r-master" min="0" max="100" value="${s.master * 100}"></div>
        <div class="setrow"><label>Muzică <span id="v-music">${Math.round(s.music * 100)}%</span></label>
          <input type="range" id="r-music" min="0" max="100" value="${s.music * 100}"></div>
        <div class="setrow"><label>Efecte <span id="v-sfx">${Math.round(s.sfx * 100)}%</span></label>
          <input type="range" id="r-sfx" min="0" max="100" value="${s.sfx * 100}"></div>
        <div class="setrow"><label>Sensibilitate țintire <span>${s.sensitivity.toFixed(1)}</span></label>
          <input type="range" id="r-sens" min="50" max="200" value="${s.sensitivity * 100}"></div>
        <div class="setrow"><label>Mărime joystick <span>${Math.round(s.joystickSize * 100)}%</span></label>
          <input type="range" id="r-joy" min="80" max="140" value="${s.joystickSize * 100}"></div>
        <div class="setrow togglerow">Auto-aim <div class="toggle ${s.autoAim ? 'on' : ''}" id="t-aim"></div></div>
        <div class="setrow togglerow">Vibrații <div class="toggle ${s.vibration ? 'on' : ''}" id="t-vib"></div></div>
        <div class="setrow togglerow">Afișează FPS/ping <div class="toggle ${s.showPerf ? 'on' : ''}" id="t-perf"></div></div>
        <div class="setrow"><button class="mbtn ghost" id="btn-name">✏️ Schimbă numele (${this.playerName})</button></div>
        <div class="setrow togglerow">Versiune <span style="color:var(--dim)">v${APP_VERSION}</span></div>
        <div class="setrow"><button class="mbtn green" id="btn-update" style="width:100%">⬇️ Verifică actualizări</button>
        <div class="tt" id="update-status" style="font-size:12px;color:var(--dim);margin-top:6px">Actualizări automate din GitHub Releases.</div></div>`;
    }
    page.innerHTML = `<div class="page-head"><h2>${title}</h2><button class="backbtn" id="pg-back">✕</button></div><div class="page-body">${body}</div>`;
    this.root.appendChild(page);
    page.querySelector('#pg-back')?.addEventListener('click', () => {
      audio.sfx('click');
      page.remove();
      this.renderMenu();
    });
    page.querySelectorAll('[data-hero]').forEach((b) => {
      b.addEventListener('click', () => {
        save.data.selectedHero = (b as HTMLElement).dataset.hero!;
        save.save();
        audio.sfx('click');
        page.remove();
        this.renderMenu();
      });
    });
    page.querySelectorAll('[data-buy]').forEach((b) => {
      b.addEventListener('click', () => {
        const r = Shop.buy((b as HTMLElement).dataset.buy!);
        audio.sfx(r.ok ? 'coin' : 'hurt');
        this.toast(r.msg);
        page.remove();
        this.openPage('shop');
      });
    });
    page.querySelectorAll('[data-quest]').forEach((b) => {
      b.addEventListener('click', () => {
        const ok = Progression.claimQuest((b as HTMLElement).dataset.quest!);
        audio.sfx(ok ? 'coin' : 'hurt');
        page.remove();
        this.openPage('quests');
      });
    });
    // setări bindings
    page.querySelectorAll('#seg-q button').forEach((b) => {
      b.addEventListener('click', () => {
        settings.data.quality = (b as HTMLElement).dataset.q as 'low' | 'medium' | 'high';
        settings.save();
        location.reload();
      });
    });
    page.querySelectorAll('#seg-fps button').forEach((b) => {
      b.addEventListener('click', () => {
        settings.data.fpsTarget = Number((b as HTMLElement).dataset.f) as 30 | 60 | 120;
        settings.save();
        page.querySelectorAll('#seg-fps button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
      });
    });
    const bindRange = (id: string, fn: (v: number) => void) => {
      page.querySelector(id)?.addEventListener('input', (e) => {
        fn(Number((e.target as HTMLInputElement).value));
        settings.save();
      });
    };
    bindRange('#r-master', (v) => {
      settings.data.master = v / 100;
      const el = page.querySelector('#v-master');
      if (el) el.textContent = `${v}%`;
    });
    bindRange('#r-music', (v) => {
      settings.data.music = v / 100;
      const el = page.querySelector('#v-music');
      if (el) el.textContent = `${v}%`;
    });
    bindRange('#r-sfx', (v) => {
      settings.data.sfx = v / 100;
      const el = page.querySelector('#v-sfx');
      if (el) el.textContent = `${v}%`;
    });
    bindRange('#r-sens', (v) => { settings.data.sensitivity = v / 100; });
    bindRange('#r-joy', (v) => { settings.data.joystickSize = v / 100; });
    const bindToggle = (id: string, fn: () => boolean) => {
      page.querySelector(id)?.addEventListener('click', (e) => {
        const on = fn();
        (e.target as HTMLElement).classList.toggle('on', on);
        settings.save();
      });
    };
    bindToggle('#t-aim', () => (settings.data.autoAim = !settings.data.autoAim));
    bindToggle('#t-vib', () => (settings.data.vibration = !settings.data.vibration));
    bindToggle('#t-perf', () => {
      settings.data.showPerf = !settings.data.showPerf;
      this.root.querySelector('#perf')?.classList.toggle('on', settings.data.showPerf);
      return settings.data.showPerf;
    });
    page.querySelector('#btn-name')?.addEventListener('click', () => {
      const v = prompt('Numele tău de luptător:', this.playerName);
      if (v && v.trim()) {
        this.playerName = v.trim().slice(0, 14);
        localStorage.setItem('nova-name', this.playerName);
        page.remove();
        this.renderMenu();
      }
    });
    page.querySelector('#btn-update')?.addEventListener('click', () => {
      void this.checkUpdateFlow(page);
    });
  }

  /** Flux update OTA: verificare → dialog cu changelog → descărcare/instalare. */
  private async checkUpdateFlow(page: HTMLElement) {
    const status = page.querySelector('#update-status');
    const btn = page.querySelector('#btn-update') as HTMLButtonElement | null;
    const say = (t: string) => {
      if (status) status.textContent = t;
    };
    if (btn) btn.disabled = true;
    say('⏳ Verific actualizări…');
    audio.sfx('click');
    try {
      const { update, info } = await checkForUpdate();
      if (!update || !info) {
        say(`✅ Ai ultima versiune (v${APP_VERSION}).`);
        audio.sfx('coin');
        return;
      }
      this.showUpdateDialog(info);
      say(`⬇️ Disponibilă v${info.version} — vezi dialogul.`);
    } catch (e) {
      say(`⚠️ ${(e as Error).message}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  private showUpdateDialog(info: UpdateInfo) {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    // escape minimal pentru changelog (text din release notes)
    const notes = info.notes
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\n/g, '<br>');
    ov.innerHTML = `<div class="end-box">
      <h1 class="win">⬇️ UPDATE v${info.version}</h1>
      <div style="color:var(--dim);font-size:13px;margin:8px 0;max-height:120px;overflow-y:auto">${notes}</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
        <button class="mbtn green" id="u-dl">Actualizează acum</button>
        <button class="mbtn ghost" id="u-later">Mai târziu</button>
      </div></div>`;
    this.root.appendChild(ov);
    ov.querySelector('#u-later')?.addEventListener('click', () => ov.remove());
    ov.querySelector('#u-dl')?.addEventListener('click', async () => {
      (ov.querySelector('#u-dl') as HTMLButtonElement).disabled = true;
      try {
        const how = await installUpdate(info);
        this.toast(
          how === 'native'
            ? '⬇️ Se descarcă… vei primi promptul de instalare.'
            : '🌐 Am deschis pagina release-ului în browser.'
        );
      } catch {
        this.toast('⚠️ Nu am putut porni descărcarea.');
      }
      ov.remove();
    });
  }

  private openPause() {
    audio.sfx('click');
    this.game?.setPaused(true);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="end-box"><h1>⏸ PAUZĂ</h1>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
      <button class="mbtn green" id="p-resume">Continuă</button>
      <button class="mbtn ghost" id="p-quit">Ieși din meci</button></div></div>`;
    this.root.appendChild(ov);
    ov.querySelector('#p-resume')?.addEventListener('click', () => {
      this.game?.setPaused(false);
      ov.remove();
    });
    ov.querySelector('#p-quit')?.addEventListener('click', () => {
      ov.remove();
      this.game?.stopToMenu();
      this.renderMenu();
    });
  }

  // ---------- IGameUI ----------

  showMatchUI(modeId: string) {
    this.root.querySelector('#scr-menu')?.classList.add('hidden');
    this.root.querySelector('#hud')?.classList.add('on');
    const m = MODES.find((x) => x.id === modeId);
    const el = this.root.querySelector('#hud-mode');
    if (el) el.textContent = m?.name ?? modeId;
    const kf = this.root.querySelector('#killfeed');
    if (kf) kf.innerHTML = '';
    const b = this.root.querySelector('#banner') as HTMLElement | null;
    if (b) b.style.display = 'none';
  }

  hideMatchUI() {
    this.root.querySelector('#hud')?.classList.remove('on');
    this.root.querySelector('#scr-menu')?.classList.remove('hidden');
  }

  updateHud(s: {
    hp: number; maxHp: number; superReady: boolean; superPct: number;
    scoreA: number; scoreB: number; time: number; stars: number;
    kills: number; alive: number; total: number; holdT: number; holding: boolean;
  }) {
    const fill = this.root.querySelector('#hud-hpfill') as HTMLElement | null;
    if (fill) fill.style.width = `${Math.max(0, (s.hp / s.maxHp) * 100)}%`;
    const bar = this.root.querySelector('#hud-hpbar');
    bar?.classList.toggle('low', s.hp / s.maxHp < 0.3);
    const txt = this.root.querySelector('#hud-hptext');
    if (txt) txt.textContent = `${Math.ceil(s.hp)} / ${s.maxHp}${s.superReady ? ' • SUPER GATA! 💥' : ''}`;
    const sf = this.root.querySelector('#hud-superfill') as HTMLElement | null;
    if (sf) sf.style.width = `${s.superPct * 100}%`;
    this.root.querySelector('#hud-superbar')?.classList.toggle('ready', s.superReady);
    const score = this.root.querySelector('#hud-score');
    if (score) {
      const mm = Math.floor(s.time / 60);
      const ss = Math.floor(s.time % 60).toString().padStart(2, '0');
      score.textContent = `${s.scoreA} : ${s.scoreB} • ${mm}:${ss}`;
    }
  }

  killfeed(text: string) {
    const kf = this.root.querySelector('#killfeed');
    if (!kf) return;
    const el = document.createElement('div');
    el.className = 'kf';
    el.textContent = text;
    kf.prepend(el);
    while (kf.children.length > 3) kf.lastChild?.remove();
    setTimeout(() => el.remove(), 4000);
  }

  countdown(text: string) {
    const el = this.root.querySelector('#countdown');
    if (el) el.textContent = text;
  }

  respawn(t: number) {
    const el = this.root.querySelector('#respawn') as HTMLElement | null;
    if (!el) return;
    if (t > 0) {
      el.style.display = 'block';
      el.textContent = `💀 Revii în ${Math.ceil(t)}…`;
    } else {
      el.style.display = 'none';
    }
  }

  banner(text: string, sub?: string) {
    const el = this.root.querySelector('#banner') as HTMLElement | null;
    if (!el) return;
    el.style.display = 'block';
    el.style.color = text === 'VICTORIE!' ? 'var(--lime)' : 'var(--red)';
    el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  }

  showEnd(o: {
    won: boolean; title: string; reason: string; kills: number;
    coins: number; xp: number; trophies: number; starPlayer: boolean;
  }) {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="end-box">
      <h1 class="${o.won ? 'win' : 'lose'}">${o.title}</h1>
      <div style="color:var(--dim);font-size:13px;margin-top:4px">${o.reason}</div>
      ${o.starPlayer ? '<div style="margin-top:6px">⭐ JUCĂTORUL MECIULUI! ⭐</div>' : ''}
      <div class="rewards">
        <div class="rew">💀 ${o.kills}</div>
        <div class="rew">🪙 +${o.coins}</div>
        <div class="rew">✨ +${o.xp}</div>
        <div class="rew">🏆 ${o.trophies}</div>
      </div>
      <button class="mbtn green" id="end-lobby" style="width:100%">Înapoi în lobby</button>
    </div>`;
    this.root.appendChild(ov);
    ov.querySelector('#end-lobby')?.addEventListener('click', () => {
      audio.sfx('click');
      ov.remove();
      this.game?.stopToMenu();
      this.renderMenu();
    });
  }

  toast(msg: string) {
    const el = this.root.querySelector('#toast') as HTMLElement | null;
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    window.clearTimeout((el as unknown as { _t?: number })._t);
    (el as unknown as { _t?: number })._t = window.setTimeout(() => {
      el.style.display = 'none';
    }, 2600);
  }

  private loopPerf() {
    if (this.perfTimer !== null) return;
    this.perfTimer = window.setInterval(() => {
      const el = this.root.querySelector('#perf') as HTMLElement | null;
      if (!el) return;
      el.classList.toggle('on', settings.data.showPerf);
      if (settings.data.showPerf) {
        el.innerHTML =
          `${perf.fps} FPS • ${perf.frameMs.toFixed(1)}ms<br>` +
          `ping ${perf.ping}ms • ${perf.netState}<br>` +
          `draw ${perf.drawCalls}`;
      }
    }, 500);
  }
}
