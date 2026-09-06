import * as THREE from 'three';
import type { MapDef } from '../data/maps';
import { settings } from '../settings/Settings';

export interface BuiltMap {
  group: THREE.Group;
  walls: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  bushes: { x: number; z: number; r: number }[];
  half: number;
  dispose: () => void;
}

// Verificare coliziune cerc vs AABB ziduri.
export function collideWalls(
  walls: BuiltMap['walls'], x: number, z: number, r: number
): { x: number; z: number } {
  let nx = x, nz = z;
  for (const w of walls) {
    const cx = Math.max(w.minX, Math.min(nx, w.maxX));
    const cz = Math.max(w.minZ, Math.min(nz, w.maxZ));
    const dx = nx - cx, dz = nz - cz;
    const d = Math.hypot(dx, dz);
    if (d < r) {
      if (d > 0.0001) {
        nx = cx + (dx / d) * r;
        nz = cz + (dz / d) * r;
      } else {
        // centru înăuntru — împinge pe axa cea mai apropiată
        const pushL = nx - w.minX, pushR = w.maxX - nx;
        const pushU = nz - w.minZ, pushD = w.maxZ - nz;
        const m = Math.min(pushL, pushR, pushU, pushD);
        if (m === pushL) nx = w.minX - r;
        else if (m === pushR) nx = w.maxX + r;
        else if (m === pushU) nz = w.minZ - r;
        else nz = w.maxZ + r;
      }
    }
  }
  return { x: nx, z: nz };
}

export function inBush(bushes: BuiltMap['bushes'], x: number, z: number): boolean {
  for (const b of bushes) {
    if (Math.hypot(x - b.x, z - b.z) < b.r) return true;
  }
  return false;
}

/** Linie de vedere blocată de ziduri? (segment vs AABB, sampling ieftin) */
export function losBlocked(walls: BuiltMap['walls'], ax: number, az: number, bx: number, bz: number): boolean {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    for (const w of walls) {
      if (x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ) return true;
    }
  }
  return false;
}

export function buildMap(scene: THREE.Scene, def: MapDef): BuiltMap {
  const group = new THREE.Group();
  const S = def.scale ?? 1;
  const half = (def.size / 2) * S;
  const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  // RNG determinist per hartă (același aspect la fiecare meci)
  let seed = 987654321;
  for (const ch of def.id) seed = (seed * 31 + ch.charCodeAt(0)) % 100000;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  // cub unitar partajat (tot decorul blocky + zidurile îl refolosesc)
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(cubeGeo);

  // sol — canvas texture procedurală (nisip/cristal original)
  const cnv = document.createElement('canvas');
  cnv.width = 256; cnv.height = 256;
  const g2 = cnv.getContext('2d')!;
  g2.fillStyle = '#1b2140';
  g2.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g2.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
    g2.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g2.strokeStyle = 'rgba(122,240,255,0.10)';
  g2.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g2.beginPath(); g2.moveTo((i * 256) / 4, 0); g2.lineTo((i * 256) / 4, 256); g2.stroke();
    g2.beginPath(); g2.moveTo(0, (i * 256) / 4); g2.lineTo(256, (i * 256) / 4); g2.stroke();
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((def.size * S) / 8, (def.size * S) / 8);
  disposables.push(tex);

  const groundMat = new THREE.MeshLambertMaterial({ map: tex });
  disposables.push(groundMat);
  const groundGeo = new THREE.PlaneGeometry(def.size * S + 6, def.size * S + 6);
  disposables.push(groundGeo);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = settings.shadows;
  group.add(ground);

  // zid perimetral din cuburi (stil Brawl) + turnuri de colț + decor exterior
  const blockMatA = new THREE.MeshLambertMaterial({ color: 0x4a5a9c });
  const blockMatB = new THREE.MeshLambertMaterial({ color: 0x5a6cb8 });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x7af0ff });
  disposables.push(blockMatA, blockMatB, trimMat);
  {
    const F = half + 1.6;
    const n = Math.max(6, Math.round((def.size * S) / 3));
    const step = (def.size * S + 3.2) / n;
    const blockGeo = new THREE.BoxGeometry(1, 1, 1);
    disposables.push(blockGeo);
    let bi = 0;
    const block = (x: number, z: number, w: number, h: number, d: number) => {
      const m = new THREE.Mesh(blockGeo, bi++ % 2 ? blockMatA : blockMatB);
      m.position.set(x, h / 2, z);
      m.scale.set(w, h, d);
      m.castShadow = settings.shadows;
      group.add(m);
    };
    for (let i = 0; i < n; i++) {
      const t = -half - 1.6 + step * (i + 0.5);
      const h = 1.5 + ((i * 7) % 3) * 0.35; // înălțimi variate
      block(t, -F, step * 0.96, h, 1.4);
      block(t, F, step * 0.96, 2.25 - (h - 1.5), 1.4);
      block(-F, t, 1.4, h, step * 0.96);
      block(F, t, 1.4, 2.25 - (h - 1.5), step * 0.96);
    }
    // bandă luminoasă pe zid
    const trimGeo = new THREE.BoxGeometry(1, 0.12, 1);
    disposables.push(trimGeo);
    const trim = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(trimGeo, trimMat);
      m.position.set(x, 1.62, z);
      m.scale.set(w, 1, d);
      group.add(m);
    };
    trim(def.size * S + 3.4, 0.3, 0, -F);
    trim(def.size * S + 3.4, 0.3, 0, F);
    trim(0.3, def.size * S + 3.4, -F, 0);
    trim(0.3, def.size * S + 3.4, F, 0);
    // turnuri de colț
    const towerGeo = new THREE.BoxGeometry(2.2, 3.4, 2.2);
    const capGeo = new THREE.BoxGeometry(2.7, 0.5, 2.7);
    disposables.push(towerGeo, capGeo);
    for (const [px, pz] of [[-F, -F], [F, -F], [-F, F], [F, F]]) {
      const t = new THREE.Mesh(towerGeo, blockMatA);
      t.position.set(px, 1.7, pz);
      t.castShadow = settings.shadows;
      group.add(t);
      const cp = new THREE.Mesh(capGeo, trimMat);
      cp.position.set(px, 3.6, pz);
      group.add(cp);
    }
    // decor exterior TEMATIC din cuburi (copaci, stânci, cristale, felinare)
    // compuse logic, nu forme aruncate: fiecare „petic" e un mini-ansamblu
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
    const leafMatA = new THREE.MeshLambertMaterial({ color: 0x2fae5f });
    const leafMatB = new THREE.MeshLambertMaterial({ color: 0x36c668 });
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x5b6172 });
    const rockMat2 = new THREE.MeshLambertMaterial({ color: 0x6e7688 });
    const crysMat = new THREE.MeshLambertMaterial({ color: 0x7af0ff, emissive: 0x1a4a5a });
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2f45 });
    const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    disposables.push(trunkMat, leafMatA, leafMatB, rockMat, rockMat2, crysMat, lampMat, lampGlow);
    const R = half + 5;
    const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = settings.shadows;
      group.add(m);
    };
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2;
      const r = R + rnd() * half * 1.5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const kind = i % 5;
      if (kind === 0) {
        // copac cubist: trunchi + 3 cuburi de frunziș
        put(cubeGeo, trunkMat, x, 0.9, z, 0.7, 1.8, 0.7);
        put(cubeGeo, leafMatA, x, 2.4, z, 2.2, 1.6, 2.2, 0.2);
        put(cubeGeo, leafMatB, x + 0.7, 3.1, z - 0.4, 1.3, 1.0, 1.3, 0.5);
        put(cubeGeo, leafMatA, x - 0.6, 3.0, z + 0.5, 1.0, 0.9, 1.0, 0.1);
      } else if (kind === 1) {
        // morman de stânci
        put(cubeGeo, rockMat, x, 0.5, z, 1.6, 1.0, 1.4, 0.3);
        put(cubeGeo, rockMat2, x + 0.8, 0.35, z + 0.3, 0.9, 0.7, 0.8, 0.7);
        put(cubeGeo, rockMat, x - 0.6, 1.15, z - 0.2, 0.8, 0.7, 0.8, 0.2);
      } else if (kind === 2) {
        // grup de cristale
        const cg = new THREE.OctahedronGeometry(0.7);
        disposables.push(cg);
        put(cg, crysMat, x, 0.6, z, 1, 1.4, 1);
        put(cg, crysMat, x + 0.8, 0.35, z + 0.2, 0.6, 0.8, 0.6);
        put(cg, crysMat, x - 0.7, 0.3, z - 0.3, 0.5, 0.7, 0.5);
      } else if (kind === 3) {
        // felinar: stâlp + cap luminos
        put(cubeGeo, lampMat, x, 1.1, z, 0.35, 2.2, 0.35);
        put(cubeGeo, lampGlow, x, 2.4, z, 0.55, 0.5, 0.55);
        put(cubeGeo, lampMat, x, 2.8, z, 0.7, 0.18, 0.7);
      } else {
        // tufă decorativă + flori cub
        put(cubeGeo, leafMatB, x, 0.4, z, 1.4, 0.8, 1.4, 0.4);
        put(cubeGeo, leafMatA, x + 0.3, 0.85, z - 0.2, 0.8, 0.5, 0.8, 0.2);
        put(cubeGeo, lampGlow, x - 0.3, 0.95, z + 0.3, 0.25, 0.25, 0.25);
      }
    }
    // fâșie exterioară cu ACELAȘI pământ (se pierde marginea hărții în orizont)
    const skirtTex = new THREE.CanvasTexture(cnv);
    skirtTex.wrapS = skirtTex.wrapT = THREE.RepeatWrapping;
    skirtTex.repeat.set((def.size * S * 4) / 8, (def.size * S * 4) / 8);
    disposables.push(skirtTex);
    const skirtGeo = new THREE.PlaneGeometry(def.size * S * 4, def.size * S * 4);
    disposables.push(skirtGeo);
    const skirtMat = new THREE.MeshLambertMaterial({ map: skirtTex, color: 0x8a8fa8 });
    disposables.push(skirtMat);
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.y = -0.08;
    group.add(skirt);
  }

  // ziduri din CUBURI conectate (stil Brawl): fiecare zid = rânduri de cuburi
  // cu înălțimi/nuante variate + capac luminos
  const wallMatA = new THREE.MeshLambertMaterial({ color: 0x3a4a8c });
  const wallMatB = new THREE.MeshLambertMaterial({ color: 0x46589e });
  const wallTopMat = new THREE.MeshLambertMaterial({ color: 0x7af0ff, emissive: 0x1a3a4a });
  disposables.push(wallMatA, wallMatB, wallTopMat);
  const walls: BuiltMap['walls'] = [];
  for (const w of def.walls) {
    const wx = w.x * S, wz = w.z * S, ww = w.w * S, wd = w.d * S;
    const cell = 1.1 * S;
    const nx = Math.max(1, Math.round(ww / cell));
    const nz = Math.max(1, Math.round(wd / cell));
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const h = 1.5 + rnd() * 0.5;
        const m = new THREE.Mesh(cubeGeo, (ix + iz) % 2 ? wallMatA : wallMatB);
        m.scale.set((ww / nx) * 0.98, h, (wd / nz) * 0.98);
        m.position.set(
          wx - ww / 2 + (ww / nx) * (ix + 0.5),
          h / 2,
          wz - wd / 2 + (wd / nz) * (iz + 0.5)
        );
        m.castShadow = settings.shadows;
        group.add(m);
        // capac luminos pe fiecare cub
        const cap = new THREE.Mesh(cubeGeo, wallTopMat);
        cap.scale.set((ww / nx) * 0.7, 0.12, (wd / nz) * 0.7);
        cap.position.set(m.position.x, h + 0.06, m.position.z);
        group.add(cap);
      }
    }
    walls.push({
      minX: wx - ww / 2, maxX: wx + ww / 2,
      minZ: wz - wd / 2, maxZ: wz + wd / 2,
    });
  }

  // tufișuri din CUBURI de iarbă conectate (stil Brawl) — acoperire totală
  const bushMatA = new THREE.MeshLambertMaterial({ color: 0x2fae5f });
  const bushMatB = new THREE.MeshLambertMaterial({ color: 0x27a054 });
  const bushMatC = new THREE.MeshLambertMaterial({ color: 0x36c668 });
  disposables.push(bushMatA, bushMatB, bushMatC);
  const bushes = def.bushes.map((b) => ({ x: b.x * S, z: b.z * S, r: b.r * S }));
  const bushMats = [bushMatA, bushMatB, bushMatC];
  for (const b of bushes) {
    // covor de bază
    const baseGeo = new THREE.CircleGeometry(b.r, 18);
    disposables.push(baseGeo);
    const base = new THREE.Mesh(baseGeo, bushMatB);
    base.rotation.x = -Math.PI / 2;
    base.position.set(b.x, 0.04, b.z);
    group.add(base);
    // cuburi de iarbă: grilă hexagonală în cerc, înălțimi aleatorii
    const cell = 0.85 * S;
    const n = Math.ceil((b.r * 2) / cell);
    for (let ix = 0; ix <= n; ix++) {
      for (let iz = 0; iz <= n; iz++) {
        const ox = -b.r + ix * cell + (iz % 2 ? cell / 2 : 0);
        const oz = -b.r + iz * cell;
        if (Math.hypot(ox, oz) > b.r * 0.92) continue;
        const h = (0.55 + rnd() * 0.75) * S;
        const m = new THREE.Mesh(cubeGeo, bushMats[(ix * 3 + iz) % 3]);
        m.scale.set(cell * 0.92, h, cell * 0.92);
        m.position.set(b.x + ox, h / 2, b.z + oz);
        m.rotation.y = (ix + iz) * 0.13;
        m.castShadow = settings.shadows;
        group.add(m);
      }
    }
  }

  // mina de geme (gemgrab) — cristal mare la centru
  if (def.mine) {
    const mineGeo = new THREE.OctahedronGeometry(1.1);
    disposables.push(mineGeo);
    const mineMat = new THREE.MeshLambertMaterial({
      color: 0xb15cff, emissive: 0x5b21b6,
    });
    disposables.push(mineMat);
    const mine = new THREE.Mesh(mineGeo, mineMat);
    mine.position.set(def.mine.x * S, 1.2, def.mine.z * S);
    group.add(mine);
    const padGeo = new THREE.CylinderGeometry(1.8, 2.1, 0.3, 16);
    disposables.push(padGeo);
    const padMat = new THREE.MeshLambertMaterial({ color: 0x2a2f60 });
    disposables.push(padMat);
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(def.mine.x * S, 0.15, def.mine.z * S);
    group.add(pad);
  }

  // platforme seif (heist)
  for (const s of def.safes ?? []) {
    const padGeo = new THREE.BoxGeometry(4.4, 0.3, 4.4);
    disposables.push(padGeo);
    const padMat = new THREE.MeshLambertMaterial({ color: s.team === 0 ? 0x1e3a8a : 0x7f1d1d });
    disposables.push(padMat);
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(s.x * S, 0.15, s.z * S);
    group.add(pad);
  }

  // lumini
  const hemi = new THREE.HemisphereLight(0xbcd2ff, 0x1a1430, 1.05);
  group.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff2d9, settings.shadows ? 1.1 : 0.9);
  dir.position.set(12, 20, 8);
  if (settings.shadows) {
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -20; dir.shadow.camera.right = 20;
    dir.shadow.camera.top = 20; dir.shadow.camera.bottom = -20;
  }
  group.add(dir);

  // ceață densă pentru adâncime (topește marginea în orizont)
  scene.fog = new THREE.Fog(0x11142a, 30, 62);

  scene.add(group);
  return {
    group, walls, bushes, half,
    dispose() {
      scene.remove(group);
      scene.fog = null;
      disposables.forEach((d) => d.dispose());
    },
  };
}
