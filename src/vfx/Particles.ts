import * as THREE from 'three';
import { settings } from '../settings/Settings';

// Particule cu buget fix, zero alocări în timpul meciului (anti-GC spikes pe mobil).
// Toate particulele sunt mesh-uri pre-alocate; spawn() reciclează cele invizibile.
export class Particles {
  private group = new THREE.Group();

  constructor(scene: THREE.Scene, budget = 220) {
    const geo = new THREE.SphereGeometry(0.12, 6, 5);
    for (let i = 0; i < budget; i++) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })
      );
      m.visible = false;
      m.userData = { vx: 0, vy: 0, vz: 0, life: 0, max: 0 };
      this.group.add(m);
    }
    scene.add(this.group);
  }

  spawn(x: number, y: number, z: number, color: number, count = 10, speed = 5, life = 0.5) {
    const n = Math.max(1, Math.round(count * settings.particleMul));
    let spawned = 0;
    for (const m of this.group.children as THREE.Mesh[]) {
      if (spawned >= n) break;
      if (m.visible) continue;
      m.visible = true;
      m.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
      (m.material as THREE.MeshBasicMaterial).color.setHex(color);
      (m.material as THREE.MeshBasicMaterial).opacity = 1;
      m.scale.setScalar(0.7 + Math.random() * 0.9);
      const a = Math.random() * Math.PI * 2;
      const r = speed * (0.4 + Math.random() * 0.8);
      const l = life * (0.6 + Math.random() * 0.7);
      m.userData = {
        vx: Math.cos(a) * r,
        vy: 2.5 + Math.random() * 4,
        vz: Math.sin(a) * r,
        life: l,
        max: l,
      };
      spawned++;
    }
  }

  update(dt: number) {
    for (const m of this.group.children as THREE.Mesh[]) {
      if (!m.visible) continue;
      const u = m.userData as { vx: number; vy: number; vz: number; life: number; max: number };
      u.life -= dt;
      if (u.life <= 0) {
        m.visible = false;
        continue;
      }
      m.position.x += u.vx * dt;
      m.position.y += u.vy * dt;
      m.position.z += u.vz * dt;
      u.vy -= 12 * dt;
      (m.material as THREE.MeshBasicMaterial).opacity = u.life / u.max;
      m.scale.setScalar(Math.max(0.01, m.scale.x * (1 - dt * 1.5)));
    }
  }
}
