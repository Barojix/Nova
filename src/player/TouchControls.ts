import { clamp } from '../utils/math';
import { settings } from '../settings/Settings';

// Stare input normalizată, consumată de GameManager la fiecare tick.
export interface InputState {
  mx: number; mz: number;      // mișcare -1..1
  ax: number; az: number;      // aim -1..1 (direcție)
  aiming: boolean;
  attackPressed: boolean;      // edge — consumat de game
  superPressed: boolean;       // edge
}

export class TouchControls {
  state: InputState = {
    mx: 0, mz: 0, ax: 1, az: 0, aiming: false,
    attackPressed: false, superPressed: false,
  };
  private moveId: number | null = null;
  private aimId: number | null = null;
  private moveCx = 0; private moveCy = 0;
  private aimSx = 0; private aimSy = 0;
  private keys = new Set<string>();
  private moveBase: HTMLElement | null = null;
  private moveKnob: HTMLElement | null = null;
  private aimBase: HTMLElement | null = null;
  private aimKnob: HTMLElement | null = null;

  constructor(private root: HTMLElement) {
    this.build();
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  private build() {
    this.root.innerHTML = `
      <div class="tc-move" id="tc-move"><div class="tc-knob" id="tc-mknob"></div></div>
      <div class="tc-aim" id="tc-aim"><div class="tc-knob aim" id="tc-aknob"></div></div>
      <div class="tc-btns">
        <button class="tc-btn super" id="tc-super">💥<span>SUPER</span></button>
        <button class="tc-btn atk" id="tc-atk">🔥<span>ATAC</span></button>
      </div>`;
    this.moveBase = this.root.querySelector('#tc-move');
    this.moveKnob = this.root.querySelector('#tc-mknob');
    this.aimBase = this.root.querySelector('#tc-aim');
    this.aimKnob = this.root.querySelector('#tc-aknob');
    const atk = this.root.querySelector('#tc-atk')!;
    const sup = this.root.querySelector('#tc-super')!;

    atk.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.state.attackPressed = true;
      this.vibrate(15);
    });
    sup.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.state.superPressed = true;
      this.vibrate(30);
    });

    // joystick mișcare — zona stânga
    const R = 60 * settings.data.joystickSize;
    this.moveBase!.addEventListener('pointerdown', (e) => {
      this.moveId = e.pointerId;
      this.moveCx = e.clientX; this.moveCy = e.clientY;
      this.positionBase(this.moveBase!, e.clientX, e.clientY);
      this.moveBase!.setPointerCapture(e.pointerId);
    });
    this.moveBase!.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.moveId) return;
      const dx = (e.clientX - this.moveCx) / R;
      const dz = (e.clientY - this.moveCy) / R;
      const l = Math.hypot(dx, dz) || 1;
      const c = Math.min(1, l);
      this.state.mx = (dx / l) * c;
      this.state.mz = (dz / l) * c;
      this.moveKnob!.style.transform = `translate(${this.state.mx * 42}px, ${this.state.mz * 42}px)`;
    });
    const endMove = (e: PointerEvent) => {
      if (e.pointerId !== this.moveId) return;
      this.moveId = null;
      this.state.mx = 0; this.state.mz = 0;
      this.moveKnob!.style.transform = 'translate(0,0)';
      this.moveBase!.style.left = '';
      this.moveBase!.style.top = '';
      this.moveBase!.classList.remove('anchored');
    };
    this.moveBase!.addEventListener('pointerup', endMove);
    this.moveBase!.addEventListener('pointercancel', endMove);

    // aim — drag oriunde în dreapta (element invizibil mare)
    this.aimBase!.addEventListener('pointerdown', (e) => {
      this.aimId = e.pointerId;
      this.aimSx = e.clientX; this.aimSy = e.clientY;
      this.state.aiming = true;
      this.positionBase(this.aimBase!, e.clientX, e.clientY);
      this.aimBase!.setPointerCapture(e.pointerId);
    });
    this.aimBase!.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.aimId) return;
      const s = settings.data.sensitivity;
      const dx = (e.clientX - this.aimSx) * 0.02 * s;
      const dz = (e.clientY - this.aimSy) * 0.02 * s;
      if (Math.hypot(dx, dz) > 0.15) {
        const l = Math.hypot(dx, dz);
        this.state.ax = dx / l;
        this.state.az = dz / l;
        this.aimKnob!.style.transform = `translate(${this.state.ax * 30}px, ${this.state.az * 30}px)`;
      }
    });
    const endAim = (e: PointerEvent) => {
      if (e.pointerId !== this.aimId) return;
      this.aimId = null;
      // ridicare deget pe aim = atac (ca în Brawl Stars)
      this.state.attackPressed = true;
      this.state.aiming = false;
      this.aimKnob!.style.transform = 'translate(0,0)';
      this.aimBase!.style.left = '';
      this.aimBase!.style.top = '';
      this.aimBase!.classList.remove('anchored');
    };
    this.aimBase!.addEventListener('pointerup', endAim);
    this.aimBase!.addEventListener('pointercancel', endAim);
  }

  private positionBase(el: HTMLElement, x: number, y: number) {
    el.classList.add('anchored');
    el.style.left = `${x - 70}px`;
    el.style.top = `${y - 70}px`;
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
    return v;
  }
  consumeSuper(): boolean {
    const v = this.state.superPressed;
    this.state.superPressed = false;
    return v;
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

export const clampVec = clamp;
