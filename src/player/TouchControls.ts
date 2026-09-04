import { settings } from '../settings/Settings';

// Controale stil hero-brawler mobil:
// - STÂNGA: joystick plutitor de mișcare — apare unde pui degetul (orice
//   atingere pe jumătatea stângă), acel punct devine centrul.
// - DREAPTA-JOS: stick de ATAC — TAP trage instant cu auto-aim, DRAG țintește
//   manual și trage la ridicare în direcția trasă.
// - Deasupra lui: stick de SUPER, mai mic, cu același comportament tap/drag.
export interface InputState {
  mx: number; mz: number;      // mișcare -1..1
  ax: number; az: number;      // aim -1..1 (direcție)
  aiming: boolean;             // aim manual activ (drag pe stick)
  attackPressed: boolean;      // edge — consumat de game
  superPressed: boolean;       // edge
}

const TAP_RATIO = 0.3; // sub 30% din rază = tap (auto-aim)

export class TouchControls {
  state: InputState = {
    mx: 0, mz: 0, ax: 1, az: 0, aiming: false,
    attackPressed: false, superPressed: false,
  };
  private moveId: number | null = null;
  private moveOx = 0; private moveOy = 0;
  private keys = new Set<string>();
  private moveBase: HTMLElement | null = null;
  private moveKnob: HTMLElement | null = null;
  private atkBase: HTMLElement | null = null;
  private atkKnob: HTMLElement | null = null;
  private supBase: HTMLElement | null = null;
  private supKnob: HTMLElement | null = null;
  /** aim manual păstrat până e consumat focul tras prin drag */
  private aimedShot = false;
  private aimedSuper = false;

  constructor(private root: HTMLElement) {
    this.build();
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  private radius(el: HTMLElement | null): number {
    const base = el?.classList.contains('super') ? 44 : 56;
    return base * settings.data.joystickSize;
  }

  private build() {
    this.root.innerHTML = `
      <div class="tc-stick move" id="tc-move"><div class="tc-knob" id="tc-mknob"></div></div>
      <div class="tc-stick atk" id="tc-atk"><div class="tc-knob atk" id="tc-aknob"></div><div class="tc-ico">🔥</div></div>
      <div class="tc-stick super" id="tc-sup"><div class="tc-knob sup" id="tc-sknob"></div><div class="tc-ico">💥</div></div>`;
    this.moveBase = this.root.querySelector('#tc-move');
    this.moveKnob = this.root.querySelector('#tc-mknob');
    this.atkBase = this.root.querySelector('#tc-atk');
    this.atkKnob = this.root.querySelector('#tc-aknob');
    this.supBase = this.root.querySelector('#tc-sup');
    this.supKnob = this.root.querySelector('#tc-sknob');

    // --- mișcare: orice atingere pe jumătatea stângă devine joystick ---
    this.root.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.tc-stick')) return; // stick-urile își gestionează singure atingerea
      if (e.clientX > window.innerWidth * 0.45) return; // dreapta = zona de atac
      if (this.moveId !== null) {
        // pointer blocat anterior (up pierdut în afara ecranului): îl furăm,
        // altfel joystick-ul n-ar mai apărea niciodată
        if (e.pointerId === this.moveId) return;
        this.resetMove();
      }
      this.moveId = e.pointerId;
      this.moveOx = e.clientX; this.moveOy = e.clientY;
      this.place(this.moveBase!, e.clientX, e.clientY);
      this.vibrate(8);
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.moveId || !this.moveBase) return;
      const R = this.radius(this.moveBase);
      const dx = (e.clientX - this.moveOx) / R;
      const dz = (e.clientY - this.moveOy) / R;
      const l = Math.hypot(dx, dz) || 1;
      const c = Math.min(1, l);
      this.state.mx = (dx / l) * c;
      this.state.mz = (dz / l) * c;
      this.moveKnob!.style.transform = `translate(${this.state.mx * R * 0.7}px, ${this.state.mz * R * 0.7}px)`;
    });
    const endMove = (e: PointerEvent) => {
      if (e.pointerId !== this.moveId) return;
      this.moveId = null;
      this.state.mx = 0; this.state.mz = 0;
      this.moveKnob!.style.transform = 'translate(0,0)';
      this.moveBase!.classList.remove('anchored');
    };
    window.addEventListener('pointerup', endMove);
    window.addEventListener('pointercancel', endMove);

    // --- stick-uri de foc (atac + super) ---
    this.bindFireStick(this.atkBase!, this.atkKnob!, false);
    this.bindFireStick(this.supBase!, this.supKnob!, true);
  }

  private bindFireStick(base: HTMLElement, knob: HTMLElement, isSuper: boolean) {
    let pid: number | null = null;
    let dragged = false;
    const center = () => {
      const r = base.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, rad: r.width / 2 };
    };
    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pid !== null) return;
      pid = e.pointerId;
      dragged = false;
      base.classList.add('held');
      try { base.setPointerCapture(e.pointerId); } catch { /* noop */ }
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const c = center();
      const dx = e.clientX - c.x, dy = e.clientY - c.y;
      const l = Math.hypot(dx, dy);
      if (l > c.rad * TAP_RATIO) {
        dragged = true;
        const cl = Math.min(1, l / c.rad);
        const nx = (dx / (l || 1)) * cl, ny = (dy / (l || 1)) * cl;
        this.state.ax = nx;
        this.state.az = ny;
        this.state.aiming = true;
        knob.style.transform = `translate(${nx * c.rad * 0.62}px, ${ny * c.rad * 0.62}px)`;
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = null;
      base.classList.remove('held');
      knob.style.transform = 'translate(0,0)';
      if (dragged) {
        // drag → foc în direcția trasă (aim manual păstrat până la consum)
        if (isSuper) { this.state.superPressed = true; this.aimedSuper = true; }
        else { this.state.attackPressed = true; this.aimedShot = true; }
        this.vibrate(20);
      } else {
        // tap → foc instant cu auto-aim (jocul alege ținta)
        this.state.aiming = false;
        if (isSuper) this.state.superPressed = true;
        else this.state.attackPressed = true;
        this.vibrate(15);
      }
    };
    base.addEventListener('pointerup', up);
    base.addEventListener('pointercancel', () => {
      pid = null;
      base.classList.remove('held');
      knob.style.transform = 'translate(0,0)';
      this.state.aiming = false;
    });
  }

  /** Reset total (la ieșirea din meci): niciun deget blocat nu rămâne. */
  reset() {
    this.moveId = null;
    this.resetMove();
    this.state.aiming = false;
    this.state.attackPressed = false;
    this.state.superPressed = false;
    this.aimedShot = false;
    this.aimedSuper = false;
    for (const [base, knob] of [
      [this.atkBase, this.atkKnob],
      [this.supBase, this.supKnob],
    ] as const) {
      base?.classList.remove('held');
      if (knob) knob.style.transform = 'translate(0,0)';
    }
  }

  private resetMove() {
    this.moveId = null;
    this.state.mx = 0; this.state.mz = 0;
    if (this.moveKnob) this.moveKnob.style.transform = 'translate(0,0)';
    this.moveBase?.classList.remove('anchored');
  }

  private place(el: HTMLElement, x: number, y: number) {
    el.classList.add('anchored');
    const r = el.getBoundingClientRect();
    el.style.left = `${x - r.width / 2}px`;
    el.style.top = `${y - r.height / 2}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  private vibrate(ms: number) {
    if (settings.data.vibration && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch { /* noop */ }
    }
  }

  /** Tastatură pentru test pe desktop (WASD + mouse). */
  pollKeyboard(canvas: HTMLCanvasElement, aimWorld: { x: number; z: number } | null, playerPos: { x: number; z: number }) {
    const k = this.keys;
    let kx = 0, kz = 0;
    if (k.has('w') || k.has('arrowup')) kz -= 1;
    if (k.has('s') || k.has('arrowdown')) kz += 1;
    if (k.has('a') || k.has('arrowleft')) kx -= 1;
    if (k.has('d') || k.has('arrowright')) kx += 1;
    if (kx || kz) {
      const l = Math.hypot(kx, kz);
      this.state.mx = kx / l;
      this.state.mz = kz / l;
    }
    if (aimWorld) {
      const dx = aimWorld.x - playerPos.x;
      const dz = aimWorld.z - playerPos.z;
      if (Math.hypot(dx, dz) > 0.5) {
        const l = Math.hypot(dx, dz);
        this.state.ax = dx / l;
        this.state.az = dz / l;
      }
    }
    if (k.has(' ')) {
      this.state.attackPressed = true;
      k.delete(' ');
    }
    if (k.has('e')) {
      this.state.superPressed = true;
      k.delete('e');
    }
    void canvas;
  }

  consumeAttack(): boolean {
    const v = this.state.attackPressed;
    this.state.attackPressed = false;
    if (v && this.aimedShot) {
      // foc tras prin drag: aimul manual a fost folosit, îl eliberăm acum
      this.aimedShot = false;
      this.state.aiming = false;
    }
    return v;
  }
  consumeSuper(): boolean {
    const v = this.state.superPressed;
    this.state.superPressed = false;
    if (v && this.aimedSuper) {
      this.aimedSuper = false;
      this.state.aiming = false;
    }
    return v;
  }

  /** Aprinde/stinge vizual stick-ul de super (gata de folosit sau nu). */
  setSuperReady(ready: boolean) {
    this.supBase?.classList.toggle('ready', ready);
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? 'block' : 'none';
  }

  refreshSizes() {
    const s = settings.data.joystickSize;
    this.root.style.setProperty('--joy', `${s}`);
  }

  get moveVec() {
    return { x: this.state.mx, z: this.state.mz };
  }
  get aimVec() {
    return { x: this.state.ax, z: this.state.az };
  }
}
