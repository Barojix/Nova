import { dist2d } from '../utils/math';
import { canSee } from './visibility';
import { Match, type SimFighter, type SimInput } from './Match';

// Creier simplu dar credibil: luptă la distanță optimă, strânge stele,
// fuge la HP mic, folosește super-ul când are țintă grupată.
export function botInput(m: Match, f: SimFighter, dt: number): SimInput {
  const out: SimInput = { mx: 0, mz: 0, ax: 0, az: 0, attack: false, super: false };
  if (!f.alive || f.aiMode === 'dummy') return out;

  f.aiT -= dt;
  const enemies = m.fighters.filter((e) =>
    e.alive && e.id !== f.id &&
    (m.modeId === 'showdown' ? true : e.team !== f.team) &&
    e.aiMode !== 'dummy'
  );
  const dummies = m.fighters.filter((e) => e.alive && e.aiMode === 'dummy');

  // țintă: cel mai apropiat inamic VIZIBIL (prin tufiș nu văd — ca în Brawl)
  let target: SimFighter | null = null;
  let best = Infinity;
  const pool = m.modeId === 'training' ? [...enemies, ...dummies] : enemies;
  for (const e of pool) {
    if (e.aiMode !== 'dummy' && !canSee(m.map.bushes, f.x, f.z, e.x, e.z)) continue;
    const d = dist2d(f.x, f.z, e.x, e.z);
    if (d < best) { best = d; target = e; }
  }

  // HP mic -> fugi spre spawn
  if (f.hp < f.def.hp * 0.3 && target && best < 7) {
    f.aiMode = 'flee';
  } else if (f.aiMode === 'flee' && f.hp > f.def.hp * 0.7) {
    f.aiMode = 'fight';
  }

  // starrush: dacă sunt stele libere aproape, ia-le
  let starGoal: { x: number; z: number } | null = null;
  if (m.modeId === 'starrush' && f.aiMode !== 'flee' && f.stars < 6) {
    let bd = 9;
    for (const s of m.stars) {
      const d = dist2d(f.x, f.z, s.x, s.z);
      if (d < bd) { bd = d; starGoal = s; }
    }
  }

  if (f.aiT <= 0) {
    f.aiT = 0.4 + Math.random() * 0.5;
    // --- anti-blocare: dacă n-am progresat spre țintă, ocolim perpendicular ---
    const hasPrev = f.lx !== undefined && f.lz !== undefined;
    const px = f.lx ?? f.x;
    const pz = f.lz ?? f.z;
    const moved = dist2d(f.x, f.z, px, pz);
    f.lx = f.x;
    f.lz = f.z;
    const goalFar = dist2d(f.x, f.z, f.aiTx, f.aiTz) > 3;
    if ((f.stuckT ?? 0) > 0) {
      f.stuckT = (f.stuckT ?? 0) - f.aiT;
      // păstrăm waypoint-ul de ocolire setat anterior
    } else if (hasPrev && goalFar && moved < 0.5) {
      // blocat — alege ocolire perpendiculară (preferabil spre centru)
      const gx0 = f.aiTx - f.x;
      const gz0 = f.aiTz - f.z;
      const gl = Math.hypot(gx0, gz0) || 1;
      const nx = gx0 / gl;
      const nz = gz0 / gl;
      const side = Math.random() < 0.5 ? 1 : -1;
      const pxp = -nz * side;
      const pzp = nx * side;
      f.aiTx = f.x + pxp * 7 - nx * 1.5;
      f.aiTz = f.z + pzp * 7 - nz * 1.5;
      // ține-l în hartă
      f.aiTx = Math.max(-15, Math.min(15, f.aiTx));
      f.aiTz = Math.max(-15, Math.min(15, f.aiTz));
      f.stuckT = 1.4;
    } else if (f.aiMode === 'flee') {
      const home = f.team === 0 ? { x: -12, z: 0 } : { x: 12, z: 0 };
      f.aiTx = home.x; f.aiTz = home.z;
    } else if (starGoal) {
      f.aiTx = starGoal.x; f.aiTz = starGoal.z;
    } else if (target && best > f.def.range * 0.75) {
      // apropie-te, cu strafing
      f.aiTx = target.x + (Math.random() - 0.5) * 3;
      f.aiTz = target.z + (Math.random() - 0.5) * 3;
    } else if (target) {
      // kiting lateral
      const a = Math.atan2(f.x - target.x, f.z - target.z) + (Math.random() < 0.5 ? 0.7 : -0.7);
      f.aiTx = f.x + Math.sin(a) * 4;
      f.aiTz = f.z + Math.cos(a) * 4;
    } else {
      f.aiTx = (Math.random() - 0.5) * 16;
      f.aiTz = (Math.random() - 0.5) * 16;
    }
  }

  const dx = f.aiTx - f.x, dz = f.aiTz - f.z;
  const dl = Math.hypot(dx, dz);
  if (dl > 0.6) {
    out.mx = dx / dl;
    out.mz = dz / dl;
  }

  if (target && best < f.def.range + 1.5) {
    // aim cu eroare umană + predicție minimă
    const err = 0.06 + (best / f.def.range) * 0.1;
    const px = target.x + (Math.random() - 0.5) * err * best;
    const pz = target.z + (Math.random() - 0.5) * err * best;
    const ax = px - f.x, az = pz - f.z;
    const al = Math.hypot(ax, az) || 1;
    out.ax = ax / al;
    out.az = az / al;
    // trage doar dacă e în range real (fără wall-hack: botul nu vede prin zid — verificat ieftin de sim la impact)
    if (best < f.def.range) out.attack = Math.random() < (f.aiMode === 'flee' ? 0.4 : 0.9);
    // super: când ținta e aproape și (grupată sau îi e fatal)
    if (f.superReady && best < f.def.superRange * 0.8) {
      const grouped = enemies.filter((e) => e.alive && dist2d(e.x, e.z, target!.x, target!.z) < 3).length;
      if (grouped >= 2 || target.hp < f.def.superDamage * 1.2 || Math.random() < 0.02) {
        out.super = true;
      }
    }
  } else if (starGoal) {
    out.ax = out.mx; out.az = out.mz;
  }

  return out;
}
