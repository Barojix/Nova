import type { ClientMsg, ServerMsg } from '../networking/protocol';
import { perf } from '../core/Perf';
import { Logger } from '../core/Logger';

export const SERVER_URL =
  (import.meta.env.VITE_NOVA_SERVER as string | undefined) || 'ws://localhost:2567';

// Client WS cu reconnect + ping + fallback offline. Nu blochează jocul.
export class NetClient {
  private ws: WebSocket | null = null;
  online = false;
  room = '';
  myId = 0;
  onSnap: ((s: Extract<ServerMsg, { t: 'snap' }>) => void) | null = null;
  onEvent: ((e: string, a?: unknown) => void) | null = null;
  onReward: ((r: { coins: number; xp: number; trophies: number }) => void) | null = null;
  onStatus: ((online: boolean) => void) | null = null;
  private retries = 0;
  private closed = false;
  private lastPing = 0;

  connect(opts: { name: string; heroId: string; modeId: string; room?: string }) {
    this.closed = false;
    perf.netState = 'connecting';
    let ws: WebSocket;
    try {
      ws = new WebSocket(SERVER_URL);
    } catch (e) {
      Logger.warn('net indisponibil, mod offline', e);
      this.setOffline();
      return;
    }
    this.ws = ws;
    const timeout = window.setTimeout(() => {
      if (!this.online) {
        try { ws.close(); } catch { /* noop */ }
        this.setOffline();
      }
    }, 3500);

    ws.onopen = () => {
      const hello: ClientMsg = {
        t: 'hello', name: opts.name, heroId: opts.heroId,
        modeId: opts.modeId, room: opts.room,
      };
      ws.send(JSON.stringify(hello));
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        window.clearTimeout(timeout);
        this.online = true;
        this.myId = msg.id;
        this.room = msg.room;
        this.retries = 0;
        perf.netState = 'online';
        this.onStatus?.(true);
        this.pingLoop();
      } else if (msg.t === 'snap') {
        this.onSnap?.(msg);
      } else if (msg.t === 'event') {
        this.onEvent?.(msg.e, msg.a);
      } else if (msg.t === 'reward') {
        this.onReward?.(msg);
      } else if (msg.t === 'pong') {
        perf.ping = Math.round(performance.now() - this.lastPing);
      } else if (msg.t === 'error') {
        Logger.warn('server:', msg.msg);
      }
    };
    ws.onerror = () => {
      window.clearTimeout(timeout);
      this.setOffline();
    };
    ws.onclose = () => {
      window.clearTimeout(timeout);
      if (!this.closed && this.retries < 2 && !this.online) {
        // NOTĂ: nu reconectăm agresiv în meci offline — un singur retry
        this.retries++;
        window.setTimeout(() => {
          if (!this.online && !this.closed) this.connect(opts);
        }, 1200);
      } else if (this.online) {
        this.setOffline();
      } else {
        this.setOffline();
      }
    };
  }

  private pingLoop() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.lastPing = performance.now();
    this.send({ t: 'ping', at: Date.now() });
    window.setTimeout(() => {
      if (this.online) this.pingLoop();
    }, 3000);
  }

  private setOffline() {
    this.online = false;
    perf.netState = 'offline';
    perf.ping = 0;
    this.onStatus?.(false);
  }

  send(m: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(m));
      } catch { /* ignore */ }
    }
  }

  disconnect() {
    this.closed = true;
    try {
      this.ws?.close();
    } catch { /* ignore */ }
    this.setOffline();
  }
}
