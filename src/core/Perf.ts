// Monitorizare performanță + rețea (vizibil în dev / opțiune în Setări).
export class Perf {
  fps = 0;
  frameMs = 0;
  ping = 0;
  entities = 0;
  drawCalls = 0;
  private frames = 0;
  private acc = 0;
  private last = performance.now();
  netState: 'offline' | 'connecting' | 'online' = 'offline';

  frame(now: number, rendererInfo?: { calls: number }) {
    const dt = now - this.last;
    this.last = now;
    this.frameMs = this.frameMs * 0.9 + dt * 0.1;
    this.acc += dt;
    this.frames++;
    if (this.acc >= 500) {
      this.fps = Math.round((this.frames * 1000) / this.acc);
      this.frames = 0;
      this.acc = 0;
    }
    if (rendererInfo) this.drawCalls = rendererInfo.calls;
  }
}

export const perf = new Perf();
