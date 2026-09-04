import * as THREE from 'three';
import type { HeroDef } from '../data/heroes';

// Construiește eroi stilizați din primitive — modele 100% originale, low-poly,
// optimizate pentru mobil (puține draw call-uri, geometrii reutilizate).
export interface HeroRig {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  gun: THREE.Mesh;
  ring: THREE.Mesh; // indicator echipă / rază
  shadow: THREE.Mesh;
  setTeamColor: (hex: number) => void;
  playAttack: () => void;
  playHit: () => void;
  playDeath: (cb: () => void) => void;
  setSuperReady: (ready: boolean) => void;
  /** Erou în tufiș: translucid (te vezi, inamicii nu). */
  setFaded: (faded: boolean) => void;
  update: (dt: number, moving: boolean, time: number) => void;
}

const bodyGeo = new THREE.CylinderGeometry(0.55, 0.7, 1.1, 10);
const headGeo = new THREE.SphereGeometry(0.48, 12, 10);
const eyeGeo = new THREE.SphereGeometry(0.09, 6, 5);
const gunGeo = new THREE.CylinderGeometry(0.16, 0.22, 1.1, 8);
const ringGeo = new THREE.RingGeometry(0.75, 0.95, 24);
const shadowGeo = new THREE.CircleGeometry(0.7, 16);

export function buildHero(def: HeroDef, skinColor?: number): HeroRig {
  const group = new THREE.Group();
  const main = new THREE.Color(skinColor ?? def.color);
  const accent = new THREE.Color(def.accent);
  const lam = (c: THREE.Color | number) => new THREE.MeshLambertMaterial({ color: c });

  // specii: uman / robot / animal / monstru — siluete complet diferite
  const species = def.species;
  const bodyMat = lam(main);
  let body: THREE.Mesh;
  let head: THREE.Mesh;
  let bodyBaseY = 0.85;
  let headBaseY = 1.75;
  if (species === 'robot') {
    body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.05, 0.7), bodyMat);
    body.position.y = 0.9;
    bodyBaseY = 0.9;
    group.add(body);
    // piept luminos
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.3, 0.1),
      new THREE.MeshBasicMaterial({ color: accent })
    );
    core.position.set(0, 1.0, 0.36);
    group.add(core);
    // cap cutie + vizor
    head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.6, 0.66), lam(0x2a2f45));
    head.position.y = 1.78;
    headBaseY = 1.78;
    group.add(head);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.16, 0.1),
      new THREE.MeshBasicMaterial({ color: accent })
    );
    visor.position.set(0, 1.8, 0.34);
    group.add(visor);
    // antenă
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), lam(main));
    rod.position.set(0.25, 2.3, 0);
    group.add(rod);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      new THREE.MeshBasicMaterial({ color: accent })
    );
    bulb.position.set(0.25, 2.58, 0);
    group.add(bulb);
    // picioare cutie
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.35), lam(0x2a2f45));
      leg.position.set(side * 0.25, 0.22, 0);
      group.add(leg);
    }
  } else if (species === 'animal') {
    body = new THREE.Mesh(new THREE.SphereGeometry(0.68, 12, 10), bodyMat);
    body.scale.set(1.0, 0.82, 1.25);
    body.position.y = 0.72;
    bodyBaseY = 0.72;
    group.add(body);
    // cap în față-sus + urechi + coadă
    head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), lam(0xffe3c2));
    head.position.set(0, 1.35, 0.45);
    headBaseY = 1.35;
    group.add(head);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 6), lam(main));
      ear.position.set(side * 0.24, 1.72, 0.4);
      group.add(ear);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 6), lam(main));
      leg.position.set(side * 0.35, 0.25, side * 0.2);
      group.add(leg);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6, 6), lam(accent));
    tail.position.set(0, 0.8, -0.85);
    tail.rotation.x = -1.1;
    group.add(tail);
  } else if (species === 'monstru') {
    body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.85, 1.35, 9), bodyMat);
    body.position.y = 0.85;
    group.add(body);
    // umeri țepoși
    for (const side of [-1, 1]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), lam(accent));
      spike.position.set(side * 0.62, 1.35, 0);
      spike.rotation.z = -side * 0.9;
      group.add(spike);
    }
    head = new THREE.Mesh(new THREE.SphereGeometry(0.44, 10, 8), lam(0xffe3c2));
    head.position.y = 1.78;
    headBaseY = 1.78;
    group.add(head);
    // coarne mari
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 6), lam(accent));
      horn.position.set(side * 0.4, 2.15, 0);
      horn.rotation.z = -side * 0.55;
      group.add(horn);
    }
  } else {
    // uman: corp + curea + cască
    body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.85;
    group.add(body);
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 0.18, 10),
      lam(accent)
    );
    belt.position.y = 0.55;
    group.add(belt);
    head = new THREE.Mesh(headGeo, lam(0xffe3c2));
    head.position.y = 1.75;
    group.add(head);
  }
  // cască în culoarea eroului (uman + monstru)
  let helm: THREE.Mesh | null = null;
  if (species === 'uman' || species === 'monstru') {
    helm = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      lam(main)
    );
    helm.position.y = headBaseY + 0.07;
    group.add(helm);
  }

  // ochi (uman/monstru; robotul are vizor, animalul ochi mari)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x141828 });
  if (species !== 'robot') {
    const big = species === 'animal';
    const eyeGeoUse = big ? new THREE.SphereGeometry(0.13, 8, 6) : eyeGeo;
    const ey = species === 'animal' ? headBaseY + 0.05 : headBaseY + 0.03;
    const ez = species === 'animal' ? 0.82 : 0.4;
    const ex = big ? 0.18 : 0.16;
    const eL = new THREE.Mesh(eyeGeoUse, eyeMat);
    eL.position.set(-ex, ey, ez);
    const eR = new THREE.Mesh(eyeGeoUse, eyeMat);
    eR.position.set(ex, ey, ez);
    group.add(eL, eR);
  }

  // armă (mărime după rază: lunetiștii au țeavă lungă)
  const gunScale = 0.8 + Math.min(1.4, def.range / 10);
  const gun = new THREE.Mesh(gunGeo, lam(0x2a2f45));
  gun.scale.set(1, gunScale, 1);
  gun.position.set(0.55, 1.0, 0.35);
  gun.rotation.x = Math.PI / 2 - 0.15;
  group.add(gun);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshBasicMaterial({ color: accent })
  );
  tip.position.set(0.55, 1.08, 0.9);
  group.add(tip);

  // mărime per erou (tancuri mari, asasini mici)
  group.scale.setScalar(def.sizeMul ?? 1);

  // materiale pentru fade în tufiș
  const fadeMats: { m: THREE.Material; o: number; t: boolean }[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const mt = mesh.material as THREE.Material | undefined;
    if (mt && 'opacity' in mt) {
      fadeMats.push({
        m: mt,
        o: (mt as THREE.MeshBasicMaterial).opacity ?? 1,
        t: !!(mt as THREE.MeshBasicMaterial).transparent,
      });
    }
  });

  // inel echipă
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: 0x2d7dff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);

  // umbră falsă (blob) — ieftin, fără shadow maps pe low
  const shadow = new THREE.Mesh(
    shadowGeo,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  let attackT = 0;
  let hitT = 0;
  let deadT = -1;
  let deathCb: (() => void) | null = null;
  let superR = false;
  let teamHex = 0x2d7dff;
  const baseScale = body.scale.clone();

  return {
    group, body, head, gun, ring, shadow,
    setTeamColor(hex: number) {
      teamHex = hex;
      if (!superR) (ring.material as THREE.MeshBasicMaterial).color.setHex(hex);
    },
    setSuperReady(ready: boolean) {
      superR = ready;
      (ring.material as THREE.MeshBasicMaterial).color.setHex(ready ? 0xff9f1c : teamHex);
    },
    setFaded(faded: boolean) {
      for (const e of fadeMats) {
        const mt = e.m as THREE.MeshBasicMaterial;
        mt.transparent = faded ? true : e.t;
        mt.opacity = faded ? e.o * 0.4 : e.o;
      }
    },
    playAttack() { attackT = 0.22; },
    playHit() { hitT = 0.18; },
    playDeath(cb: () => void) { deadT = 0.55; deathCb = cb; },
    update(dt: number, moving: boolean, time: number) {
      if (deadT >= 0) {
        deadT -= dt;
        const t = Math.max(0, deadT / 0.55);
        group.rotation.z = (1 - t) * 1.4;
        group.scale.setScalar(Math.max(0.01, t));
        group.position.y = (1 - t) * 0.4;
        if (deadT <= 0) {
          deadT = -1;
          group.rotation.z = 0;
          deathCb?.();
        }
        return;
      }
      // idle bob + alergare + aplecare la mișcare
      const bob = moving ? Math.sin(time * 11) * 0.09 : Math.sin(time * 2.4) * 0.045;
      body.position.y = bodyBaseY + bob;
      head.position.y = headBaseY + bob * 1.2;
      if (helm) helm.position.y = headBaseY + 0.07 + bob * 1.2;
      group.rotation.x = moving ? 0.12 : 0; // aplecare înainte la fugă
      // puls auriu pe inel când super-ul e gata
      if (superR) {
        const p = 0.75 + Math.sin(time * 6) * 0.25;
        (ring.material as THREE.MeshBasicMaterial).opacity = p;
        const s = 1 + Math.sin(time * 6) * 0.06;
        ring.scale.set(s, s, 1);
      } else {
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.9;
        ring.scale.set(1, 1, 1);
      }
      group.rotation.y += 0; // orientarea o setează GameManager
      if (attackT > 0) {
        attackT -= dt;
        const k = attackT / 0.22;
        gun.position.z = 0.35 + (1 - k) * 0.0 - k * 0.35;
        body.scale.set(baseScale.x * (1 + k * 0.08), baseScale.y * (1 - k * 0.06), baseScale.z * (1 + k * 0.08));
      } else {
        body.scale.copy(baseScale);
      }
      if (hitT > 0) {
        hitT -= dt;
        bodyMat.color.setHex(0xffffff);
        if (hitT <= 0) bodyMat.color.copy(main);
      }
    },
  };
}
