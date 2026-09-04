import { HEROES, RARITY_COLOR, RARITY_ORDER, POWER_MAX, UPGRADE_COST, GADGETS } from '../data/heroes';
import { MODES } from '../data/modes';
import { MAPS } from '../data/maps';
import { QUESTS } from '../data/economy';
import { save } from '../save/SaveSystem';
import { settings } from '../settings/Settings';
import { Shop, buyOnline } from '../shop/Shop';
import { Progression } from '../progression/Progression';
import { Auth } from '../auth/Auth';
import { audio } from '../audio/Audio';
import { perf } from '../core/Perf';
import { APP_VERSION } from '../core/Version';
import { checkForUpdate, installUpdate, type UpdateInfo } from '../updater/Updater';
import { AppUpdater } from '../updater/AppUpdater';
import { Capacitor } from '@capacitor/core';
import { lobby } from '../multiplayer/LobbyClient';
import { T, modeName, modeDesc, modeTarget, heroTitle, heroDesc, gadgetName, gadgetDesc } from '../i18n/lang';
import type { FriendEntry, RoomStateInfo } from '../networking/protocol';
import type { GameManager, IGameUI } from '../game/GameManager';

const HERO_FACE: Record<string, string> = {
  volt: '⚡', pietro: '🪨', sprint: '💨', bula: '🫧',
  moss: '🌱', ghimp: '🌵', unda: '🌊', turbo: '🚀',
  vifor: '❄️', magma: '🌋', lance: '🔱', ricosa: '🎯',
  blip: '💜', mortar: '💣', spectru: '👻', coral: '🪸',
  nova: '🌟', golem: '⛰️', viespe: '🐝',
  dragon: '🐉', titan: '🦾', fantoma: '💀',
  quasar: '🌀', gaura: '⚫',
};

export class UI implements IGameUI {
  private game!: GameManager;
  private selectedMode = 'knockout';
  private playerName: string;
  private mmTimer: number | null = null;
  private perfTimer: number | null = null;
  // social: lobby persistent + stare cameră custom + prieteni
  private lobbyWired = false;
  private lobbyRoom: RoomStateInfo | null = null;
  private friendList: FriendEntry[] = [];
  private friendIncoming: FriendEntry[] = [];
  private friendOutgoing: string[] = [];
  private heroSort: 'trophies' | 'rarity' | 'power' = 'rarity';
  private heroSortDir: 1 | -1 = 1;
  private heroDetail: string | null = null;

  constructor(private root: HTMLElement) {
    this.playerName =
      localStorage.getItem('nova-name') || `Erou#${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem('nova-name', this.playerName);
    // Pe APK nativ: poartă de update forțat ÎNAINTE de orice (inclusiv meniu).
    // Pe web update-ul vine singur cu refresh-ul, deci fără poartă.
    if (Capacitor.isNativePlatform()) {
      this.loopPerf();
      void this.runForceCheck();
    } else {
      this.proceedBoot();
      this.loopPerf();
    }
  }

  /** Continuarea boot-ului după poarta de update (sau direct pe web). */
  private booted = false;

  private proceedBoot() {
    if (this.booted) return;
    this.booted = true;
    if (Auth.token && !Auth.offlineMode) {
      this.renderMenu();
      // revalidare silențioasă — token expirat => ecran de cont
      void Auth.refresh().then((ok) => {
        if (!ok) this.showAuth(T('Session expired. Log in again.', 'Sesiunea a expirat. Conectează-te din nou.'));
        else this.renderMenu();
      });
    } else if (Auth.offlineMode) {
      this.renderMenu();
    } else {
      this.showAuth();
    }
    Progression.claimDaily();
    this.wireLobby();
  }

  /** Conectează socket-ul de lobby (prieteni + camere) când ești logat. */
  private wireLobby() {
    if (!Auth.loggedIn || Auth.offlineMode) return;
    if (!this.lobbyWired) {
      this.lobbyWired = true;
      lobby.onFriends = (friends, incoming, outgoing) => {
        this.friendList = friends;
        this.friendIncoming = incoming;
        this.friendOutgoing = outgoing;
        // badge pe butonul de prieteni dacă e afișat
        const badge = this.root.querySelector('#friends-badge');
        if (badge) {
          badge.textContent = incoming.length > 0 ? String(incoming.length) : '';
          (badge as HTMLElement).style.display = incoming.length > 0 ? 'flex' : 'none';
        }
        // re-randează pagina de prieteni dacă e deschisă
        if (this.root.querySelector('#friends-page')) {
          this.root.querySelector('.page')?.remove();
          this.openPage('friends');
        }
      };
      lobby.onRoom = (room) => {
        this.lobbyRoom = room;
        if (room?.started) {
          // host-ul a pornit: intră în meci cu setările camerei
          this.root.querySelector('#lobby-ov')?.remove();
          this.selectedMode = room.mode;
          this.root.querySelector('.page')?.remove();
          this.beginMatch(room.mode, room.code, room.map);
        } else if (this.root.querySelector('#lobby-ov')) {
          this.renderLobbyOv();
        }
      };
      lobby.onInvite = (code, from, mode) => {
        audio.sfx('coin');
        this.showInvite(code, from, mode);
      };
      lobby.onNotice = (msg) => this.toast(msg);
    }
    lobby.connect(Auth.token);
  }

  // ---------- POARTĂ UPDATE FORȚAT (doar APK nativ) ----------
  // Cât timp există versiune nouă, jocul NU pornește: descarcă singur APK-ul
  // și deschide singur instalarea. Singurul tap rămas e confirmarea „Instalează"
  // din ecranul de sistem Android (impus de OS, nicio aplicație n-o poate sări).

  private gateTimer: number | null = null;

  private gateHtml(inner: string) {
    this.root.innerHTML = `
    <div class="screen" id="scr-update">
      <div class="auth-wrap upd">
        <div class="auth-logo">⚡</div>
        <h1 class="auth-title">STARFORGE</h1>
        ${inner}
      </div>
    </div>
    <div id="hud"></div><div id="toast"></div><div id="perf"></div>`;
  }

  private stopGatePoll() {
    if (this.gateTimer !== null) {
      window.clearInterval(this.gateTimer);
      this.gateTimer = null;
    }
  }

  private async runForceCheck() {
    this.gateHtml(`
      <div class="upd-status"><div class="spinner">🌀</div>
      <div class="auth-sub">Verific actualizări…</div></div>`);
    try {
      const { update, info } = await checkForUpdate();
      if (update && info) this.startForceUpdate(info);
      else this.proceedBoot();
    } catch {
      // fără net / GitHub picat → intrăm offline, nu blocăm jocul la nesfârșit
      this.proceedBoot();
    }
  }

  private async startForceUpdate(info: UpdateInfo) {
    this.stopGatePoll();
    const notes = info.notes
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\n/g, '<br>');
    this.gateHtml(`
      <div class="upd-badge">UPDATE OBLIGATORIU v${info.version}</div>
      <div class="auth-sub">Se descarcă automat — nu poți juca pe versiunea veche.</div>
      <div class="upd-notes">${notes}</div>
      <div class="upd-bar"><div id="upd-fill"></div></div>
      <div class="upd-pct" id="upd-pct">Pornesc descărcarea…</div>
      <button class="mbtn green hidden" id="upd-open" style="width:100%;margin-top:10px">Deschide instalarea</button>
      <button class="mbtn ghost hidden" id="upd-retry" style="width:100%;margin-top:8px">Reîncearcă</button>
      <button class="mbtn ghost hidden" id="upd-skip" style="width:100%;margin-top:8px">Continuă fără update</button>`);
    audio.sfx('ui');
    const fill = this.root.querySelector('#upd-fill') as HTMLElement | null;
    const pct = this.root.querySelector('#upd-pct') as HTMLElement | null;
    const btnOpen = this.root.querySelector('#upd-open') as HTMLButtonElement | null;
    const btnRetry = this.root.querySelector('#upd-retry') as HTMLButtonElement | null;
    const btnSkip = this.root.querySelector('#upd-skip') as HTMLButtonElement | null;
    const say = (t: string) => { if (pct) pct.textContent = t; };
    const bar = (d: number, t: number) => {
      if (fill) fill.style.width = t > 0 ? `${Math.min(100, (d / t) * 100)}%` : '8%';
    };
    const showEscape = (msg: string) => {
      say(msg);
      btnRetry?.classList.remove('hidden');
      btnSkip?.classList.remove('hidden');
    };
    btnRetry?.addEventListener('click', () => {
      audio.sfx('click');
      void this.startForceUpdate(info);
    });
    btnSkip?.addEventListener('click', () => {
      audio.sfx('click');
      this.stopGatePoll();
      this.toast(T('You play on the old version — multiplayer may be incompatible.', 'Joci pe versiunea veche — multiplayer-ul poate fi incompatibil.'));
      this.proceedBoot();
    });
    btnOpen?.addEventListener('click', () => {
      audio.sfx('click');
      void AppUpdater.openInstaller().catch(() => this.toast(T('Cannot open installer.', 'Nu pot deschide instalarea.')));
    });
    // descărcarea pornește SINGURĂ, fără să întrebe
    try {
      await AppUpdater.downloadAndInstall({ url: info.apkUrl, title: 'Starforge' });
    } catch {
      showEscape('⚠️ Descărcarea n-a pornit. Verifică netul.');
      return;
    }
    let opened = false;
    this.gateTimer = window.setInterval(async () => {
      try {
        const p = await AppUpdater.getProgress();
        if (p.total > 0) {
          bar(p.downloaded, p.total);
          const mb = (n: number) => (n / 1048576).toFixed(1);
          say(`⬇️ ${mb(p.downloaded)} / ${mb(p.total)} MB`);
        } else {
          say('⬇️ Se descarcă…');
        }
        if (p.state === 'done' && !opened) {
          opened = true;
          this.stopGatePoll();
          bar(1, 1);
          say('✅ Descărcat! Se deschide instalarea…');
          btnOpen?.classList.remove('hidden');
          // installerul se deschide SINGUR (pluginul o face la final);
          // relansăm și de aici în caz de cursă
          try { await AppUpdater.openInstaller(); } catch { /* butonul rămâne */ }
        } else if (p.state === 'failed') {
          this.stopGatePoll();
          showEscape('⚠️ Descărcarea a eșuat.');
        }
      } catch {
        // poll eșuat o dată — DownloadManager continuă în fundal
      }
    }, 600);
  }

  attach(game: GameManager) {
    this.game = game;
    // re-randăm ca să pornească vitrina 3D (necesită game atașat)
    this.renderMenu();
  }

  // ---------- CONT (login / register) ----------

  private authTab: 'login' | 'register' = 'login';

  private showAuth(notice?: string) {
    this.root.innerHTML = `
    <div class="screen" id="scr-auth">
      <div class="auth-wrap">
        <div class="auth-logo">⚡</div>
        <h1 class="auth-title">STARFORGE</h1>
        <div class="auth-sub">${T('Your account keeps trophies, coins and progress on any device.', 'Contul tău păstrează trofee, monezi și progres pe orice device.')}</div>
        ${notice ? `<div class="auth-err">${notice}</div>` : ''}
        <div class="seg" id="auth-tabs">
          <button data-at="login" class="${this.authTab === 'login' ? 'sel' : ''}">${T('Log in', 'Conectare')}</button>
          <button data-at="register" class="${this.authTab === 'register' ? 'sel' : ''}">${T('New account', 'Cont nou')}</button>
        </div>
        <input class="ainput" id="auth-name" maxlength="14" placeholder="${T('Fighter name (3-14, letters/numbers/_)', 'Nume luptător (3-14, litere/cifre/_)')}" autocomplete="username" />
        <input class="ainput" id="auth-pass" type="password" maxlength="64" placeholder="${T('Password (min 4 chars)', 'Parolă (minim 4 caractere)')}" autocomplete="current-password" />
        <div class="auth-err hidden" id="auth-err"></div>
        <button class="btn-play" id="auth-go">${this.authTab === 'login' ? T('ENTER GAME', 'INTRĂ ÎN JOC') : T('CREATE ACCOUNT', 'CREEAZĂ CONT')}</button>
        <button class="mbtn ghost" id="auth-offline" style="width:100%;margin-top:10px">${T('Play offline, no account', 'Joacă offline, fără cont')}</button>
      </div>
    </div>
    <div id="hud"></div><div id="toast"></div><div id="perf"></div>`;
    this.root.querySelectorAll('#auth-tabs button').forEach((b) => {
      b.addEventListener('click', () => {
        this.authTab = (b as HTMLElement).dataset.at as 'login' | 'register';
        audio.sfx('click');
        this.showAuth();
      });
    });
    const go = async () => {
      const name = (this.root.querySelector('#auth-name') as HTMLInputElement).value.trim();
      const pass = (this.root.querySelector('#auth-pass') as HTMLInputElement).value;
      const err = this.root.querySelector('#auth-err') as HTMLElement;
      const btn = this.root.querySelector('#auth-go') as HTMLButtonElement;
      err.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = '⏳…';
      try {
        if (this.authTab === 'register') await Auth.register(name, pass);
        else await Auth.login(name, pass);
        audio.sfx('coin');
        this.renderMenu();
        this.wireLobby();
      } catch (e) {
        err.textContent = (e as Error).message;
        err.classList.remove('hidden');
        audio.sfx('hurt');
        btn.disabled = false;
        btn.textContent = this.authTab === 'login' ? T('ENTER GAME', 'INTRĂ ÎN JOC') : T('CREATE ACCOUNT', 'CREEAZĂ CONT');
      }
    };
    this.root.querySelector('#auth-go')?.addEventListener('click', () => void go());
    this.root.querySelector('#auth-offline')?.addEventListener('click', () => {
      audio.sfx('click');
      Auth.goOffline();
      this.renderMenu();
    });
  }

  // ---------- MENIU ----------

  private renderMenu() {
    const d = save.data;
    const hero = HEROES.find((h) => h.id === d.selectedHero) ?? HEROES[0];
    const need = 100 + d.level * 60 - 60;
    // cont logat? profilul server e sursa de adevăr pentru economie.
    const prof = Auth.loggedIn ? Auth.profile : null;
    const dispName = Auth.displayName(this.playerName);
    const lvl = prof?.level ?? d.level;
    const xp = prof?.xp ?? d.xp;
    const troph = prof?.trophies ?? d.trophies;
    const coins = prof?.coins ?? d.coins;
    const gems = prof?.gems ?? d.gems;
    const mode = MODES.find((m) => m.id === this.selectedMode) ?? MODES[0];
    this.root.innerHTML = `
    <div class="screen brawl" id="scr-menu">
      <div class="b-top">
        <div class="b-tleft">
          <button class="iconbtn" data-nav="settings" title="Setări">⚙️</button>
          <button class="profile-card" data-nav="account">
            <span class="lvlbadge">${lvl}</span>
            <span class="avatar sm ${Auth.loggedIn ? '' : 'offline'}">🦊</span>
            <span class="pinfo">
              <span class="pname"><span class="acc-dot ${Auth.loggedIn ? '' : 'off'}"></span>${dispName}</span>
            </span>
          </button>
          <div class="troph-card">🏆 ${troph}</div>
        </div>
        <div class="b-tright">
          <div class="pill">🪙 ${coins}</div>
          <div class="pill">💎 ${gems}</div>
        </div>
      </div>
      <div class="b-mid">
        <div class="b-rail">
          <button class="rail-btn" data-nav="brawlers" style="--rc:${RARITY_COLOR[hero.rarity]}">
            <span class="ic">🦸</span><span>${T('HEROES', 'EROI')}</span>
          </button>
          <button class="rail-btn gold" data-nav="shop">
            <span class="ic">🛒</span><span>${T('SHOP', 'SHOP')}</span>
          </button>
        </div>
        <div class="b-stage">
          <button class="hero-plate" id="hero-plate">
            <div class="hero-name">${hero.name}</div>
            <div class="hero-title">${hero.title}</div>
            <div class="hero-tags">
              <span class="tag" style="color:${RARITY_COLOR[hero.rarity]}">${hero.rarity.toUpperCase()}</span>
              <span class="tag">❤️ ${hero.hp}</span>
              <span class="tag">⚔️ ${hero.damage}</span>
              <span class="tag">🔋 Nv ${lvl}</span>
            </div>
          </button>
        </div>
        <div class="b-rail">
          <button class="rail-btn blue" data-nav="quests">
            <span class="ic">📜</span><span>${T('QUESTS', 'MISIUNI')}</span>
          </button>
          <button class="rail-btn gold" data-nav="friends">
            <span class="ic">👥</span><span>${T('FRIENDS', 'PRIETENI')}</span>
            <span class="rbadge" id="friends-badge" style="display:${this.friendIncoming.length > 0 ? 'flex' : 'none'}">${this.friendIncoming.length > 0 ? this.friendIncoming.length : ''}</span>
          </button>
          <button class="rail-btn purple" id="btn-daily">
            <span class="ic">🎁</span><span>${T('DAILY', 'ZILNIC')}</span>
          </button>
        </div>
      </div>
      <div class="b-bottom">
        <div class="xp-card">
          <div class="xp-top"><span>✨ Nv ${lvl}</span><span>${xp}/${need}</span></div>
          <div class="xpbar"><div style="width:${Math.min(100, (xp / need) * 100)}%"></div></div>
        </div>
        <button class="mode-pick" data-nav="modes">
          <span class="ic">${mode.icon}</span>
          <span class="inf"><span class="nm">${modeName(mode)}</span><span class="ds">${mode.players} • ${modeTarget(mode)}</span></span>
          <span class="go">▸</span>
        </button>
        <div class="play-wrap">
          <button class="btn-play" id="btn-play">${T('PLAY', 'JOACĂ')}</button>
          <div class="online-row"><span class="dot off" id="net-dot"></span><span id="net-txt">${T('Offline — bots', 'Offline — boți')}</span></div>
        </div>
      </div>
    </div>
    <div id="hud">
      <div class="hud-top">
        <div class="scorebox"><small id="hud-mode">KNOCKOUT</small><span id="hud-score">0 : 0</span></div>
        <button class="pausebtn" id="btn-pause">⏸</button>
      </div>
      <div id="lowhp"></div>
      <div id="killfeed"></div>
      <div id="countdown"></div>
      <div id="respawn"></div>
      <div id="banner"></div>
    </div>
    <div id="toast"></div>
    <div id="perf"></div>`;
    this.root.querySelector('#btn-play')?.addEventListener('click', () => this.startMatchmaking());
    this.root.querySelector('#hero-plate')?.addEventListener('click', () => {
      audio.sfx('ui');
      this.openPage('brawlers');
    });
    this.root.querySelector('#btn-daily')?.addEventListener('click', () => {
      const got = Progression.claimDaily();
      audio.sfx(got ? 'coin' : 'click');
      this.toast(got ? T('🎁 Daily bonus: +50 🪙 +3 💎!', '🎁 Bonus zilnic: +50 🪙 +3 💎!') : T("🎁 Today's bonus already claimed. Come back tomorrow!", '🎁 Bonusul de azi e deja luat. Revino mâine!'));
    });
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
        this.toast(T(`⬇️ Update available: ${info.version} (Settings → Check for updates)`, `⬇️ Update disponibil: ${info.version} (Setări → Verifică actualizări)`));
      }
    } catch { /* silențios — butonul din Setări arată eroarea */ }
  }

  private async probeServer() {
    // verificare rapidă dacă serverul e sus (pentru eticheta online)
    const dot = this.root.querySelector('#net-dot');
    const txt = this.root.querySelector('#net-txt');
    if (!dot || !txt) return;
    try {
      const { SERVER_URL } = await import('../multiplayer/NetClient');
      const ws = new WebSocket(SERVER_URL);
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
        <h2>${T('FINDING MATCH…', 'CAUT MECI…')}</h2>
        <div class="mm-tips" id="mm-tip">${mode.icon} ${modeName(mode)} • ${modeDesc(mode)}</div>
        <div class="mm-tips">${T('Room', 'Camera')} ${Math.floor(Math.random() * 9000 + 1000)} • ${T('Players', 'Jucători')} 1/6…</div>
        <button class="mbtn ghost" id="mm-cancel">${T('Cancel', 'Anulează')}</button>
      </div>`;
    this.root.appendChild(ov);
    let n = 1;
    const tips = [
      T('💡 Use bushes to hide!', '💡 Folosește tufișurile ca să te ascunzi!'),
      T('💡 Your Super charges by hitting enemies!', '💡 Super-ul se încarcă lovind inamicii!'),
      T('💡 Dying drops your stars/gems!', '💡 La moarte scapi stelele/gemele!'),
      T('💡 Bots flee at low HP — chase them!', '💡 Boții fug când au HP mic — urmărește-i!'),
    ];
    let ti = 0;
    this.mmTimer = window.setInterval(() => {
      n++;
      const el = ov.querySelectorAll('.mm-tips')[1];
      if (el) el.textContent = `${T('Room', 'Camera')} ${Math.floor(Math.random() * 9000 + 1000)} • ${T('Players', 'Jucători')} ${Math.min(6, n)}/6…`;
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

  private beginMatch(mode?: string, room?: string, map?: string) {
    if (!this.game) {
      this.toast(T('3D unavailable on this device/browser.', '3D indisponibil pe acest dispozitiv/browser.'));
      this.root.querySelector('#scr-menu')?.classList.remove('hidden');
      return;
    }
    if (mode) this.selectedMode = mode;
    this.root.querySelector('#scr-menu')?.classList.add('hidden');
    // online dacă serverul răspunde — GameManager face fallback automat la boți
    this.game?.startMatch(this.selectedMode, save.data.selectedHero, Auth.displayName(this.playerName), true, room, map);
  }

  /** Cumpără + echipează gadget: server când ești logat, local altfel. */
  private async buyGadget(heroId: string, gadgetId: string): Promise<{ ok: boolean; msg: string }> {
    if (Auth.loggedIn && !Auth.offlineMode) {
      try {
        const { serverRequest } = await import('../multiplayer/NetClient');
        const r = await serverRequest({ t: 'gadget-buy', token: Auth.token, hero: heroId, gadget: gadgetId });
        if (r.profile) Auth.setProfile(r.profile);
        return { ok: r.ok, msg: r.msg };
      } catch (e) {
        return { ok: false, msg: (e as Error).message };
      }
    }
    const { gadgetById } = await import('../data/heroes');
    const g = gadgetById(gadgetId);
    if (!g) return { ok: false, msg: 'Gadget inexistent.' };
    const d = save.data;
    if (d.heroGadgets[heroId] === gadgetId) return { ok: false, msg: 'Deja echipat.' };
    if (d.coins < g.price) return { ok: false, msg: `Îți lipsesc ${g.price - d.coins} monezi.` };
    d.coins -= g.price;
    d.heroGadgets[heroId] = gadgetId;
    save.save();
    return { ok: true, msg: `${g.name} echipat!` };
  }

  /** Upgrade putere erou: server când ești logat, local altfel. */
  private async upgradeHero(heroId: string): Promise<{ ok: boolean; msg: string }> {
    const d = save.data;
    const cur = Math.max(1, Math.min(POWER_MAX, Math.round(
      (Auth.loggedIn && Auth.profile ? Auth.profile.heroPower[heroId] : d.heroPower[heroId]) ?? 1)));
    if (cur >= POWER_MAX) return { ok: false, msg: 'Putere maximă!' };
    const cost = UPGRADE_COST[cur] ?? 0;
    if (Auth.loggedIn && !Auth.offlineMode) {
      try {
        const { serverRequest } = await import('../multiplayer/NetClient');
        const r = await serverRequest({ t: 'hero-upgrade', token: Auth.token, hero: heroId });
        if (r.profile) Auth.setProfile(r.profile);
        return { ok: r.ok, msg: r.msg };
      } catch (e) {
        return { ok: false, msg: (e as Error).message };
      }
    }
    if (d.coins < cost) return { ok: false, msg: `Îți lipsesc ${cost - d.coins} monezi.` };
    d.coins -= cost;
    d.heroPower[heroId] = cur + 1;
    save.save();
    return { ok: true, msg: `${heroId.toUpperCase()} putere ${cur + 1}!` };
  }

  // ---------- CAMERĂ CUSTOM ----------

  private openCustomLobby() {
    this.root.querySelector('#lobby-ov')?.remove();
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'lobby-ov';
    this.root.appendChild(ov);
    this.renderLobbyOv();
  }

  private renderLobbyOv() {
    const ov = this.root.querySelector('#lobby-ov');
    if (!ov) return;
    const r = this.lobbyRoom;
    if (!r) {
      // creare / alăturare
      ov.innerHTML = `
        <div class="mm-box" style="max-width:520px">
          <h2>⚔️ CAMERĂ CUSTOM</h2>
          <div class="mm-tips">Alege modul și harta, apoi invită-ți prietenii cu codul.</div>
          <div class="setrow"><label>Mod</label><div class="seg" id="lb-modes" style="flex-wrap:wrap">
            ${MODES.filter((m) => m.id !== 'training').map((m, i) => `<button data-m="${m.id}" class="${i === 0 ? 'sel' : ''}">${m.icon}</button>`).join('')}
          </div></div>
          <div class="setrow"><label>Hartă</label><div class="seg" id="lb-maps" style="flex-wrap:wrap"></div></div>
          <button class="mbtn gold" id="lb-create" style="width:100%;margin-top:8px">CREEAZĂ CAMERA</button>
          <div class="setrow" style="display:flex;gap:8px;margin-top:8px">
            <input class="ainput" id="lb-code" placeholder="Cod cameră…" maxlength="6" style="flex:1;margin:0;text-transform:uppercase">
            <button class="mbtn green" id="lb-join">INTRĂ</button>
          </div>
          <button class="mbtn ghost" id="lb-close" style="width:100%;margin-top:8px">Înapoi</button>
        </div>`;
      let mode = 'knockout';
      const mapsEl = ov.querySelector('#lb-maps')!;
      const drawMaps = () => {
        const modeMaps = mode === 'training' ? MAPS : MAPS;
        mapsEl.innerHTML = modeMaps.map((mp, i) =>
          `<button data-map="${mp.id}" class="${i === 0 ? 'sel' : ''}" title="${mp.name}">${mp.name.split(' ')[0]}</button>`).join('');
        mapsEl.querySelectorAll('button').forEach((b) => {
          b.addEventListener('click', () => {
            audio.sfx('click');
            mapsEl.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
            b.classList.add('sel');
          });
        });
      };
      drawMaps();
      ov.querySelectorAll('#lb-modes button').forEach((b) => {
        b.addEventListener('click', () => {
          audio.sfx('click');
          ov.querySelectorAll('#lb-modes button').forEach((x) => x.classList.remove('sel'));
          b.classList.add('sel');
          mode = (b as HTMLElement).dataset.m!;
          drawMaps();
        });
      });
      ov.querySelector('#lb-create')?.addEventListener('click', () => {
        audio.sfx('ui');
        const map = (mapsEl.querySelector('button.sel') as HTMLElement | null)?.dataset.map ?? 'crystal-hollow';
        lobby.send({ t: 'room-create', token: Auth.token, mode, map });
      });
      ov.querySelector('#lb-join')?.addEventListener('click', () => {
        audio.sfx('ui');
        const code = (ov.querySelector('#lb-code') as HTMLInputElement).value.trim().toUpperCase();
        if (!code) return;
        lobby.send({ t: 'room-join', token: Auth.token, code });
      });
      ov.querySelector('#lb-close')?.addEventListener('click', () => {
        audio.sfx('click');
        ov.remove();
      });
      return;
    }
    // în cameră: cod, jucători, erou, start (host)
    const meHost = r.host;
    ov.innerHTML = `
      <div class="mm-box" style="max-width:560px">
        <h2>📻 CAMERA <span style="color:var(--gold)">${r.code}</span></h2>
        <div class="mm-tips">${MODES.find((m) => m.id === r.mode)?.icon ?? ''} ${r.mode.toUpperCase()} • 🗺️ ${r.mapName}</div>
        <div class="modes-label">JUCĂTORI (${r.players.length})</div>
        ${r.players.map((p) => `
          <div class="bcard ${p.host ? 'sel' : ''}"><div class="face">${HERO_FACE[p.hero] ?? '🦸'}</div>
          <div class="inf"><div class="nm">${p.name} ${p.host ? '👑' : ''}</div>
          <div class="tt">${(HEROES.find((h) => h.id === p.hero)?.name ?? p.hero)}</div></div></div>`).join('')}
        <div class="modes-label">EROUL TĂU</div>
        <div class="heropick">${HEROES.map((h) => `
          <button class="hpick ${save.data.selectedHero === h.id ? 'sel' : ''}" data-lhero="${h.id}" title="${h.name}">${HERO_FACE[h.id] ?? '🦸'}</button>`).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          ${meHost ? '<button class="mbtn green" id="lb-start" style="flex:1">▶ START MECI</button>' : '<div class="mm-tips" style="flex:1">Așteaptă host-ul să pornească…</div>'}
          <button class="mbtn ghost" id="lb-leave">Ieși</button>
        </div>
        <div class="mm-tips">Invită din pagina PRIETENI (butonul INVITĂ) sau dă-le codul.</div>
      </div>`;
    ov.querySelectorAll('[data-lhero]').forEach((b) => {
      b.addEventListener('click', () => {
        audio.sfx('click');
        const hid = (b as HTMLElement).dataset.lhero!;
        save.data.selectedHero = hid;
        save.save();
        lobby.send({ t: 'room-hero', hero: hid });
        ov.querySelectorAll('[data-lhero]').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
      });
    });
    ov.querySelector('#lb-start')?.addEventListener('click', () => {
      audio.sfx('ui');
      lobby.send({ t: 'room-start' });
    });
    ov.querySelector('#lb-leave')?.addEventListener('click', () => {
      audio.sfx('click');
      lobby.send({ t: 'room-leave' });
      this.lobbyRoom = null;
      ov.remove();
    });
  }

  private showInvite(code: string, from: string, mode: string) {
    this.root.querySelector('#invite-ov')?.remove();
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'invite-ov';
    ov.innerHTML = `
      <div class="mm-box">
        <div class="spinner">📨</div>
        <h2>${from} te invită!</h2>
        <div class="mm-tips">Cameră <b>${code}</b> • ${mode.toUpperCase()}</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="mbtn green" id="inv-yes" style="flex:1">INTRĂ</button>
          <button class="mbtn ghost" id="inv-no">Mai târziu</button>
        </div>
      </div>`;
    this.root.appendChild(ov);
    ov.querySelector('#inv-yes')?.addEventListener('click', () => {
      audio.sfx('ui');
      ov.remove();
      if (!Auth.loggedIn) return;
      lobby.send({ t: 'room-join', token: Auth.token, code });
      this.openCustomLobby();
    });
    ov.querySelector('#inv-no')?.addEventListener('click', () => {
      audio.sfx('click');
      ov.remove();
    });
    window.setTimeout(() => ov.remove(), 30000);
  }

  // ---------- PAGINI ----------

  private openPage(which: string) {
    const d = save.data;
    const prof = Auth.loggedIn ? Auth.profile : null;
    const page = document.createElement('div');
    page.className = 'page';
    let body = '';
    let title = '';
    if (which === 'brawlers') {
      title = `🦸 ${T('HEROES', 'EROI')} <span style="font-size:13px">${HEROES.length} • 🪙 ${prof?.coins ?? d.coins}</span>`;
      const powers = prof?.heroPower ?? d.heroPower;
      const trophies = prof?.heroTrophies ?? d.heroTrophies;
      const pwOf = (id: string) => Math.max(1, Math.min(POWER_MAX, Math.round(powers[id] ?? 1)));
      const sorted = [...HEROES].sort((a, b) => {
        let r: number;
        if (this.heroSort === 'trophies') r = (trophies[b.id] ?? 0) - (trophies[a.id] ?? 0);
        else if (this.heroSort === 'power') r = pwOf(b.id) - pwOf(a.id);
        else r = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
        if (r === 0) r = a.name.localeCompare(b.name);
        return r * this.heroSortDir;
      });
      const segBtn = (id: 'trophies' | 'rarity' | 'power', label: string) =>
        `<button data-sort="${id}" class="${this.heroSort === id ? 'sel' : ''}">${label}</button>`;
      const dirArrow = this.heroSortDir === 1 ? '▼' : '▲';
      body = `<div class="setrow"><label>${T('Sort', 'Sortează')}</label><div class="seg" id="seg-sort">${segBtn('trophies', T('🏆 Trophies', '🏆 Trofee'))}${segBtn('rarity', T('💎 Rarity', '💎 Raritate'))}${segBtn('power', T('⚡ Power', '⚡ Putere'))}<button data-sortdir="1" class="sel">${dirArrow}</button></div></div>`
      + `<div class="herogrid">` + sorted.map((h) => {
        const sel = d.selectedHero === h.id;
        const pw = pwOf(h.id);
        const maxed = pw >= POWER_MAX;
        const cost = maxed ? 0 : (UPGRADE_COST[pw] ?? 0);
        const ht = trophies[h.id] ?? 0;
        return `<div class="hcard ${sel ? 'sel' : ''}" style="--rc:${RARITY_COLOR[h.rarity]}">
          <div class="hface" style="background:#${h.color.toString(16).padStart(6, '0')}">${HERO_FACE[h.id] ?? '🦸'}</div>
          <div class="hpow">⚡${pw}</div>
          <div class="htroph">🏆${ht}</div>
          <div class="hinf">
            <div class="nm">${h.name}</div>
            <div class="tt" style="color:${RARITY_COLOR[h.rarity]}">${h.rarity.toUpperCase()} • ${h.kind.toUpperCase()} • ${h.species.toUpperCase()}</div>
            <div class="tt">${heroTitle(h)}</div>
            <div class="tt">❤️${h.hp} ⚔️${h.damage} 🏃${h.speed}</div>
          </div>
          <div class="hbtns">
            <button class="mbtn ${sel ? 'ghost' : 'green'}" data-hero="${h.id}" ${sel ? 'disabled' : ''}>${sel ? T('PICKED', 'ALES') : T('PLAY', 'JOACĂ')}</button>
            <button class="mbtn ${maxed ? 'ghost' : 'gold'}" data-upgrade="${h.id}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAX' : `⬆️ 🪙${cost}`}</button>
          </div>
        </div>`;
      }).join('') + `</div>`;
    } else if (which === 'shop') {
      const coinsV = prof?.coins ?? d.coins;
      const gemsV = prof?.gems ?? d.gems;
      title = `🛒 SHOP <span style="font-size:13px">🪙 ${coinsV} • 💎 ${gemsV}</span>`;
      body = Shop.items().map((i) => {
        const owned = Shop.owned(i.id);
        return `<div class="bcard">
          <div class="face" style="background:#${(i.color ?? 0x2d7dff).toString(16).padStart(6, '0')}33">${i.kind === 'skin' ? '🎨' : i.kind === 'emote' ? '😎' : '🪙'}</div>
          <div class="inf"><div class="nm">${T(i.nameEn, i.name)}</div>
          <div class="tt">${i.tag ?? ''} ${i.heroId ? '• ' + T('for ', 'pentru ') + i.heroId.toUpperCase() : ''}</div></div>
          <button class="mbtn ${owned ? 'ghost' : 'gold'}" data-buy="${i.id}" ${owned ? 'disabled' : ''}>${owned ? T('OWNED', 'DEȚINUT') : `${i.currency === 'coins' ? '🪙' : '💎'} ${i.price}`}</button>
        </div>`;
      }).join('');
    } else if (which === 'quests') {
      const stats = prof
        ? { kills: prof.kills, wins: prof.wins, supers: prof.supers, stars: prof.stars }
        : { kills: d.kills, wins: d.wins, supers: d.supers, stars: d.stars };
      const qProg: Record<string, number> = {
        'q-kills': stats.kills, 'q-wins': stats.wins,
        'q-super': stats.supers, 'q-stars': stats.stars,
      };
      const claimed = prof ? prof.questsClaimed : d.questsClaimed;
      title = T('📜 QUESTS', '📜 MISIUNI');
      body = QUESTS.map((q) => {
        const prog = Math.min(q.target, qProg[q.id] ?? 0);
        const done = prof ? prog >= q.target : (d.quests[q.id] ?? 0) >= q.target;
        const isClaimed = claimed.includes(q.id);
        return `<div class="bcard"><div class="inf">
          <div class="nm">${T(q.nameEn, q.name)}</div><div class="tt">${T(q.descEn, q.desc)} — ${prog}/${q.target}</div>
          <div class="qbar"><div style="width:${(prog / q.target) * 100}%"></div></div>
          <div class="tt">🎁 🪙${q.rewardCoins} + ✨${q.rewardXp} XP</div></div>
          <button class="mbtn ${done && !isClaimed ? 'green' : 'ghost'}" data-quest="${q.id}" ${!done || isClaimed ? 'disabled' : ''}>${isClaimed ? T('CLAIMED', 'LUAT') : done ? T('CLAIM', 'REVENDICĂ') : `${prog}/${q.target}`}</button>
        </div>`;
      }).join('') + `<div class="bcard"><div class="inf"><div class="nm">📊 ${T('Stats', 'Statistici')}</div><div class="tt">${T('Wins', 'Victorii')} ${stats.wins} • ${T('KOs', 'Eliminări')} ${stats.kills} • ${T('Supers', 'Super-uri')} ${stats.supers} • ${T('Stars', 'Stele')} ${stats.stars}</div></div></div>`;
    } else if (which === 'modes') {
      title = T('🎮 GAME MODE', '🎮 MOD DE JOC');
      body = MODES.map((m) => {
        const sel = this.selectedMode === m.id;
        return `<div class="bcard modebig ${sel ? 'sel' : ''}">
          <div class="face">${m.icon}</div>
          <div class="inf"><div class="nm">${modeName(m)}</div>
          <div class="tt">${modeDesc(m)}</div>
          <div class="tt">${m.players} • ${modeTarget(m)}</div></div>
          <button class="mbtn ${sel ? 'ghost' : 'green'}" data-mode="${m.id}" ${sel ? 'disabled' : ''}>${sel ? T('PICKED', 'ALES') : T('PICK', 'ALEGE')}</button>
        </div>`;
      }).join('') + `
        <div class="bcard custom ${this.lobbyRoom ? 'sel' : ''}">
          <div class="face">⚔️</div>
          <div class="inf"><div class="nm">${T('CUSTOM ROOM', 'CAMERĂ CUSTOM')}</div>
          <div class="tt">${T('Play with friends: pick mode, map and heroes. Entry code.', 'Joacă cu prietenii: alegi modul, harta și eroii. Cod de intrare.')}</div>
          ${this.lobbyRoom && !this.lobbyRoom.started ? `<div class="tt">📻 ${T('You are in room', 'Ești în camera')} <b>${this.lobbyRoom.code}</b></div>` : ''}</div>
          <button class="mbtn gold" id="btn-custom">${T('OPEN', 'DESCHIDE')}</button>
        </div>`;
    } else if (which === 'account') {
      const lvl = prof?.level ?? d.level;
      const xp = prof?.xp ?? d.xp;
      const need = 100 + lvl * 60 - 60;
      const troph = prof?.trophies ?? d.trophies;
      const coinsV = prof?.coins ?? d.coins;
      const gemsV = prof?.gems ?? d.gems;
      const nm = Auth.displayName(this.playerName);
      const stats = prof
        ? { kills: prof.kills, wins: prof.wins, supers: prof.supers, stars: prof.stars }
        : { kills: d.kills, wins: d.wins, supers: d.supers, stars: d.stars };
      title = T('👤 ACCOUNT', '👤 CONT');
      const acctCard = Auth.loggedIn && Auth.profile
        ? `<div class="bcard sel"><div class="face">🟢</div><div class="inf"><div class="nm">${Auth.profile.name}</div><div class="tt">${T('Account connected • progress saved on server', 'Cont conectat • progres salvat pe server')}</div></div><button class="mbtn ghost" id="btn-logout">${T('Log out', 'Ieși')}</button></div>`
        : `<div class="bcard"><div class="face">⚪</div><div class="inf"><div class="nm">${T('Offline mode', 'Mod offline')}</div><div class="tt">${T('Progress stays on this device only.', 'Progresul e doar pe acest device.')}</div></div><button class="mbtn green" id="btn-login">${T('Account', 'Cont')}</button></div>`;
      body = acctCard + `
        <div class="bcard"><div class="face">🦊</div><div class="inf">
          <div class="nm">${nm}</div>
          <div class="tt">${T('Lv', 'Nv')} ${lvl} • ✨ ${xp}/${need} XP</div>
          <div class="qbar"><div style="width:${Math.min(100, (xp / need) * 100)}%"></div></div>
          <div class="tt">🏆 ${troph} ${T('trophies', 'trofee')} • 🪙 ${coinsV} • 💎 ${gemsV}</div>
        </div></div>
        <div class="bcard"><div class="inf"><div class="nm">📊 ${T('Account stats', 'Statistici cont')}</div>
          <div class="statgrid">
            <div>🏆<b>${troph}</b>${T('trophies', 'trofee')}</div>
            <div>👑<b>${stats.wins}</b>${T('wins', 'victorii')}</div>
            <div>💀<b>${stats.kills}</b>${T('KOs', 'eliminări')}</div>
            <div>💥<b>${stats.supers}</b>${T('supers', 'super-uri')}</div>
            <div>⭐<b>${stats.stars}</b>${T('stars', 'stele')}</div>
            <div>✨<b>${lvl}</b>${T('level', 'nivel')}</div>
          </div>
        </div></div>
        <div class="setrow"><button class="mbtn ghost" id="btn-name" style="width:100%">✏️ ${T('Change name', 'Schimbă numele')} (${this.playerName})</button></div>`;
    } else if (which === 'hero') {
      const h = HEROES.find((x) => x.id === this.heroDetail) ?? HEROES[0];
      const powers = prof?.heroPower ?? d.heroPower;
      const trophies = prof?.heroTrophies ?? d.heroTrophies;
      const gadgets = prof?.heroGadgets ?? d.heroGadgets;
      const pw = Math.max(1, Math.min(POWER_MAX, Math.round(powers[h.id] ?? 1)));
      const maxed = pw >= POWER_MAX;
      const cost = maxed ? 0 : (UPGRADE_COST[pw] ?? 0);
      const sel = d.selectedHero === h.id;
      const eq = gadgets[h.id];
      const hpP = Math.round(h.hp * (1 + 0.055 * (pw - 1)));
      const dmgP = Math.round(h.damage * (1 + 0.075 * (pw - 1)));
      title = `${HERO_FACE[h.id] ?? '🦸'} ${h.name}`;
      const pips = Array.from({ length: POWER_MAX }, (_, i) =>
        `<span class="ppip ${i < pw ? 'on' : ''}"></span>`).join('');
      body = `
        <div class="herodetail" style="--rc:${RARITY_COLOR[h.rarity]}">
          <div class="hd-face" style="background:linear-gradient(160deg,#${h.color.toString(16).padStart(6, '0')}66,#${h.color.toString(16).padStart(6, '0')}22)">${HERO_FACE[h.id] ?? '🦸'}</div>
          <div class="hd-side">
            <div class="nm" style="color:${RARITY_COLOR[h.rarity]}">${h.name}</div>
            <div class="tt">${heroTitle(h)}</div>
            <div class="tt">${h.rarity.toUpperCase()} • ${h.species.toUpperCase()} • ${h.kind.toUpperCase()}</div>
            <div class="tt">🏆 ${trophies[h.id] ?? 0} ${T('trophies', 'trofee')}</div>
            <div class="story">${heroDesc(h)}</div>
          </div>
        </div>
        <div class="statgrid big">
          <div>❤️<b>${hpP}</b>${T('health', 'viață')}</div>
          <div>⚔️<b>${dmgP}×${h.projectiles}</b>${T('attack', 'atac')}</div>
          <div>💥<b>${h.superDamage}</b>${T('super', 'super')}</div>
          <div>🔫<b>${h.ammoMax}</b>${T('ammo', 'gloanțe')}</div>
          <div>🏃<b>${h.speed}</b>${T('speed', 'viteză')}</div>
          <div>📏<b>${h.range}</b>${T('range', 'rază')}</div>
        </div>
        <div class="bcard"><div class="inf"><div class="nm">⚡ ${T('POWER', 'PUTERE')} ${pw} <span class="tt">/ ${POWER_MAX}</span></div>
        <div class="ppips">${pips}</div></div>
        <button class="mbtn ${maxed ? 'ghost' : 'gold'}" data-upgrade="${h.id}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAX' : `⬆️ 🪙${cost}`}</button></div>
        <div class="modes-label">${T('GADGETS (passive abilities)', 'GADGETURI (abilități pasive)')}</div>
        ${GADGETS.map((g) => {
          const owned = eq === g.id;
          return `<div class="bcard ${owned ? 'sel' : ''}"><div class="face">${g.icon}</div>
          <div class="inf"><div class="nm">${gadgetName(g)}</div><div class="tt">${gadgetDesc(g)}</div></div>
          <button class="mbtn ${owned ? 'ghost' : 'gold'}" data-gadget="${h.id}:${g.id}" ${owned ? 'disabled' : ''}>${owned ? T('EQUIPPED', 'ECHIPAT') : `🪙${g.price}`}</button></div>`;
        }).join('')}
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="mbtn ${sel ? 'ghost' : 'green'}" id="hero-select" style="flex:1" ${sel ? 'disabled' : ''}>${sel ? T('SELECTED', 'SELECTAT') : T('SELECT', 'SELECTEAZĂ')}</button>
          <button class="mbtn gold" id="hero-try" style="flex:1">🎯 ${T('TRY', 'ÎNCEARCĂ')}</button>
        </div>`;
    } else if (which === 'settings') {
      title = T('⚙️ SETTINGS', '⚙️ SETĂRI');
      const s = settings.data;
      body = `
        <div class="setrow"><label>${T('Language / Limbă', 'Limbă / Language')}</label><div class="seg" id="seg-lang">
          <button data-l="en" class="${s.lang === 'en' ? 'sel' : ''}">EN</button>
          <button data-l="ro" class="${s.lang === 'ro' ? 'sel' : ''}">RO</button>
        </div></div>
        <div class="setrow"><label>${T('Graphics quality', 'Calitate grafică')}</label><div class="seg" id="seg-q">
          ${(['low', 'medium', 'high'] as const).map((q) => `<button data-q="${q}" class="${s.quality === q ? 'sel' : ''}">${q === 'low' ? T('Low', 'Joasă') : q === 'medium' ? T('Med', 'Medie') : T('High', 'Înaltă')}</button>`).join('')}
        </div></div>
        <div class="setrow"><label>${T('Max FPS', 'FPS maxim')} <span style="font-weight:400">(${perf.fps} ${T('now', 'acum')})</span></label><div class="seg" id="seg-fps">
          ${([30, 60, 90, 120] as const).map((f) => `<button data-f="${f}" class="${s.fpsTarget === f ? 'sel' : ''}">${f}</button>`).join('')}
        </div>
        <div class="tt" style="font-size:11px;color:var(--dim);margin-top:6px">${T('The game cannot exceed your screen refresh rate (60/90/120Hz).', 'Jocul nu poate depăși refresh-ul ecranului (60/90/120Hz, după telefon).')}</div></div>
        <div class="setrow"><label>${T('Master volume', 'Volum general')} <span id="v-master">${Math.round(s.master * 100)}%</span></label>
          <input type="range" id="r-master" min="0" max="100" value="${s.master * 100}"></div>
        <div class="setrow"><label>${T('Music', 'Muzică')} <span id="v-music">${Math.round(s.music * 100)}%</span></label>
          <input type="range" id="r-music" min="0" max="100" value="${s.music * 100}"></div>
        <div class="setrow"><label>${T('Effects', 'Efecte')} <span id="v-sfx">${Math.round(s.sfx * 100)}%</span></label>
          <input type="range" id="r-sfx" min="0" max="100" value="${s.sfx * 100}"></div>
        <div class="setrow"><label>${T('Aim sensitivity', 'Sensibilitate țintire')} <span>${s.sensitivity.toFixed(1)}</span></label>
          <input type="range" id="r-sens" min="50" max="200" value="${s.sensitivity * 100}"></div>
        <div class="setrow"><label>${T('Joystick size', 'Mărime joystick')} <span>${Math.round(s.joystickSize * 100)}%</span></label>
          <input type="range" id="r-joy" min="80" max="140" value="${s.joystickSize * 100}"></div>
        <div class="setrow togglerow">${T('Auto-aim', 'Auto-aim')} <div class="toggle ${s.autoAim ? 'on' : ''}" id="t-aim"></div></div>
        <div class="setrow togglerow">${T('Vibration', 'Vibrații')} <div class="toggle ${s.vibration ? 'on' : ''}" id="t-vib"></div></div>
        <div class="setrow togglerow">${T('Show FPS/ping', 'Afișează FPS/ping')} <div class="toggle ${s.showPerf ? 'on' : ''}" id="t-perf"></div></div>
        <div class="setrow"><button class="mbtn ghost" id="btn-name">✏️ ${T('Change name', 'Schimbă numele')} (${this.playerName})</button></div>
        <div class="setrow togglerow">${T('Version', 'Versiune')} <span style="color:var(--dim)">v${APP_VERSION}</span></div>
        <div class="setrow"><button class="mbtn green" id="btn-update" style="width:100%">⬇️ ${T('Check for updates', 'Verifică actualizări')}</button>
        <div class="tt" id="update-status" style="font-size:12px;color:var(--dim);margin-top:6px">Actualizări automate din GitHub Releases.</div></div>`;
    } else if (which === 'friends') {
      title = T('👥 FRIENDS', '👥 PRIETENI');
      if (!Auth.loggedIn || Auth.offlineMode) {
        body = `<div class="bcard"><div class="inf"><div class="nm">${T('Account required', 'Necesită cont')}</div><div class="tt">${T('Log in to add friends and play together.', 'Intră în cont ca să adaugi prieteni și să joci împreună.')}</div></div><button class="mbtn green" id="btn-login">${T('Account', 'Cont')}</button></div>`;
      } else {
        const fr = (f: FriendEntry) => `
          <div class="bcard"><div class="face">${f.online ? '🟢' : '⚪'}</div>
          <div class="inf"><div class="nm">${f.name}</div>
          <div class="tt">${T('Lv', 'Nv')} ${f.level} • 🏆 ${f.trophies} ${f.online ? T('• online', '• online') : T('• offline', '• offline')}</div></div>
          ${f.online && this.lobbyRoom && !this.lobbyRoom.started ? `<button class="mbtn gold" data-invite="${f.name}">${T('INVITE', 'INVITĂ')}</button>` : ''}
          <button class="mbtn ghost" data-unfriend="${f.name}">✕</button></div>`;
        body = `
          <div class="setrow" style="display:flex;gap:8px">
            <input class="ainput" id="friend-name" placeholder="${T("Friend's name…", 'Numele prietenului…')}" maxlength="14" style="flex:1;margin:0">
            <button class="mbtn green" id="friend-add">＋ ${T('ADD', 'ADAUGĂ')}</button>
          </div>
          ${this.friendIncoming.length > 0 ? `<div class="modes-label">${T('INCOMING REQUESTS', 'CERERI PRIMITE')}</div>` + this.friendIncoming.map((f) => `
            <div class="bcard sel"><div class="face">📨</div>
            <div class="inf"><div class="nm">${f.name}</div><div class="tt">${T('Lv', 'Nv')} ${f.level} ${T('wants to be friends', 'vrea să fiți prieteni')}</div></div>
            <button class="mbtn green" data-accept="${f.name}">${T('ACCEPT', 'ACCEPTĂ')}</button>
            <button class="mbtn ghost" data-decline="${f.name}">✕</button></div>`).join('') : ''}
          <div class="modes-label">${T('MY FRIENDS', 'PRIETENII MEI')} (${this.friendList.length})</div>
          ${this.friendList.length > 0 ? this.friendList.map(fr).join('') : `<div class="tt" style="margin-bottom:8px">${T('No friends yet. Add by name!', 'Niciun prieten încă. Adaugă după nume!')}</div>`}
          ${this.friendOutgoing.length > 0 ? `<div class="modes-label">${T('SENT REQUESTS', 'CERERI TRIMISE')}</div><div class="tt">${this.friendOutgoing.join(', ')}</div>` : ''}
          <div class="bcard custom" style="margin-top:10px"><div class="face">⚔️</div>
          <div class="inf"><div class="nm">${T('CUSTOM ROOM', 'CAMERĂ CUSTOM')}</div>
          <div class="tt">${this.lobbyRoom && !this.lobbyRoom.started ? `${T('You are in room', 'Ești în camera')} <b>${this.lobbyRoom.code}</b>` : T('Create a room and invite your friends.', 'Creează o cameră și invită-ți prietenii.')}</div></div>
          <button class="mbtn gold" id="btn-custom">${T('OPEN', 'DESCHIDE')}</button></div>`;
      }
      body = `<div id="friends-page" style="display:contents">${body}</div>`;
    }
    page.innerHTML = `<div class="page-head"><h2>${title}</h2><button class="backbtn" id="pg-back">✕</button></div><div class="page-body">${body}</div>`;
    this.root.appendChild(page);
    page.querySelector('#pg-back')?.addEventListener('click', () => {
      audio.sfx('click');
      page.remove();
      this.renderMenu();
    });
    page.querySelectorAll('[data-mode]').forEach((b) => {
      b.addEventListener('click', () => {
        this.selectedMode = (b as HTMLElement).dataset.mode!;
        audio.sfx('click');
        // renderMenu șterge pagina veche; redeschidem selecția cu highlight nou
        this.renderMenu();
        this.openPage('modes');
      });
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
      b.addEventListener('click', async () => {
        const btn = b as HTMLButtonElement;
        btn.disabled = true;
        const r = await buyOnline((b as HTMLElement).dataset.buy!);
        audio.sfx(r.ok ? 'coin' : 'hurt');
        this.toast(r.msg);
        page.remove();
        this.openPage('shop');
      });
    });
    page.querySelectorAll('[data-quest]').forEach((b) => {
      b.addEventListener('click', async () => {
        const qid = (b as HTMLElement).dataset.quest!;
        if (Auth.loggedIn) {
          const { serverRequest } = await import('../multiplayer/NetClient');
          try {
            const r = await serverRequest({ t: 'quest-claim', token: Auth.token, quest: qid });
            if (r.profile) Auth.setProfile(r.profile);
            audio.sfx(r.ok ? 'coin' : 'hurt');
            this.toast(r.msg);
          } catch (e) {
            audio.sfx('hurt');
            this.toast((e as Error).message);
          }
        } else {
          const ok = Progression.claimQuest(qid);
          audio.sfx(ok ? 'coin' : 'hurt');
        }
        page.remove();
        this.openPage('quests');
      });
    });
    // click pe card erou (nu pe butoane) → preview detaliat
    page.querySelectorAll('.hcard').forEach((card) => {
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        audio.sfx('ui');
        this.heroDetail = (card.querySelector('[data-hero]') as HTMLElement | null)?.dataset.hero ?? null;
        if (this.heroDetail) {
          page.remove();
          this.openPage('hero');
        }
      });
    });
    page.querySelector('#hero-select')?.addEventListener('click', () => {
      if (!this.heroDetail) return;
      audio.sfx('select');
      save.data.selectedHero = this.heroDetail;
      save.save();
      page.remove();
      this.openPage('brawlers');
    });
    page.querySelector('#hero-try')?.addEventListener('click', () => {
      if (!this.heroDetail) return;
      audio.sfx('ui');
      save.data.selectedHero = this.heroDetail;
      save.save();
      page.remove();
      this.beginMatch('training');
    });
    page.querySelectorAll('[data-gadget]').forEach((b) => {
      b.addEventListener('click', async () => {
        const [hid, gid] = (b as HTMLElement).dataset.gadget!.split(':');
        (b as HTMLButtonElement).disabled = true;
        const r = await this.buyGadget(hid, gid);
        audio.sfx(r.ok ? 'upgrade' : 'denied');
        this.toast(r.msg);
        page.remove();
        this.openPage('hero');
      });
    });
    page.querySelectorAll('#seg-sort button').forEach((b) => {
      b.addEventListener('click', () => {
        const el = b as HTMLElement;
        if (el.dataset.sortdir !== undefined) {
          this.heroSortDir = this.heroSortDir === 1 ? -1 : 1;
        } else {
          const s = el.dataset.sort as 'trophies' | 'rarity' | 'power';
          if (this.heroSort === s) this.heroSortDir = this.heroSortDir === 1 ? -1 : 1;
          else {
            this.heroSort = s;
            this.heroSortDir = 1;
          }
        }
        audio.sfx('click');
        page.remove();
        this.openPage('brawlers');
      });
    });
    page.querySelectorAll('[data-upgrade]').forEach((b) => {
      b.addEventListener('click', async () => {
        const hid = (b as HTMLElement).dataset.upgrade!;
        const btn = b as HTMLButtonElement;
        btn.disabled = true;
        const r = await this.upgradeHero(hid);
        audio.sfx(r.ok ? 'upgrade' : 'denied');
        this.toast(r.msg);
        page.remove();
        this.openPage('brawlers');
      });
    });
    // prieteni bindings
    page.querySelector('#friend-add')?.addEventListener('click', () => {
      const inp = page.querySelector('#friend-name') as HTMLInputElement | null;
      const name = inp?.value.trim() ?? '';
      if (!name) return;
      audio.sfx('click');
      lobby.send({ t: 'friend-add', token: Auth.token, name });
    });
    const friendAct = (sel: string, kind: 'friend-accept' | 'friend-decline' | 'friend-remove' | 'friend-invite') => {
      page.querySelectorAll(sel).forEach((b) => {
        b.addEventListener('click', () => {
          audio.sfx('click');
          const key = kind === 'friend-accept' ? 'accept' : kind === 'friend-decline' ? 'decline' : kind === 'friend-remove' ? 'unfriend' : 'invite';
          const name = (b as HTMLElement).dataset[key]!;
          if (kind === 'friend-invite') lobby.send({ t: 'friend-invite', token: Auth.token, name });
          else lobby.send({ t: kind, token: Auth.token, name });
        });
      });
    };
    friendAct('[data-accept]', 'friend-accept');
    friendAct('[data-decline]', 'friend-decline');
    friendAct('[data-unfriend]', 'friend-remove');
    friendAct('[data-invite]', 'friend-invite');
    page.querySelector('#btn-custom')?.addEventListener('click', () => {
      audio.sfx('ui');
      if (!Auth.loggedIn || Auth.offlineMode) {
        this.toast(T('Log in for custom rooms.', 'Intră în cont pentru camere custom.'));
        return;
      }
      this.openCustomLobby();
    });
    page.querySelectorAll('#seg-lang button').forEach((b) => {
      b.addEventListener('click', () => {
        settings.data.lang = (b as HTMLElement).dataset.l as 'en' | 'ro';
        settings.save();
        audio.sfx('click');
        page.remove();
        this.openPage('settings');
        this.renderMenu();
      });
    });
    page.querySelectorAll('#seg-q button').forEach((b) => {
      b.addEventListener('click', () => {
        settings.data.quality = (b as HTMLElement).dataset.q as 'low' | 'medium' | 'high';
        settings.save();
        location.reload();
      });
    });
    page.querySelectorAll('#seg-fps button').forEach((b) => {
      b.addEventListener('click', () => {
        settings.data.fpsTarget = Number((b as HTMLElement).dataset.f) as 30 | 60 | 90 | 120;
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
    page.querySelector('#btn-logout')?.addEventListener('click', () => {
      Auth.logout();
      lobby.disconnect();
      this.lobbyRoom = null;
      this.friendList = [];
      this.friendIncoming = [];
      audio.sfx('click');
      page.remove();
      this.showAuth('Te-ai deconectat.');
    });
    page.querySelector('#btn-login')?.addEventListener('click', () => {
      audio.sfx('click');
      page.remove();
      this.showAuth();
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
        this.toast(T('⚠️ Could not start the download.', '⚠️ Nu am putut porni descărcarea.'));
      }
      ov.remove();
    });
  }

  private openPause() {
    audio.sfx('click');
    this.game?.setPaused(true);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="end-box"><h1>⏸ ${T('PAUSED', 'PAUZĂ')}</h1>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
      <button class="mbtn green" id="p-resume">${T('Resume', 'Continuă')}</button>
      <button class="mbtn ghost" id="p-quit">${T('Quit match', 'Ieși din meci')}</button></div></div>`;
    this.root.appendChild(ov);
    ov.querySelector('#p-resume')?.addEventListener('click', () => {
      this.game?.setPaused(false);
      ov.remove();
    });
    ov.querySelector('#p-quit')?.addEventListener('click', () => {
      ov.remove();
      this.game?.toMenu(save.data.selectedHero);
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
    this.root.querySelector('#lowhp')?.classList.toggle('on', s.hp / s.maxHp < 0.3 && s.hp > 0);
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
      el.textContent = `💀 ${T('Back in', 'Revii în')} ${Math.ceil(t)}…`;
    } else {
      el.style.display = 'none';
    }
  }

  flash(color: string) {
    const f = document.createElement('div');
    f.className = 'screenflash';
    f.style.background = color;
    this.root.appendChild(f);
    window.setTimeout(() => f.remove(), 450);
  }

  banner(text: string, sub?: string) {    const el = this.root.querySelector('#banner') as HTMLElement | null;
    if (!el) return;
    el.style.display = 'block';
    el.style.color = text === 'VICTORIE!' || text === 'VICTORY!' ? 'var(--lime)' : 'var(--red)';
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
      ${o.starPlayer ? `<div style="margin-top:6px">⭐ ${T('STAR PLAYER!', 'JUCĂTORUL MECIULUI!')} ⭐</div>` : ''}
      <div class="rewards">
        <div class="rew">💀 ${o.kills}</div>
        <div class="rew">🪙 +${o.coins}</div>
        <div class="rew">✨ +${o.xp}</div>
        <div class="rew">🏆 ${o.trophies}</div>
      </div>
      <button class="mbtn green" id="end-lobby" style="width:100%">${T('Back to lobby', 'Înapoi în lobby')}</button>
    </div>`;
    this.root.appendChild(ov);
    ov.querySelector('#end-lobby')?.addEventListener('click', () => {
      audio.sfx('click');
      ov.remove();
      this.game?.toMenu(save.data.selectedHero);
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
