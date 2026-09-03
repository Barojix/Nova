import type { ClientMsg, ServerMsg } from '../networking/protocol';
import { perf } from '../core/Perf';
import { Logger } from '../core/Logger';

const VITE_ENV: Record<string, string | undefined> =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};

export const SERVER_URL = VITE_ENV.VITE_NOVA_SERVER || 'ws://localhost:2567';

// Client WS cu reconnect + ping + fallback offline. Nu blochează jocul.
export class NetClient {
  private ws: WebSocket | null = null;
  online = false;
  room = '';
  myId = 0;
  onSnap: ((s: Extract<ServerMsg, { t: 'snap' }>) => void) | null = null;
  onEvent: ((e: string, a?: unknown) => void) | null = null;
  onReward: ((r: { coins: number; xp: number; trophies: number }) => void) | null = null;
  onProfile: ((p: import('../networking/protocol').PublicProfile) => void) | null = null;
  onStatus: ((online: boolean) => void) | null = null;
  private retries = 0;
  private closed = false;
  private lastPing = 0;

  connect(opts: { name: string; heroId: string; modeId: string; room?: string; token?: string }) {
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
        modeId: opts.modeId, room: opts.room, token: opts.token,
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
        if (msg.profile) this.onProfile?.(msg.profile);
        this.onStatus?.(true);
        this.pingLoop();
      } else if (msg.t === 'profile') {
        this.onProfile?.(msg.profile);
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

/** Cerere unică de autentificare (register/login/refresh). Închide socket-ul după răspuns. */
export function authRequest(
  kind: 'register' | 'login' | 'refresh',
  name?: string,
  pass?: string,
  token?: string,
): Promise<{ token: string; profile: import('../networking/protocol').PublicProfile }> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(SERVER_URL);
    } catch {
      reject(new Error('Serverul nu răspunde. Verifică conexiunea.'));
      return;
    }
    const done = (fn: () => void) => {
      window.clearTimeout(to);
      try {
        ws.close();
      } catch { /* ignore */ }
      fn();
    };
    const to = window.setTimeout(() => done(() => reject(new Error('Serverul nu răspunde (timeout).'))), 8000);
    ws.onopen = () => {
      const msg: ClientMsg =
        kind === 'refresh'
          ? { t: 'refresh', token: token ?? '' }
          : kind === 'register'
            ? { t: 'register', name: name ?? '', pass: pass ?? '' }
            : { t: 'login', name: name ?? '', pass: pass ?? '' };
      ws.send(JSON.stringify(msg));
    };
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (m.t === 'auth-ok') done(() => resolve({ token: m.token, profile: m.profile }));
      else if (m.t === 'auth-error') done(() => reject(new Error(m.msg)));
    };
    ws.onerror = () => done(() => reject(new Error('Serverul nu răspunde. Verifică conexiunea.')));
  });
}
