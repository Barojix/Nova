// Damage numbers + shake — HTML overlay (ieftin pe mobil, fără sprite texturi).
export class Floaters {
  private root: HTMLElement;
  constructor(root: HTMLElement) {
    this.root = root;
  }
  spawn(worldToScreen: (x: number, y: number, z: number) => { x: number; y: number } | null,
    x: number, y: number, z: number, text: string, cls = '') {
    const p = worldToScreen(x, y, z);
    if (!p) return;
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.textContent = text;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('go'));
    setTimeout(() => el.remove(), 900);
  }
}

export class Shake {
  trauma = 0;
  add(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  update(dt: number) {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }
  get offset(): { x: number; y: number } {
    const s = this.trauma * this.trauma * 0.9;
    return {
      x: (Math.random() - 0.5) * 2 * s,
      y: (Math.random() - 0.5) * 2 * s,
    };
  }
}
