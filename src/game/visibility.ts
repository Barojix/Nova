import type { BushDef } from '../data/maps';

// Vizibilitate stil hero-brawler: ce e în tufiș nu se vede de afară.
// Folosit de stealth-ul vizual, auto-aim și AI (client + server autoritativ).
export function inBushAt(bushes: BushDef[], x: number, z: number): boolean {
  for (const b of bushes) {
    if (Math.hypot(x - b.x, z - b.z) < b.r) return true;
  }
  return false;
}

/** Poate privitorul (vx,vz) să vadă ținta (tx,tz)? */
export function canSee(
  bushes: BushDef[], vx: number, vz: number, tx: number, tz: number
): boolean {
  // ținta în câmp deschis → vizibilă
  if (!inBushAt(bushes, tx, tz)) return true;
  // privitorul în același tufiș → o vede
  if (inBushAt(bushes, vx, vz)) return true;
  // foarte aproape → o vede (auzi foșnetul)
  const dx = tx - vx, dz = tz - vz;
  return dx * dx + dz * dz < 9;
}
