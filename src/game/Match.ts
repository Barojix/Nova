import { heroById, type HeroDef } from '../data/heroes';
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
  alive: boolean;
  respawnT: number;
  reloadT: number;
  superCharge: number;
  superReady: boolean;
  kills: number;
  deaths: number;
  stars: number;
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
}

export interface StarDrop { id: number; x: number; z: number }

export type MatchEvent =
  | { type: 'shoot'; id: number; x: number; z: number; super: boolean }
  | { type: 'hit'; id: number; x: number; z: number; damage: number }
  | { type: 'ko'; id: number; killer: number; x: number; z: number }
  | { type: 'spawn'; id: number }
  | { type: 'pickup'; id: number; starId: number }
  | { type: 'super'; id: number }
  | { type: 'end'; winner: number; reason: string };

export interface PlayerSpec {
  name: string;
  heroId: string;
  team: number;
  isBot: boolean;
  isLocal?: boolean;
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
  holdT = 0; // starrush countdown
  holdingTeam = -1;
  starT = 0;
  gasT = 90; // showdown sudden death
  private spawnIdxA = 0;
  private spawnIdxB = 0;
  suddenDeath = false;

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
      const def = heroById(s.heroId);
      const sp = this.spawnPoint(s.team, i);
      this.fighters.push({
        id: uid(),
        name: s.name, heroId: s.heroId, def,
        team: s.team, isBot: s.isBot, isLocal: !!s.isLocal,
        x: sp.x, z: sp.z, facing: 0,
        hp: def.hp, alive: true, respawnT: 0, reloadT: 0,
        superCharge: 0, superReady: false,
        kills: 0, deaths: 0, stars: 0,
        aiT: Math.random() * 2, aiTx: 0, aiTz: 0,
        aiMode: modeId === 'training' && s.isBot ? 'dummy' : 'fight',
      });
    });
    // stea inițială pentru starrush
    if (modeId === 'starrush') {
      this.dropStar(0, 0);
      this.dropStar(2, 1);
      this.dropStar(-2, -1);
    }
  }

  private spawnPoint(team: number, i: number) {
    if (this.modeId === 'showdown') {
      const n = this.fighters.length + 1;
      const a = (i / 10) * Math.PI * 2;
      return { x: Math.cos(a) * 12, z: Math.sin(a) * 12, n };
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
          f.hp = f.def.hp;
          f.alive = true;
          this.events.push({ type: 'spawn', id: f.id });
        }
        continue;
      }
      f.reloadT -= dt;
      const inp = inputs.get(f.id);
      if (inp) {
        const l = Math.hypot(inp.mx, inp.mz);
        if (l > 0.12) {
          const sp = f.def.speed * Math.min(1, l);
          const p = collide(this.walls, half, f.x + inp.mx * sp * dt, f.z + inp.mz * sp * dt, WALL_PAD);
          f.x = p.x; f.z = p.z;
          if (Math.hypot(inp.ax, inp.az) < 0.1) f.facing = Math.atan2(inp.mx, inp.mz);
        }
        if (Math.hypot(inp.ax, inp.az) > 0.15) {
          f.facing = Math.atan2(inp.ax, inp.az);
        }
        if (inp.attack && f.reloadT <= 0) this.fire(f, false);
        if (inp.super && f.superReady) this.fire(f, true);
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
      if (!dead && pointInWalls(this.walls, b.x, b.z)) {
        this.events.push({ type: 'hit', id: b.ownerId, x: b.x, z: b.z, damage: 0 });
        dead = true;
      }
      if (!dead) {
        for (const f of this.fighters) {
          if (!f.alive || f.team === b.team) continue;
          // în showdown fiecare e propria echipă
          if (this.modeId === 'showdown' && f.id === b.ownerId) continue;
          if (dist2d(b.x, b.z, f.x, f.z) < 0.85) {
            const died = this.damage(f, b.damage, b.ownerId, b.dx, b.dz);
            this.events.push({ type: 'hit', id: f.id, x: f.x, z: f.z, damage: b.damage });
            void died;
            dead = true;
            break;
          }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }

    // --- stele ---
    if (this.modeId === 'starrush') {
      this.starT -= dt;
      if (this.starT <= 0 && this.stars.length < 6) {
        this.starT = 3;
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
          if (this.holdT <= 0) this.finish(t, `Echipa ${t === 0 ? 'ALBASTRĂ' : 'ROȘIE'} a păstrat stelele!`);
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

    if (this.modeId === 'showdown') {
      const alive = this.fighters.filter((f) => f.alive);
      if (alive.length <= 1 && this.fighters.length > 1) {
        this.finish(alive[0] ? alive[0].team : 0, `${alive[0]?.name ?? 'Nimeni'} e ultimul în viață!`, alive[0]?.id);
      }
      this.gasT -= dt;
      if (this.gasT <= 0 && !this.suddenDeath) this.suddenDeath = true;
      if (this.suddenDeath) {
        for (const f of this.fighters) {
          if (!f.alive) continue;
          const d = Math.hypot(f.x, f.z);
          if (d > 9) this.damage(f, f.def.hp * 0.06 * dt * 10 * 0.1, -1, 0, 0);
        }
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
    const dx = Math.sin(f.facing), dz = Math.cos(f.facing);
    if (isSuper) {
      f.superCharge = 0;
      f.superReady = false;
      const n = f.def.superCount;
      for (let i = 0; i < n; i++) {
        const spread = n > 1 ? (i - (n - 1) / 2) * 0.14 : 0;
        const c = Math.cos(spread), s = Math.sin(spread);
        this.bullets.push({
          id: uid(),
          x: f.x + dx * 0.8, z: f.z + dz * 0.8,
          dx: dx * c - dz * s, dz: dx * s + dz * c,
          speed: 16, dist: 0, maxDist: f.def.superRange,
          damage: f.def.superDamage, team: f.team, ownerId: f.id,
          isSuper: true, color: 0xff9f1c,
        });
      }
      f.reloadT = 0.4;
      this.events.push({ type: 'super', id: f.id });
    } else {
      const n = f.def.projectiles;
      for (let i = 0; i < n; i++) {
        const spread = n > 1 ? (i - (n - 1) / 2) * 0.18 : 0;
        const c = Math.cos(spread), s = Math.sin(spread);
        this.bullets.push({
          id: uid(),
          x: f.x + dx * 0.8, z: f.z + dz * 0.8,
          dx: dx * c - dz * s, dz: dx * s + dz * c,
          speed: 20, dist: 0, maxDist: f.def.range,
          damage: f.def.damage, team: f.team, ownerId: f.id,
          isSuper: false, color: 0xffe066,
        });
      }
      f.reloadT = f.def.reloadMs / 1000;
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
      // drop stele
      if (this.modeId === 'starrush' && f.stars > 0) {
        for (let i = 0; i < f.stars; i++) this.dropStar(f.x + (Math.random() - 0.5) * 2, f.z + (Math.random() - 0.5) * 2);
        f.stars = 0;
      }
      this.events.push({ type: 'ko', id: f.id, killer: killerId, x: f.x, z: f.z });
      // respawn dummies training cu HP plin
      if (f.aiMode === 'dummy') {
        f.hp = f.def.hp;
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
