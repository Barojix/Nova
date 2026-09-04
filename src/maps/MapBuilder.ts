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
  const half = def.size / 2;
  const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];

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
  tex.repeat.set(def.size / 8, def.size / 8);
  disposables.push(tex);

  const groundMat = new THREE.MeshLambertMaterial({ map: tex });
  disposables.push(groundMat);
  const groundGeo = new THREE.PlaneGeometry(def.size + 6, def.size + 6);
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
    const n = Math.max(6, Math.round(def.size / 3));
    const step = (def.size + 3.2) / n;
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
    trim(def.size + 3.4, 0.3, 0, -F);
    trim(def.size + 3.4, 0.3, 0, F);
    trim(0.3, def.size + 3.4, -F, 0);
    trim(0.3, def.size + 3.4, F, 0);
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
    // decor exterior: pietre, plante, cristale (determinist per hartă)
    const rockGeo = new THREE.DodecahedronGeometry(0.9);
    const plantGeo = new THREE.ConeGeometry(0.7, 1.6, 7);
    const crysGeo = new THREE.OctahedronGeometry(0.7);
    disposables.push(rockGeo, plantGeo, crysGeo);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x5b6172 });
    const plantMat = new THREE.MeshLambertMaterial({ color: 0x2fae5f });
    const crysMat = new THREE.MeshLambertMaterial({ color: 0x7af0ff, emissive: 0x1a4a5a });
    disposables.push(rockMat, plantMat, crysMat);
    let seed = 12345;
    for (const ch of def.id) seed = (seed * 31 + ch.charCodeAt(0)) % 100000;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const R = half + 5;
    for (let i = 0; i < 42; i++) {
      const a = rnd() * Math.PI * 2;
      const r = R + rnd() * half * 1.6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const kind = i % 3;
      const m = new THREE.Mesh(
        kind === 0 ? rockGeo : kind === 1 ? plantGeo : crysGeo,
        kind === 0 ? rockMat : kind === 1 ? plantMat : crysMat
      );
      const s = 0.7 + rnd() * 1.6;
      m.scale.setScalar(s);
      m.position.set(x, (kind === 1 ? 0.8 : 0.4) * s, z);
      m.rotation.y = rnd() * Math.PI;
      group.add(m);
    }
    // fâșie exterioară cu ACELAȘI pământ (se pierde marginea hărții în orizont)
    const skirtTex = new THREE.CanvasTexture(cnv);
    skirtTex.wrapS = skirtTex.wrapT = THREE.RepeatWrapping;
    skirtTex.repeat.set((def.size * 4) / 8, (def.size * 4) / 8);
    disposables.push(skirtTex);
    const skirtGeo = new THREE.PlaneGeometry(def.size * 4, def.size * 4);
    disposables.push(skirtGeo);
    const skirtMat = new THREE.MeshLambertMaterial({ map: skirtTex, color: 0x8a8fa8 });
    disposables.push(skirtMat);
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.y = -0.08;
    group.add(skirt);
  }

  // ziduri — blocuri cristal albastru-violet
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x3a4a8c });
  const wallTopMat = new THREE.MeshLambertMaterial({ color: 0x5a70d8 });
  disposables.push(wallMat, wallTopMat);
  const walls: BuiltMap['walls'] = [];
  for (const w of def.walls) {
    const h = 1.6;
    const geo = new THREE.BoxGeometry(w.w, h, w.d);
    disposables.push(geo);
    const m = new THREE.Mesh(geo, wallMat);
    m.position.set(w.x, h / 2, w.z);
    m.castShadow = settings.shadows;
    group.add(m);
    const topGeo = new THREE.BoxGeometry(w.w + 0.15, 0.18, w.d + 0.15);
    disposables.push(topGeo);
    const top = new THREE.Mesh(topGeo, wallTopMat);
    top.position.set(w.x, h + 0.09, w.z);
    group.add(top);
    walls.push({
      minX: w.x - w.w / 2, maxX: w.x + w.w / 2,
      minZ: w.z - w.d / 2, maxZ: w.z + w.d / 2,
    });
  }

  // tufișuri — pâlcuri 3D (ascund vizual eroii inamici)
  const bushMat = new THREE.MeshLambertMaterial({
    color: 0x2fae5f, transparent: true, opacity: 0.85,
  });
  disposables.push(bushMat);
  const bushDark = new THREE.MeshLambertMaterial({ color: 0x1e7a40 });
  disposables.push(bushDark);
  const bushes = def.bushes.map((b) => ({ ...b }));
  for (const b of def.bushes) {
    const geo = new THREE.CircleGeometry(b.r, 20);
    disposables.push(geo);
    const m = new THREE.Mesh(geo, bushMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(b.x, 0.05, b.z);
    group.add(m);
    // 3 smocuri sferice — luptătorul „se scufundă" vizual în iarbă
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + b.x;
      const rr = b.r * 0.45;
      const tuftGeo = new THREE.SphereGeometry(rr, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      disposables.push(tuftGeo);
      const tuft = new THREE.Mesh(tuftGeo, k % 2 ? bushMat : bushDark);
      tuft.position.set(b.x + Math.cos(a) * b.r * 0.4, 0.02, b.z + Math.sin(a) * b.r * 0.4);
      group.add(tuft);
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
    mine.position.set(def.mine.x, 1.2, def.mine.z);
    group.add(mine);
    const padGeo = new THREE.CylinderGeometry(1.8, 2.1, 0.3, 16);
    disposables.push(padGeo);
    const padMat = new THREE.MeshLambertMaterial({ color: 0x2a2f60 });
    disposables.push(padMat);
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(def.mine.x, 0.15, def.mine.z);
    group.add(pad);
  }

  // platforme seif (heist)
  for (const s of def.safes ?? []) {
    const padGeo = new THREE.BoxGeometry(4.4, 0.3, 4.4);
    disposables.push(padGeo);
    const padMat = new THREE.MeshLambertMaterial({ color: s.team === 0 ? 0x1e3a8a : 0x7f1d1d });
    disposables.push(padMat);
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(s.x, 0.15, s.z);
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
