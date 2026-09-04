import { heroById, scaleHeroDef, type HeroDef } from '../data/heroes';
import type { MapDef } from '../data/maps';
import { clamp, dist2d, uid } from '../utils/math';

// Simulare pură (fără Three.js) — poate rula și pe server (authoritative).
export interface SimInput {
  mx: number; mz: number;
  ax: number; az: number;
  attack: boolean;
  super: boolean;
}

export interface SimFighter {
  id: number;
  name: string;
  heroId: string;
  def: HeroDef;
  team: number;
  isBot: boolean;
  isLocal: boolean;
  x: number; z: number;
  facing: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnT: number;
  reloadT: number;
  ammo: number;       // gloanțe curente (max = def.ammoMax, divers per erou)
  ammoT: number;      // timer regenerare 1 glonț
  gadget?: string;    // gadget pasiv echipat
  superCharge: number;
  superReady: boolean;
  supersUsed: number;
  kills: number;
  deaths: number;
  stars: number;
  power: number;    // nivel putere erou (1-11)
  powerups: number; // cuburi din cutii (showdown): +10% damage fiecare
  // bot brain
  aiT: number; aiTx: number; aiTz: number;
  aiMode: 'fight' | 'star' | 'flee' | 'dummy';
  // anti-blocare în ziduri (opționale — serverul le poate omite la construcție)
  stuckT?: number; lx?: number; lz?: number;
}

export interface SimBullet {
  id: number;
  x: number; z: number;
  dx: number; dz: number;
  speed: number; dist: number; maxDist: number;
  damage: number; team: number; ownerId: number;
  isSuper: boolean;
  color: number;
  big: boolean;      // proiectil mare (lob/wave/mortar) — rază + vizual
  pierce: boolean;   // străpunge (lovește mai mulți)
  arcing: boolean;   // bombă pe sus — trece peste ziduri
  hitIds?: number[]; // deja loviți (doar pierce)
}

export interface CrateDef { id: number; x: number; z: number; hp: number }
export interface CubeDrop { id: number; x: number; z: number }
export interface SafeState { team: number; hp: number; maxHp: number; x: number; z: number }

export interface StarDrop { id: number; x: number; z: number }

export type MatchEvent =
  | { type: 'shoot'; id: number; x: number; z: number; super: boolean }
  | { type: 'hit'; id: number; x: number; z: number; damage: number }
  | { type: 'ko'; id: number; killer: number; x: number; z: number }
  | { type: 'spawn'; id: number }
  | { type: 'pickup'; id: number; starId: number }
  | { type: 'powerup'; id: number }
  | { type: 'crate'; id: number; x: number; z: number }
  | { type: 'super'; id: number }
  | { type: 'end'; winner: number; reason: string };

export interface PlayerSpec {
  name: string;
  heroId: string;
  team: number;
  isBot: boolean;
  isLocal?: boolean;
  power?: number; // nivel putere 1-11 (scalare stat-uri)
  gadget?: string; // id gadget pasiv echipat
}

const WALL_PAD = 0.7;

function collide(
  walls: { minX: number; maxX: number; minZ: number; maxZ: number }[],
  half: number, x: number, z: number, r: number
): { x: number; z: number } {
  x = clamp(x, -half, half);
  z = clamp(z, -half, half);
  for (const w of walls) {
    const cx = clamp(x, w.minX, w.maxX);
    const cz = clamp(z, w.minZ, w.maxZ);
    const dx = x - cx, dz = z - cz;
    const d = Math.hypot(dx, dz);
    if (d < r) {
      if (d > 0.0001) {
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        const pl = x - w.minX, pr = w.maxX - x;
        const pu = z - w.minZ, pd = w.maxZ - z;
        const m = Math.min(pl, pr, pu, pd);
        if (m === pl) x = w.minX - r;
        else if (m === pr) x = w.maxX + r;
        else if (m === pu) z = w.minZ - r;
        else z = w.maxZ + r;
      }
    }
  }
  return { x, z };
}

function pointInWalls(
  walls: { minX: number; maxX: number; minZ: number; maxZ: number }[],
  x: number, z: number
): boolean {
  for (const w of walls) {
    if (x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ) return true;
  }
  return false;
}

export class Match {
  fighters: SimFighter[] = [];
  bullets: SimBullet[] = [];
  stars: StarDrop[] = [];
  events: MatchEvent[] = [];
  modeId: string;
  map: MapDef;
  walls: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  time = 0;
  over = false;
  winner = -1;
  endReason = '';
  scoreA = 0;
  scoreB = 0;
  holdT = 0; // starrush/gemgrab countdown
  holdingTeam = -1;
  starT = 0;
  gasR = 0; // showdown: raza zonei sigure (se strânge continuu)
  crates: CrateDef[] = [];
  cubes: CubeDrop[] = [];
  safes: SafeState[] = [];
  private spawnIdxA = 0;
  private spawnIdxB = 0;

  constructor(modeId: string, map: MapDef, specs: PlayerSpec[]) {
    this.modeId = modeId;
    this.map = map;
    const half = map.size / 2;
    this.walls = map.walls.map((w) => ({
      minX: w.x - w.w / 2, maxX: w.x + w.w / 2,
      minZ: w.z - w.d / 2, maxZ: w.z + w.d / 2,
    }));
    void half;
    specs.forEach((s, i) => {
      let def = scaleHeroDef(heroById(s.heroId), s.power ?? 1);
      // gadgeturi pasive (aplicate la naștere)
      if (s.gadget === 'sprint') def = { ...def, speed: def.speed * 1.1 };
      if (s.gadget === 'furie') {
        def = { ...def, superCooldownHits: Math.max(3, def.superCooldownHits - 2) };
      }
      const maxHp = def.hp + (s.gadget === 'scut' ? 800 : 0);
      const sp = this.spawnPoint(s.team, i);
      this.fighters.push({
        id: uid(),
        name: s.name, heroId: s.heroId, def,
        team: s.team, isBot: s.isBot, isLocal: !!s.isLocal,
        x: sp.x, z: sp.z, facing: 0,
        hp: maxHp, maxHp, alive: true, respawnT: 0, reloadT: 0,
        ammo: def.ammoMax, ammoT: 0,
        gadget: s.gadget,
        superCharge: 0, superReady: false, supersUsed: 0,
        kills: 0, deaths: 0, stars: 0,
        power: Math.max(1, Math.min(11, Math.round(s.power ?? 1))),
        powerups: 0,
        aiT: Math.random() * 2, aiTx: 0, aiTz: 0,
        aiMode: modeId === 'training' && s.isBot ? 'dummy' : 'fight',
      });
    });
    // stele/geme inițiale
    if (modeId === 'starrush') {
      this.dropStar(0, 0);
      this.dropStar(2, 1);
      this.dropStar(-2, -1);
    }
    if (modeId === 'gemgrab') {
      this.dropStar(0, 0);
    }
    // cutii distructibile (showdown): spargi → cuburi de putere
    if (modeId === 'showdown') {
      for (const c of map.crates ?? []) {
        this.crates.push({ id: uid(), x: c.x, z: c.z, hp: 900 });
      }
      this.gasR = (map.size / 2) * 1.35;
    }
    // seifuri (heist)
    if (modeId === 'heist') {
      for (const s of map.safes ?? []) {
        this.safes.push({ team: s.team, hp: 12000, maxHp: 12000, x: s.x, z: s.z });
      }
    }
  }

  private spawnPoint(team: number, i: number) {
    if (this.modeId === 'showdown') {
      // cerc scalat cu harta (hărți mari de showdown)
      const r = (this.map.size / 2) * 0.72;
      const n = this.fighters.length + 1;
      const a = (i / 10) * Math.PI * 2;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, n };
    }
    const arr = team === 0 ? this.map.spawnsA : this.map.spawnsB;
    const s = arr[(team === 0 ? this.spawnIdxA++ : this.spawnIdxB++) % arr.length];
    return { x: s.x, z: s.z };
  }

  private dropStar(x: number, z: number) {
    this.stars.push({ id: uid(), x: clamp(x, -15, 15), z: clamp(z, -15, 15) });
  }

  local(): SimFighter | undefined {
    return this.fighters.find((f) => f.isLocal);
  }

  update(dt: number, inputs: Map<number, SimInput>) {
    if (this.over) return;
    this.time += dt;
    const half = this.map.size / 2;

    // --- input + mișcare ---
    for (const f of this.fighters) {
      if (!f.alive) {
        f.respawnT -= dt;
        if (f.respawnT <= 0 && this.modeId !== 'showdown') {
          const sp = this.spawnPoint(f.team, f.id);
          f.x = sp.x; f.z = sp.z;
          f.hp = f.maxHp;
          f.ammo = f.def.ammoMax; f.ammoT = 0;
          f.alive = true;
          this.events.push({ type: 'spawn', id: f.id });
        }
        continue;
      }
      f.reloadT -= dt;
      // regenerare ammo: 1 glonț per ciclu (max = specific eroului)
      if (f.ammo < f.def.ammoMax) {
        f.ammoT += dt;
        if (f.ammoT >= f.def.reloadMs / 1000) {
          f.ammoT = 0;
          f.ammo++;
        }
      }
      const inp = inputs.get(f.id);
      if (inp) {
        const l = Math.hypot(inp.mx, inp.mz);
        const wantFire = inp.attack && f.reloadT <= 0 && f.ammo > 0;
        const wantSuper = inp.super && f.superReady;
        const aimL = Math.hypot(inp.ax, inp.az);
        if (l > 0.12) {
          const sp = f.def.speed * Math.min(1, l);
          const p = collide(this.walls, half, f.x + inp.mx * sp * dt, f.z + inp.mz * sp * dt, WALL_PAD);
          f.x = p.x; f.z = p.z;
        }
        if ((wantFire || wantSuper) && aimL > 0.15) {
          // la foc, aim-ul câștigă (strafe ca în Brawl), nu direcția de mers
          f.facing = Math.atan2(inp.ax, inp.az);
        } else if (l > 0.12) {
          // altfel eroul se uită unde merge
          f.facing = Math.atan2(inp.mx, inp.mz);
        }
        if (wantFire) this.fire(f, false);
        if (wantSuper) this.fire(f, true);
      }
    }

    // --- proiectile ---
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const step = b.speed * dt;
      b.x += b.dx * step;
      b.z += b.dz * step;
      b.dist += step;
      let dead = b.dist >= b.maxDist || Math.abs(b.x) > half + 1 || Math.abs(b.z) > half + 1;
      // bombele arcuite trec peste ziduri, restul se sparg de ele
      if (!dead && !b.arcing && pointInWalls(this.walls, b.x, b.z)) {
        this.events.push({ type: 'hit', id: b.ownerId, x: b.x, z: b.z, damage: 0 });
        dead = true;
      }
      if (!dead) {
        const hitR = b.big ? 1.2 : 0.85;
        for (const f of this.fighters) {
          if (!f.alive || f.team === b.team) continue;
          // în showdown fiecare e propria echipă
          if (this.modeId === 'showdown' && f.id === b.ownerId) continue;
          if (b.pierce && b.hitIds?.includes(f.id)) continue;
          if (dist2d(b.x, b.z, f.x, f.z) < hitR) {
            const died = this.damage(f, b.damage, b.ownerId, b.dx, b.dz);
            this.events.push({ type: 'hit', id: f.id, x: f.x, z: f.z, damage: b.damage });
            void died;
            if (b.pierce) b.hitIds?.push(f.id);
            else { dead = true; break; }
          }
        }
      }
      // cutii distructibile (showdown): orice echipă le poate sparge
      if (!dead && this.crates.length > 0) {
        for (let ci = this.crates.length - 1; ci >= 0; ci--) {
          const c = this.crates[ci];
          if (dist2d(b.x, b.z, c.x, c.z) < 1.2) {
            c.hp -= b.damage;
            if (c.hp <= 0) {
              this.crates.splice(ci, 1);
              this.cubes.push({ id: uid(), x: c.x, z: c.z });
              this.events.push({ type: 'crate', id: c.id, x: c.x, z: c.z });
            } else {
              this.events.push({ type: 'hit', id: b.ownerId, x: b.x, z: b.z, damage: 0 });
            }
            if (!b.pierce) { dead = true; break; }
          }
        }
      }
      // seifuri (heist): doar echipa adversă le poate lovi
      if (!dead && this.safes.length > 0) {
        for (const s of this.safes) {
          if (s.team === b.team || s.hp <= 0) continue;
          if (dist2d(b.x, b.z, s.x, s.z) < 1.6) {
            s.hp -= b.damage;
            this.events.push({ type: 'hit', id: b.ownerId, x: b.x, z: b.z, damage: 0 });
            if (s.hp <= 0) {
              s.hp = 0;
              this.finish(b.team, `Seiful ${s.team === 0 ? 'ROȘU' : 'ALBASTRU'} a fost distrus!`);
            }
            if (!b.pierce) dead = true;
            break;
          }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }

    // --- stele / geme: starrush (centru) + gemgrab (mina) ---
    if (this.modeId === 'starrush' || this.modeId === 'gemgrab') {
      this.starT -= dt;
      const cap = this.modeId === 'gemgrab' ? 8 : 6;
      const every = this.modeId === 'gemgrab' ? 5 : 3;
      if (this.starT <= 0 && this.stars.length < cap) {
        this.starT = every;
        this.dropStar((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      }
      for (const f of this.fighters) {
        if (!f.alive) continue;
        for (let i = this.stars.length - 1; i >= 0; i--) {
          const s = this.stars[i];
          if (dist2d(f.x, f.z, s.x, s.z) < 1.1) {
            this.stars.splice(i, 1);
            f.stars++;
            this.events.push({ type: 'pickup', id: f.id, starId: s.id });
          }
        }
      }
      const countA = this.teamStars(0);
      const countB = this.teamStars(1);
      if (countA >= 10 || countB >= 10) {
        const t = countA >= 10 ? 0 : 1;
        if (this.holdingTeam !== t) {
          this.holdingTeam = t;
          this.holdT = 15;
        } else {
          this.holdT -= dt;
          if (this.holdT <= 0) {
            const what = this.modeId === 'gemgrab' ? 'gemele' : 'stelele';
            this.finish(t, `Echipa ${t === 0 ? 'ALBASTRĂ' : 'ROȘIE'} a păstrat ${what}!`);
          }
        }
      } else {
        this.holdingTeam = -1;
      }
      this.scoreA = countA;
      this.scoreB = countB;
    }

    if (this.modeId === 'knockout') {
      this.scoreA = this.teamKills(0);
      this.scoreB = this.teamKills(1);
      if (this.scoreA >= 8) this.finish(0, 'Echipa ALBASTRĂ a ajuns la 8 KO!');
      else if (this.scoreB >= 8) this.finish(1, 'Echipa ROȘIE a ajuns la 8 KO!');
      else if (this.time > 150) this.finish(this.scoreA === this.scoreB ? 0 : this.scoreA > this.scoreB ? 0 : 1, 'Timp expirat!');
    }

    // --- cuburi de putere (showdown) ---
    if (this.modeId === 'showdown' && this.cubes.length > 0) {
      for (const f of this.fighters) {
        if (!f.alive) continue;
        for (let i = this.cubes.length - 1; i >= 0; i--) {
          const c = this.cubes[i];
          if (dist2d(f.x, f.z, c.x, c.z) < 1.2) {
            this.cubes.splice(i, 1);
            f.powerups++;
            this.events.push({ type: 'powerup', id: f.id });
          }
        }
      }
    }

    if (this.modeId === 'showdown') {
      const alive = this.fighters.filter((f) => f.alive);
      if (alive.length <= 1 && this.fighters.length > 1) {
        this.finish(alive[0] ? alive[0].team : 0, `${alive[0]?.name ?? 'Nimeni'} e ultimul în viață!`, alive[0]?.id);
      }
      // gazul se strânge continuu de la început (hartă mare)
      const half = this.map.size / 2;
      this.gasR = Math.max(1.5, half * 1.35 - this.time * (half * 1.2 / 110));
      const dpsMul = 1 + Math.max(0, this.time - 60) / 30;
      for (const f of this.fighters) {
        if (!f.alive) continue;
        const d = Math.hypot(f.x, f.z);
        if (d > this.gasR) this.damage(f, f.def.hp * 0.045 * dpsMul * dt, -1, 0, 0);
      }
    }

    // --- heist: scor = viața seifurilor ---
    if (this.modeId === 'heist' && this.safes.length >= 2) {
      const sA = this.safes.find((s) => s.team === 0);
      const sB = this.safes.find((s) => s.team === 1);
      this.scoreA = sA ? Math.max(0, Math.round(sA.hp)) : 0;
      this.scoreB = sB ? Math.max(0, Math.round(sB.hp)) : 0;
      if (this.time > 180) {
        this.finish(
          this.scoreA === this.scoreB ? 0 : this.scoreA > this.scoreB ? 0 : 1,
          'Timp expirat! Câștigă seiful cel mai intact.'
        );
      }
    }
  }

  private teamStars(team: number) {
    return this.fighters.filter((f) => f.team === team).reduce((s, f) => s + f.stars, 0);
  }

  private teamKills(team: number) {
    return this.fighters.filter((f) => f.team === team).reduce((s, f) => s + f.kills, 0);
  }

  private fire(f: SimFighter, isSuper: boolean) {
    if (!isSuper) {
      if (f.ammo <= 0) return;
      f.ammo--;
      f.ammoT = 0;
    }
    const dx = Math.sin(f.facing), dz = Math.cos(f.facing);
    // bonus cuburi de putere (showdown): +10% damage fiecare
    const powMul = 1 + 0.1 * f.powerups;
    if (isSuper) {
      f.superCharge = 0;
      f.superReady = false;
      f.supersUsed++;
      const n = f.def.superCount;
      for (let i = 0; i < n; i++) {
        const spread = n > 1 ? (i - (n - 1) / 2) * 0.14 : 0;
        const c = Math.cos(spread), s = Math.sin(spread);
        this.bullets.push({
          id: uid(),
          x: f.x + dx * 0.8, z: f.z + dz * 0.8,
          dx: dx * c - dz * s, dz: dx * s + dz * c,
          speed: 16, dist: 0, maxDist: f.def.superRange,
          damage: Math.round(f.def.superDamage * powMul), team: f.team, ownerId: f.id,
          isSuper: true, color: 0xff9f1c, big: n === 1, pierce: false, arcing: false,
        });
      }
      f.reloadT = 0.4;
      this.events.push({ type: 'super', id: f.id });
    } else {
      const kind = f.def.kind;
      const n = kind === 'bolt' || kind === 'pierce'
        ? Math.max(1, Math.min(2, f.def.projectiles))
        : f.def.projectiles;
      const speed = kind === 'lob' ? 11 : kind === 'mortar' ? 9
        : kind === 'wave' ? 13 : kind === 'spread' ? 18
        : kind === 'pierce' ? 19 : 20;
      const gap = kind === 'spread' ? 0.22 : 0.14;
      const big = kind === 'lob' || kind === 'wave' || kind === 'mortar';
      const pierce = kind === 'pierce';
      const arcing = kind === 'lob' || kind === 'mortar'; // bomba pe sus, peste ziduri
      for (let i = 0; i < n; i++) {
        const spread = n > 1 ? (i - (n - 1) / 2) * gap : 0;
        const c = Math.cos(spread), s = Math.sin(spread);
        this.bullets.push({
          id: uid(),
          x: f.x + dx * 0.8, z: f.z + dz * 0.8,
          dx: dx * c - dz * s, dz: dx * s + dz * c,
          speed, dist: 0, maxDist: f.def.range,
          damage: Math.round(f.def.damage * powMul), team: f.team, ownerId: f.id,
          isSuper: false, color: f.def.accent, big, pierce, arcing,
          hitIds: pierce ? [] : undefined,
        });
      }
      // spam permis cât ai gloanțe: pauză scurtă între focuri
      f.reloadT = Math.min(0.32, (f.def.reloadMs / 1000) * 0.5);
      this.events.push({ type: 'shoot', id: f.id, x: f.x, z: f.z, super: false });
    }
  }

  useSuperPublic(f: SimFighter) {
    if (f.superReady && f.alive) this.fire(f, true);
  }

  /** Aplică damage. Returnează true dacă a murit. Serverul validează aceleași tabele. */
  damage(f: SimFighter, amount: number, killerId: number, kx: number, kz: number): boolean {
    if (!f.alive || this.over) return false;
    f.hp -= amount;
    const owner = this.fighters.find((x) => x.id === killerId);
    if (owner && owner.id !== f.id && amount > 0) {
      owner.superCharge++;
      if (owner.superCharge >= owner.def.superCooldownHits) owner.superReady = true;
      // vampir: 12% din damage revine ca viață
      if (owner.gadget === 'vampir' && owner.alive) {
        owner.hp = Math.min(owner.maxHp, owner.hp + amount * 0.12);
      }
    }
    // knockback ușor
    const p = collide(this.walls, this.map.size / 2, f.x + kx * 0.35, f.z + kz * 0.35, WALL_PAD);
    f.x = p.x; f.z = p.z;
    if (f.hp <= 0) {
      f.hp = 0;
      f.alive = false;
      f.deaths++;
      f.respawnT = this.modeId === 'training' ? 2 : 3;
      if (owner && owner.id !== f.id) owner.kills++;
      // drop stele/geme la moarte (starrush + gemgrab)
      if ((this.modeId === 'starrush' || this.modeId === 'gemgrab') && f.stars > 0) {
        for (let i = 0; i < f.stars; i++) this.dropStar(f.x + (Math.random() - 0.5) * 2, f.z + (Math.random() - 0.5) * 2);
        f.stars = 0;
      }
      // drop cuburi de putere la moarte (showdown)
      if (this.modeId === 'showdown' && f.powerups > 0) {
        for (let i = 0; i < f.powerups; i++) {
          this.cubes.push({ id: uid(), x: f.x + (Math.random() - 0.5) * 2, z: f.z + (Math.random() - 0.5) * 2 });
        }
        f.powerups = 0;
      }
      this.events.push({ type: 'ko', id: f.id, killer: killerId, x: f.x, z: f.z });
      // respawn dummies training cu HP plin
      if (f.aiMode === 'dummy') {
        f.hp = f.maxHp;
      }
      return true;
    }
    return false;
  }

  drain(): MatchEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  finish(winner: number, reason: string, winnerId?: number) {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    this.endReason = reason;
    this.events.push({ type: 'end', winner, reason });
    void winnerId;
  }
}
