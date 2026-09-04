import * as THREE from 'three';
import { Match, type PlayerSpec, type SimFighter, type SimInput } from './Match';
import { botInput } from './Bots';
import { buildMap, inBush, type BuiltMap } from '../maps/MapBuilder';
import { mapById } from '../data/maps';
import { heroById } from '../data/heroes';
import { buildHero, type HeroRig } from '../characters/HeroFactory';
import { Particles } from '../vfx/Particles';
import { Floaters, Shake } from '../vfx/Floaters';
import { TouchControls } from '../player/TouchControls';
import { audio } from '../audio/Audio';
import { settings } from '../settings/Settings';
import { save } from '../save/SaveSystem';
import { Auth } from '../auth/Auth';
import { Shop } from '../shop/Shop';
import { Progression } from '../progression/Progression';
import { NetClient } from '../multiplayer/NetClient';
import type { SnapFighter } from '../networking/protocol';
import { perf } from '../core/Perf';
import { clamp } from '../utils/math';

// Interfața pe care UI-ul o implementează (HUD + ecrane de meci).
export interface IGameUI {
  showMatchUI(modeName: string): void;
  hideMatchUI(): void;
  updateHud(s: {
    hp: number; maxHp: number; superReady: boolean; superPct: number;
    scoreA: number; scoreB: number; time: number; stars: number;
    kills: number; alive: number; total: number; holdT: number; holding: boolean;
  }): void;
  killfeed(text: string): void;
  countdown(text: string): void;
  respawn(t: number): void;
  banner(text: string, sub?: string): void;
  showEnd(o: {
    won: boolean; title: string; reason: string; kills: number;
    coins: number; xp: number; trophies: number; starPlayer: boolean;
  }): void;
  toast(msg: string): void;
}

interface RigView {
  rig: HeroRig;
  bar: THREE.Sprite;
  barCanvas: HTMLCanvasElement;
  barCtx: CanvasRenderingContext2D;
  barTex: THREE.CanvasTexture;
  lastHp: number;
  name: string;
}

export class GameManager {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: TouchControls;
  private floaters: Floaters;
  private shake = new Shake();
  private particles: Particles;
  private ui: IGameUI;
  private clock = 0;
  private running = false;
  private paused = false;

  private match: Match | null = null;
  private builtMap: BuiltMap | null = null;
  private views = new Map<number, RigView>();
  private bulletMeshes: THREE.Mesh[] = [];
  private bulletGeo = new THREE.SphereGeometry(0.24, 8, 6);
  private starGroup = new THREE.Group();
  private starMeshes = new Map<number, THREE.Mesh>();
  private starGeo = new THREE.OctahedronGeometry(0.45);
  private starMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });

  private modeId = 'knockout';
  private mapId = 'crystal-hollow';
  private localId = 0;
  private state: 'idle' | 'countdown' | 'battle' | 'end' = 'idle';
  private countdownT = 0;
  private matchTime = 0;
  private kills = 0;
  private starsCollected = 0;
  private supersUsed = 0;
  private aimManualT = 0;
  private mouseAim: { x: number; z: number } | null = null;

  // online
  private net: NetClient | null = null;
  private online = false;  private remoteFighters = new Map<number, SnapFighter>();
  private remoteBullets: { x: number; z: number; super: boolean; color: number }[] = [];
  private remoteStars: { id: number; x: number; z: number }[] = [];
  private remoteScore = { a: 0, b: 0 };
  private remoteOver = false;
  private remoteWinner = -1;
  private inputT = 0;
  private lastReward: { coins: number; xp: number; trophies: number } | null = null;

  // vitrină 3D meniu
  private showcaseRig: HeroRig | null = null;
  private showcaseGroup: THREE.Group | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    touchRoot: HTMLElement,
    floaterRoot: HTMLElement,
    ui: IGameUI,
  ) {
    this.ui = ui;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x0b0e1d);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.scene.background = new THREE.Color(0x0b0e1d);
    this.controls = new TouchControls(touchRoot);
    this.controls.setVisible(false);
    this.floaters = new Floaters(floaterRoot);
    this.particles = new Particles(this.scene);
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // aim cu mouse pentru desktop
    canvas.addEventListener('pointermove', (e) => {
      if (this.state !== 'battle' || !this.localFighter()) return;
      const r = canvas.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
      const pt = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, pt)) {
        this.mouseAim = { x: pt.x, z: pt.z };
      }
    });
    canvas.addEventListener('pointerdown', () => {
      if (this.state === 'battle') {
        audio.unlock();
      }
    });
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const scale = settings.renderScale;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- vitrină meniu 3D ----------

  /** Scenă 3D animată în meniu: eroul selectat pe piedestal, cameră orbitală. */
  showShowcase(heroId: string) {
    this.cleanup();
    const def = heroById(heroId);
    this.showcaseGroup = new THREE.Group();
    const hemi = new THREE.HemisphereLight(0xbcd2ff, 0x1a1430, 1.1);
    this.showcaseGroup.add(hemi);
    const dir = new THREE.DirectionalLight(0xfff2d9, 1.2);
    dir.position.set(6, 10, 4);
    this.showcaseGroup.add(dir);
    const plat = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.6, 0.5, 24),
      new THREE.MeshLambertMaterial({ color: 0x1e2450 })
    );
    plat.position.y = -0.25;
    this.showcaseGroup.add(plat);
    const glowRing = new THREE.Mesh(
      new THREE.RingGeometry(2.3, 2.7, 32),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.02;
    this.showcaseGroup.add(glowRing);
    this.showcaseRig = buildHero(def, Shop.equippedColor(heroId, def.color));
    this.showcaseRig.setTeamColor(0xb8f135);
    this.showcaseGroup.add(this.showcaseRig.group);
    // particule ambientale discrete
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 5, 4),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x7af0ff : 0xb8f135, transparent: true, opacity: 0.8 })
      );
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 4;
      s.position.set(Math.cos(a) * r, Math.random() * 5, Math.sin(a) * r);
      s.userData = { a, r, sp: 0.3 + Math.random() * 0.7, y: s.position.y };
      this.showcaseGroup.add(s);
    }
    this.scene.add(this.showcaseGroup);
    this.running = true;
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  // ---------- lifecycle ----------

  startMatch(modeId: string, heroId: string, playerName: string, useOnline: boolean, room?: string) {
    this.cleanup();
    this.modeId = modeId;
    this.mapId = modeId === 'training' ? 'dune-rush' : 'crystal-hollow';
    const mapDef = mapById(this.mapId);
    audio.unlock();
    this.ui.showMatchUI(modeId);
    this.controls.setVisible(true);
    this.controls.refreshSizes();

    if (useOnline) {
      this.startOnline(modeId, heroId, playerName, room);
    } else {
      this.startOffline(modeId, heroId, playerName, mapDef.id);
    }
    this.state = 'countdown';
    this.countdownT = 3.2;
    this.running = true;
    this.paused = false;
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private startOffline(modeId: string, heroId: string, playerName: string, _mapId: string) {
    void _mapId;
    const mapDef = mapById(this.mapId);
    this.builtMap = buildMap(this.scene, mapDef);
    this.scene.add(this.starGroup);
    const specs = this.buildSpecs(modeId, heroId, playerName);
    this.match = new Match(modeId, mapDef, specs);
    for (const f of this.match.fighters) {
      this.spawnView(f.id, f.heroId, f.name, f.team);
      if (f.isLocal) this.localId = f.id;
    }
    this.matchTime = 0;
    audio.startMusic(true);
  }

  private buildSpecs(modeId: string, heroId: string, playerName: string): PlayerSpec[] {
    const names = ['Rook', 'Zed', 'Pip', 'Kira', 'Jax', 'Luma', 'Onyx', 'Fizz', 'Tara'];
    const heroes = ['volt', 'moss', 'blip'];
    let ni = 0;
    const nb = () => `${names[ni % names.length]}${ni++ > 8 ? ni : ''}`;
    const hb = () => heroes[Math.floor(Math.random() * heroes.length)];
    if (modeId === 'showdown') {
      const specs: PlayerSpec[] = [{ name: playerName, heroId, team: 0, isBot: false, isLocal: true }];
      for (let i = 0; i < 9; i++) {
        specs.push({ name: nb(), heroId: hb(), team: i + 1, isBot: true });
      }
      return specs;
    }
    if (modeId === 'training') {
      return [
        { name: playerName, heroId, team: 0, isBot: false, isLocal: true },
        { name: 'Țintă A', heroId: 'moss', team: 1, isBot: true },
        { name: 'Țintă B', heroId: 'volt', team: 1, isBot: true },
        { name: 'Țintă C', heroId: 'blip', team: 1, isBot: true },
      ];
    }
    // echipe 3v3
    return [
      { name: playerName, heroId, team: 0, isBot: false, isLocal: true },
      { name: nb(), heroId: hb(), team: 0, isBot: true },
      { name: nb(), heroId: hb(), team: 0, isBot: true },
      { name: nb(), heroId: hb(), team: 1, isBot: true },
      { name: nb(), heroId: hb(), team: 1, isBot: true },
      { name: nb(), heroId: hb(), team: 1, isBot: true },
    ];
  }

  private startOnline(modeId: string, heroId: string, playerName: string, room?: string) {
    const mapDef = mapById(this.mapId);
    this.builtMap = buildMap(this.scene, mapDef);
    this.scene.add(this.starGroup);
    this.online = false;
    this.net = new NetClient();
    this.ui.toast('Conectare la server…');
    this.net.onStatus = (ok) => {
      if (ok) {
        this.online = true;
        this.ui.toast('ONLINE — meci sincronizat cu serverul');
      } else {
        // fallback instant la boți, fără să stricăm meciul
        if (!this.match) {
          this.ui.toast('Server indisponibil — joc cu BOȚI (offline)');
          this.startOffline(modeId, heroId, playerName, mapDef.id);
        } else {
          this.ui.toast('Conexiune pierdută — continui offline');
          this.online = false;
        }
      }
    };
    this.net.onSnap = (s) => {
      this.remoteFighters.clear();
      for (const f of s.fighters) this.remoteFighters.set(f.id, f);
      this.remoteBullets = s.bullets;
      this.remoteStars = s.stars;
      this.remoteScore = { a: s.scoreA, b: s.scoreB };
      if (this.net && this.localId === 0) {
        const me = s.fighters.find((f) => f.id === this.net!.myId);
        if (me) {
          this.localId = me.id;
          if (!this.views.has(me.id)) {
            for (const f of s.fighters) this.spawnView(f.id, f.heroId, f.name, f.team);
          }
        }
      }
      // spawn vederi noi
      for (const f of s.fighters) {
        if (!this.views.has(f.id)) this.spawnView(f.id, f.heroId, f.name, f.team);
      }
      if (s.over && !this.remoteOver) {
        this.remoteOver = true;
        this.remoteWinner = s.winner;
        this.endOnline(s.winner);
      }
    };
    this.net.onEvent = (e, a) => this.handleNetEvent(e, a);
    this.net.onReward = (r) => {
      this.lastReward = r;
      if (Auth.loggedIn) {
        Auth.applyReward(r);
      } else {
        save.data.coins += r.coins;
        save.data.xp += r.xp;
        save.data.trophies = Math.max(0, save.data.trophies + r.trophies);
        save.save();
      }
    };
    this.net.onProfile = (p) => Auth.setProfile(p);
    this.net.connect({
      name: playerName, heroId, modeId, room,
      token: Auth.loggedIn ? Auth.token : undefined,
    });
    audio.startMusic(true);
  }

  private handleNetEvent(e: string, a: unknown) {
    const d = a as { x?: number; z?: number; id?: number; killer?: number; damage?: number };
    if (e === 'shoot') {
      const f = d.id !== undefined ? this.remoteFighters.get(d.id) : undefined;
      audio.sfx('shoot');
      if (f) this.particles.spawn(f.x, 1.2, f.z, 0xffe066, 4, 3, 0.3);
    } else if (e === 'super') {
      audio.sfx('super');
      this.shake.add(0.35);
    } else if (e === 'hit' && d.x !== undefined) {
      audio.sfx('hit');
      this.particles.spawn(d.x, 1.2, d.z!, 0xff5a5a, 8, 5, 0.4);
    } else if (e === 'ko') {
      audio.sfx('ko');
      this.shake.add(0.5);
      if (d.x !== undefined) {
        this.particles.spawn(d.x, 1, d.z!, 0xff9f1c, 22, 8, 0.7);
        this.w2s(d.x, 1.5, d.z!, (p) =>
          this.floaters.spawn(() => p, d.x!, 2, d.z!, 'KO!', 'ko'));
      }
    }
  }

  stopToMenu() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.cleanup();
    this.controls.setVisible(false);
    this.ui.hideMatchUI();
    audio.stopMusic();
    audio.startMusic(false);
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  private cleanup() {
    this.net?.disconnect();
    this.net = null;
    this.online = false;
    this.match = null;
    if (this.showcaseRig && this.showcaseGroup) {
      this.scene.remove(this.showcaseGroup);
      this.showcaseRig = null;
      this.showcaseGroup = null;
    }
    for (const [, v] of this.views) {
      this.scene.remove(v.rig.group);
      v.barTex.dispose();
      (v.bar.material as THREE.Material).dispose();
    }
    this.views.clear();
    for (const m of this.bulletMeshes) this.scene.remove(m);
    this.bulletMeshes = [];
    for (const [, m] of this.starMeshes) this.starGroup.remove(m);
    this.starMeshes.clear();
    this.scene.remove(this.starGroup);
    this.builtMap?.dispose();
    this.builtMap = null;
    this.remoteFighters.clear();
    this.remoteBullets = [];
    this.remoteStars = [];
    this.remoteOver = false;
    this.localId = 0;
    this.lastReward = null;
    this.kills = 0;
    this.starsCollected = 0;
    this.supersUsed = 0;
    this.state = 'idle';
  }

  // ---------- vederi ----------

  private spawnView(id: number, heroId: string, name: string, team: number) {
    const def = heroById(heroId);
    const rig = buildHero(def, Shop.equippedColor(heroId, def.color));
    rig.setTeamColor(team === 0 ? 0x2d7dff : 0xff3b6b);
    this.scene.add(rig.group);
    // bară HP + nume
    const cnv = document.createElement('canvas');
    cnv.width = 128; cnv.height = 32;
    const ctx = cnv.getContext('2d')!;
    const tex = new THREE.CanvasTexture(cnv);
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    bar.scale.set(2.2, 0.55, 1);
    bar.position.y = 2.6;
    rig.group.add(bar);
    this.views.set(id, { rig, bar, barCanvas: cnv, barCtx: ctx, barTex: tex, lastHp: -1, name });
    audio.sfx('spawn');
  }

  private drawBar(v: RigView, hp: number, maxHp: number) {
    if (Math.abs(hp - v.lastHp) < 1) return;
    v.lastHp = hp;
    const c = v.barCtx;
    c.clearRect(0, 0, 128, 32);
    c.font = 'bold 13px system-ui';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(14, 0, 100, 16);
    c.fillStyle = '#fff';
    c.fillText(v.name.slice(0, 10), 64, 13);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(14, 17, 100, 9);
    const pct = clamp(hp / maxHp, 0, 1);
    c.fillStyle = pct > 0.5 ? '#3ddc84' : pct > 0.25 ? '#ffb020' : '#ff3b6b';
    c.fillRect(15, 18, 98 * pct, 7);
    v.barTex.needsUpdate = true;
  }

  private localFighter(): SimFighter | undefined {
    return this.match?.fighters.find((f) => f.id === this.localId);
  }

  // ---------- frame ----------

  private lastT = 0;
  private acc = 0;
  private lastRender = 0;

  private frame(t: number) {
    const now = t / 1000;
    let dt = Math.min(0.1, now - (this.lastT || now));
    this.lastT = now;
    this.clock += dt;

    // Cap FPS real conform setări: simularea rulează mereu, randarea sare
    // când frame-ul vine prea devreme. 120 pe ecran de 60/90Hz = fiecare vsync.
    const target = settings.data.fpsTarget;
    const nowMs = performance.now();
    const doRender = this.lastRender <= 0 || nowMs - this.lastRender >= 1000 / target - 1.5;
    if (doRender) {
      this.lastRender = nowMs;
      perf.frame(nowMs, this.renderer.info.render);
    }

    if (!this.paused) {
      if (this.state === 'countdown') {
        const prev = Math.ceil(this.countdownT);
        this.countdownT -= dt;
        const cur = Math.ceil(this.countdownT);
        if (cur !== prev && cur > 0) {
          this.ui.countdown(String(cur));
          audio.sfx('countdown');
        }
        if (this.countdownT <= 0) {
          this.state = 'battle';
          this.ui.countdown('LUPTĂ!');
          audio.sfx('super');
          window.setTimeout(() => this.ui.countdown(''), 700);
        }
      } else if (this.state === 'battle') {
        if (this.online && this.net?.online) this.tickOnline(dt);
        else if (this.match) this.tickOffline(dt);
      } else if (this.state === 'idle' && this.showcaseRig && this.showcaseGroup) {
        // vitrină meniu: rotație erou + particule orbitale
        this.showcaseRig.group.rotation.y += dt * 0.7;
        this.showcaseRig.update(dt, false, this.clock);
        for (const child of this.showcaseGroup.children) {
          const u = child.userData as { a?: number; r?: number; sp?: number; y?: number };
          if (u.a === undefined) continue;
          u.a += dt * (u.sp ?? 0.5) * 0.4;
          child.position.x = Math.cos(u.a) * (u.r ?? 4);
          child.position.z = Math.sin(u.a) * (u.r ?? 4);
          child.position.y = (u.y ?? 2) + Math.sin(this.clock + u.a * 3) * 0.4;
        }
      }
      this.updateVisuals(dt);
    }
    // cameră + randare (randarea poate sări conform plafonului FPS)
    this.updateCamera(dt);
    this.particles.update(dt);
    this.shake.update(dt);
    if (doRender) this.renderer.render(this.scene, this.camera);
  }

  // ----- offline sim -----

  private tickOffline(dt: number) {
    const m = this.match!;
    this.matchTime += dt;
    const inputs = new Map<number, SimInput>();

    for (const f of m.fighters) {
      if (f.isLocal) {
        inputs.set(f.id, this.readLocalInput(f));
      } else {
        inputs.set(f.id, botInput(m, f, dt));
      }
    }
    // pași ficși de 1/60 pentru stabilitate
    this.acc += dt;
    const step = 1 / 60;
    let n = 0;
    while (this.acc >= step && n < 4) {
      m.update(step, inputs);
      this.acc -= step;
      n++;
      // input edge (attack/super) doar pe primul pas
      for (const [, inp] of inputs) {
        inp.attack = false;
        inp.super = false;
      }
    }
    for (const e of m.drain()) this.handleEvent(e);
    if (m.over) this.endOffline(m.winner, m.endReason);
    this.pushHudOffline();
  }

  private readLocalInput(f: SimFighter): SimInput {
    this.controls.pollKeyboard(this.canvas, this.mouseAim, { x: f.x, z: f.z });
    let { x: mx, z: mz } = this.controls.moveVec;
    let { x: ax, z: az } = this.controls.aimVec;
    // auto-aim: dacă jucătorul nu țintește manual, ia cel mai apropiat inamic vizibil
    const manual = this.controls.state.aiming;
    if (manual) this.aimManualT = 1.2;
    else this.aimManualT -= 1 / 60;
    if (this.aimManualT <= 0 && settings.data.autoAim && this.match && this.builtMap) {
      const m = this.match;
      let best: SimFighter | null = null;
      let bd = f.def.sightRange;
      for (const e of m.fighters) {
        if (!e.alive || e.id === f.id) continue;
        if (m.modeId !== 'showdown' && e.team === f.team) continue;
        if (e.aiMode === 'dummy' && m.modeId !== 'training') continue;
        const d = Math.hypot(e.x - f.x, e.z - f.z);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (best) {
        const dx = best.x - f.x, dz = best.z - f.z;
        const l = Math.hypot(dx, dz) || 1;
        ax = dx / l;
        az = dz / l;
      }
    }
    const attack = this.controls.consumeAttack();
    const usedSuper = this.controls.consumeSuper();
    // butonul ATAC fără aim manual -> trage spre auto-aim curent
    return { mx, mz, ax, az, attack, super: usedSuper };
  }

  private handleEvent(e: ReturnType<Match['drain']>[number]) {
    const m = this.match!;
    if (e.type === 'shoot') {
      const f = m.fighters.find((x) => x.id === e.id);
      const v = this.views.get(e.id);
      v?.rig.playAttack();
      audio.sfx('shoot');
      if (f && v) {
        this.particles.spawn(f.x + Math.sin(f.facing), 1.2, f.z + Math.cos(f.facing), 0xffe066, 3, 2, 0.25);
      }
    } else if (e.type === 'super') {
      const f = m.fighters.find((x) => x.id === e.id);
      audio.sfx('super');
      this.shake.add(0.3);
      if (f) {
        this.particles.spawn(f.x, 1, f.z, 0xff9f1c, 18, 7, 0.6);
        if (f.isLocal) {
          this.supersUsed++;
          this.vibrate(40);
        }
      }
    } else if (e.type === 'hit') {
      if (e.damage > 0) {
        audio.sfx('hit');
        this.particles.spawn(e.x, 1.2, e.z, 0xff5a5a, 7, 5, 0.35);
        this.w2s(e.x, 1.8, e.z, (p) =>
          this.floaters.spawn(() => p, e.x, 2, e.z, `-${e.damage}`, 'dmg'));
        const f = m.fighters.find((x) => x.id === e.id);
        if (f?.isLocal) {
          this.shake.add(0.18);
          audio.sfx('hurt');
          this.vibrate(25);
        }
      } else {
        this.particles.spawn(e.x, 1.2, e.z, 0x8fa0c8, 4, 3, 0.3);
      }
    } else if (e.type === 'ko') {
      const victim = m.fighters.find((x) => x.id === e.id);
      const killer = m.fighters.find((x) => x.id === e.killer);
      audio.sfx('ko');
      this.shake.add(0.45);
      this.vibrate(50);
      this.particles.spawn(e.x, 1, e.z, 0xff9f1c, 24, 8, 0.7);
      this.particles.spawn(e.x, 1, e.z, victim?.team === 0 ? 0x2d7dff : 0xff3b6b, 12, 5, 0.5);
      this.w2s(e.x, 1.5, e.z, (p) =>
        this.floaters.spawn(() => p, e.x, 2, e.z, 'KO!', 'ko'));
      const kn = killer ? killer.name : 'Arena';
      this.ui.killfeed(`💀 ${kn} → ${victim?.name ?? '?'}`);
      const local = this.localFighter();
      if (killer?.isLocal) {
        this.kills++;
        this.w2s(e.x, 1.5, e.z, (p) =>
          this.floaters.spawn(() => p, e.x, 2.4, e.z, '+1 ELIMINARE', 'heal'));
      }
      if (victim && local && victim.team !== local.team) {
        // stea căzută etc — nimic special
      }
      if (victim?.isLocal) {
        this.ui.respawn(3);
      }
      // animație moarte
      const v = this.views.get(e.id);
      if (v) v.rig.playDeath(() => { /* rămâne ascuns până la respawn */ });
    } else if (e.type === 'spawn') {
      const f = m.fighters.find((x) => x.id === e.id);
      const v = this.views.get(e.id);
      if (f && v) {
        v.rig.group.scale.setScalar(1);
        v.rig.group.rotation.z = 0;
        this.particles.spawn(f.x, 0.5, f.z, 0x7af0ff, 12, 4, 0.5);
        audio.sfx('spawn');
        if (f.isLocal) this.ui.respawn(0);
      }
    } else if (e.type === 'pickup') {
      const f = m.fighters.find((x) => x.id === e.id);
      audio.sfx('coin');
      if (f?.isLocal) {
        this.starsCollected++;
        this.w2s(f.x, 1.5, f.z, (p) =>
          this.floaters.spawn(() => p, f.x, 2, f.z, '+1 ⭐', 'heal'));
      }
    } else if (e.type === 'end') {
      // gestionat de tick
    }
  }

  private pushHudOffline() {
    const m = this.match!;
    const local = this.localFighter();
    if (!local) return;
    const alive = m.fighters.filter((f) => f.alive).length;
    this.ui.updateHud({
      hp: Math.max(0, local.hp), maxHp: local.def.hp,
      superReady: local.superReady,
      superPct: local.superReady ? 1 : local.superCharge / local.def.superCooldownHits,
      scoreA: m.scoreA, scoreB: m.scoreB,
      time: this.matchTime,
      stars: this.modeId === 'starrush' ? local.stars : this.kills,
      kills: this.kills,
      alive, total: m.fighters.length,
      holdT: m.holdT, holding: m.holdingTeam === local.team,
    });
    if (!local.alive) {
      this.ui.respawn(Math.max(0, local.respawnT));
    }
  }

  private endOffline(winner: number, reason: string) {
    if (this.state === 'end') return;
    this.state = 'end';
    const local = this.localFighter();
    const won = this.modeId === 'showdown'
      ? !!local?.alive
      : local
        ? local.team === winner
        : false;
    const starPlayer = this.kills >= 3;
    const res = Progression.applyMatch({
      won, kills: this.kills, stars: this.starsCollected,
      supers: this.supersUsed, isStarPlayer: starPlayer, modeId: this.modeId,
    });
    if (won) {
      audio.sfx('win');
      this.ui.banner('VICTORIE!', reason);
    } else {
      audio.sfx('lose');
      this.ui.banner('ÎNFRÂNGERE', reason);
    }
    window.setTimeout(() => {
      this.ui.showEnd({
        won,
        title: won ? 'VICTORIE!' : 'ÎNFRÂNGERE',
        reason,
        kills: this.kills,
        coins: res.coins, xp: res.xp,
        trophies: save.data.trophies,
        starPlayer,
      });
    }, 1400);
  }

  // ----- online tick: trimite input, randează snapshot-uri -----

  private tickOnline(dt: number) {
    this.matchTime += dt;
    const me = this.remoteFighters.get(this.localId);
    this.inputT -= dt;
    if (this.inputT <= 0) {
      this.inputT = 1 / 20;
      // input local relativ la poziția din snapshot
      const px = me?.x ?? 0, pz = me?.z ?? 0;
      this.controls.pollKeyboard(this.canvas, this.mouseAim, { x: px, z: pz });
      const mv = this.controls.moveVec;
      const av = this.controls.aimVec;
      this.net?.send({
        t: 'input',
        mx: mv.x, mz: mv.z, ax: av.x, az: av.z,
        attack: this.controls.consumeAttack(),
        super: this.controls.consumeSuper(),
      });
    }
    // HUD din snapshot
    if (me) {
      this.ui.updateHud({
        hp: Math.max(0, me.hp), maxHp: me.maxHp,
        superReady: me.superReady,
        superPct: me.superReady ? 1 : 0.5,
        scoreA: this.remoteScore.a, scoreB: this.remoteScore.b,
        time: this.matchTime, stars: me.stars, kills: me.kills,
        alive: [...this.remoteFighters.values()].filter((f) => f.alive).length,
        total: this.remoteFighters.size,
        holdT: 0, holding: false,
      });
      if (!me.alive) this.ui.respawn(2);
      else this.ui.respawn(0);
    }
  }

  private endOnline(winner: number) {
    if (this.state === 'end') return;
    this.state = 'end';
    const me = this.remoteFighters.get(this.localId);
    const won = me ? me.team === winner : false;
    if (won) {
      audio.sfx('win');
      this.ui.banner('VICTORIE!', 'Serverul a validat rezultatul.');
    } else {
      audio.sfx('lose');
      this.ui.banner('ÎNFRÂNGERE', 'Serverul a validat rezultatul.');
    }
    window.setTimeout(() => {
      const rw = this.lastReward ?? { coins: 0, xp: 0, trophies: 0 };
      const troph = Auth.loggedIn && Auth.profile ? Auth.profile.trophies : save.data.trophies;
      this.ui.showEnd({
        won, title: won ? 'VICTORIE!' : 'ÎNFRÂNGERE',
        reason: 'Meci online validat de server.',
        kills: me?.kills ?? 0, coins: rw.coins, xp: rw.xp,
        trophies: troph, starPlayer: false,
      });
    }, 1400);
  }

  // ---------- vederi per frame ----------

  private updateVisuals(dt: number) {
    if (this.match && !this.online) {
      // offline: poziții din sim
      for (const f of this.match.fighters) {
        const v = this.views.get(f.id);
        if (!v) continue;
        const moving = f.alive && this.lastMoveMag(f) > 0.1;
        // ascunde inamicii în tufiș (stealth ca în hero brawlere)
        const hidden = this.shouldHide(f);
        v.rig.group.visible = f.alive || !f.alive ? true : true;
        if (!f.alive) {
          // moartea e animată prin playDeath; după animație ascundem
          if (v.rig.group.scale.x < 0.05) v.rig.group.visible = false;
        } else {
          v.rig.group.visible = !hidden;
          if (v.rig.group.scale.x < 0.5) {
            v.rig.group.scale.setScalar(1);
            v.rig.group.rotation.z = 0;
          }
        }
        v.rig.group.position.set(f.x, 0, f.z);
        v.rig.group.rotation.y = f.facing;
        v.rig.update(dt, moving, this.clock);
        v.bar.visible = f.alive && !hidden;
        v.bar.position.y = 2.6;
        this.drawBar(v, f.hp, f.def.hp);
      }
      // gloanțe: pool de mesh-uri sincronizat 1:1 cu sim-ul
      this.syncBullets(this.match.bullets.map((b) => ({
        x: b.x, z: b.z, super: b.isSuper, color: b.color,
      })));
      this.syncStars(this.match.stars.map((s) => ({ id: s.id, x: s.x, z: s.z })));
    } else if (this.online || this.remoteFighters.size > 0) {
      // online: interpolare spre snapshot
      const k = Math.min(1, dt * 10);
      for (const [id, f] of this.remoteFighters) {
        const v = this.views.get(id);
        if (!v) continue;
        const g = v.rig.group;
        g.position.x += (f.x - g.position.x) * k;
        g.position.z += (f.z - g.position.z) * k;
        g.rotation.y = f.facing;
        g.visible = f.alive;
        v.rig.update(dt, true, this.clock);
        this.drawBar(v, f.hp, f.maxHp);
        v.bar.visible = f.alive;
      }
      this.syncBullets(this.remoteBullets);
      this.syncStars(this.remoteStars);
    }
    // pulsație stele
    const t = this.clock * 3;
    for (const [, m] of this.starMeshes) {
      m.rotation.y += dt * 2;
      m.position.y = 0.7 + Math.sin(t + m.position.x) * 0.15;
    }
  }

  private lastMoveMag(_f: SimFighter): number {
    void _f;
    // aproximare: eroul local se mișcă dacă joystick-ul e activ; boții — mereu animați
    if (_f.isLocal) {
      const mv = this.controls.moveVec;
      return Math.hypot(mv.x, mv.z);
    }
    return 0.5;
  }

  private shouldHide(f: SimFighter): boolean {
    if (!this.builtMap || !this.match) return false;
    const local = this.localFighter();
    if (!local || f.id === local.id) return false;
    if (this.match.modeId !== 'showdown' && f.team === local.team) return false;
    if (!inBush(this.builtMap.bushes, f.x, f.z)) return false;
    // vizibil dacă localul e în același tufiș sau foarte aproape
    if (inBush(this.builtMap.bushes, local.x, local.z)) return false;
    if (Math.hypot(f.x - local.x, f.z - local.z) < 3) return false;
    return true;
  }

  private syncBullets(list: { x: number; z: number; super: boolean; color: number }[]) {
    while (this.bulletMeshes.length < list.length) {
      const m = new THREE.Mesh(
        this.bulletGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      m.visible = false;
      this.scene.add(m);
      this.bulletMeshes.push(m);
    }
    for (let i = 0; i < this.bulletMeshes.length; i++) {
      const mesh = this.bulletMeshes[i];
      if (i < list.length) {
        const b = list[i];
        mesh.visible = true;
        mesh.position.set(b.x, 1.0, b.z);
        (mesh.material as THREE.MeshBasicMaterial).color.setHex(b.color);
        mesh.scale.setScalar(b.super ? 1.6 : 1);
      } else {
        mesh.visible = false;
      }
    }
    // trail discret
    if (list.length > 0 && Math.random() < 0.5) {
      const b = list[Math.floor(Math.random() * list.length)];
      this.particles.spawn(b.x, 1.0, b.z, b.color, 1, 1, 0.25);
    }
  }

  private syncStars(list: { id: number; x: number; z: number }[]) {
    const seen = new Set<number>();
    for (const s of list) {
      seen.add(s.id);
      let m = this.starMeshes.get(s.id);
      if (!m) {
        m = new THREE.Mesh(this.starGeo, this.starMat);
        this.starGroup.add(m);
        this.starMeshes.set(s.id, m);
      }
      m.position.set(s.x, 0.7, s.z);
    }
    for (const [id, m] of [...this.starMeshes]) {
      if (!seen.has(id)) {
        this.starGroup.remove(m);
        this.starMeshes.delete(id);
      }
    }
  }

  private updateCamera(_dt: number) {
    void _dt;
    if (this.showcaseRig) {
      // cinematică orbitală în meniu
      const a = this.clock * 0.25;
      this.camera.position.set(Math.sin(a) * 6.5, 3.6, Math.cos(a) * 6.5);
      this.camera.lookAt(0, 1.2, 0);
      return;
    }
    let tx = 0, tz = 2;
    if (this.match && !this.online) {
      const local = this.localFighter();
      if (local) {
        tx = local.x;
        tz = local.z;
      }
    } else if (this.remoteFighters.has(this.localId)) {
      const me = this.remoteFighters.get(this.localId)!;
      const v = this.views.get(this.localId);
      tx = v ? v.rig.group.position.x : me.x;
      tz = v ? v.rig.group.position.z : me.z;
    }
    const sh = this.shake.offset;
    const H = 21, BACK = 11;
    this.camera.position.set(tx + sh.x, H, tz + BACK + sh.y);
    this.camera.lookAt(tx + sh.x * 0.5, 0, tz - 1);
  }

  private w2s(x: number, y: number, z: number, cb: (p: { x: number; y: number }) => void) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return;
    cb({
      x: ((v.x + 1) / 2) * window.innerWidth,
      y: ((-v.y + 1) / 2) * window.innerHeight,
    });
  }

  private vibrate(ms: number) {
    void ms;
    if (settings.data.vibration && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch { /* noop */ }
    }
  }

  get isRunning() {
    return this.running;
  }
}
