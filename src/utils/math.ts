export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2d = (ax: number, az: number, bx: number, bz: number) =>
  Math.hypot(ax - bx, az - bz);
export const angleTo = (ax: number, az: number, bx: number, bz: number) =>
  Math.atan2(bx - ax, bz - az);

let _uid = 1;
export const uid = () => _uid++;

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Pool generic — zero alocări în timpul meciului (anti-GC spikes pe mobil). */
export class Pool<T> {
  private free: T[] = [];
  constructor(private factory: () => T, prewarm = 0) {
    for (let i = 0; i < prewarm; i++) this.free.push(factory());
  }
  acquire(): T {
    return this.free.pop() ?? this.factory();
  }
  release(o: T) {
    this.free.push(o);
  }
  get size() {
    return this.free.length;
  }
}
