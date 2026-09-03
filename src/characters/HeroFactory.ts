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

  const bodyMat = new THREE.MeshLambertMaterial({ color: main });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.85;
  group.add(body);

  // curea / detaliu accent
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.18, 10),
    new THREE.MeshLambertMaterial({ color: accent })
  );
  belt.position.y = 0.55;
  group.add(belt);

  const head = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xffe3c2 }));
  head.position.y = 1.75;
  group.add(head);

  // cască în culoarea eroului (siluetă recognoscibilă)
  const helm = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshLambertMaterial({ color: main })
  );
  helm.position.y = 1.82;
  group.add(helm);

  // ochi
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x141828 });
  const eL = new THREE.Mesh(eyeGeo, eyeMat);
  eL.position.set(-0.16, 1.78, 0.4);
  const eR = new THREE.Mesh(eyeGeo, eyeMat);
  eR.position.set(0.16, 1.78, 0.4);
  group.add(eL, eR);

  // armă
  const gun = new THREE.Mesh(gunGeo, new THREE.MeshLambertMaterial({ color: 0x2a2f45 }));
  gun.position.set(0.55, 1.0, 0.35);
  gun.rotation.x = Math.PI / 2 - 0.15;
  group.add(gun);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshBasicMaterial({ color: accent })
  );
  tip.position.set(0.55, 1.08, 0.9);
  group.add(tip);

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

  return {
    group, body, head, gun, ring, shadow,
    setTeamColor(hex: number) {
      (ring.material as THREE.MeshBasicMaterial).color.setHex(hex);
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
      // idle bob + alergare
      const bob = moving ? Math.sin(time * 11) * 0.09 : Math.sin(time * 2.4) * 0.045;
      body.position.y = 0.85 + bob;
      head.position.y = 1.75 + bob * 1.2;
      helm.position.y = 1.82 + bob * 1.2;
      group.rotation.y += 0; // orientarea o setează GameManager
      if (attackT > 0) {
        attackT -= dt;
        const k = attackT / 0.22;
        gun.position.z = 0.35 + (1 - k) * 0.0 - k * 0.35;
        body.scale.set(1 + k * 0.08, 1 - k * 0.06, 1 + k * 0.08);
      } else {
        body.scale.set(1, 1, 1);
      }
      if (hitT > 0) {
        hitT -= dt;
        bodyMat.color.setHex(0xffffff);
        if (hitT <= 0) bodyMat.color.copy(main);
      }
    },
  };
}
