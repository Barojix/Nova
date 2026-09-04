import type {
  ClientMsg, FriendEntry, RoomStateInfo, ServerMsg,
} from '../networking/protocol';
import { SERVER_URL } from './NetClient';
import { Logger } from '../core/Logger';

// Conexiune persistentă de lobby: prieteni, prezență, camere custom.
// Separată de socket-ul de meci (NetClient). Necesită cont logat.
export class LobbyClient {
  private ws: WebSocket | null = null;
  connected = false;
  onFriends: ((friends: FriendEntry[], incoming: FriendEntry[], outgoing: string[]) => void) | null = null;
  onRoom: ((room: RoomStateInfo | null) => void) | null = null;
  onInvite: ((code: string, from: string, mode: string) => void) | null = null;
  onNotice: ((msg: string) => void) | null = null;

  connect(token: string) {
    this.disconnect();
    let ws: WebSocket;
    try {
      ws = new WebSocket(SERVER_URL);
    } catch (e) {
      Logger.warn('lobby indisponibil', e);
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.send({ t: 'lobby-hello', token } as ClientMsg);
    };
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (m.t === 'lobby-ok') {
        this.connected = true;
      } else if (m.t === 'friend-state') {
        this.onFriends?.(m.friends, m.incoming, m.outgoing);
      } else if (m.t === 'room-state') {
        this.onRoom?.(m.room);
      } else if (m.t === 'room-invite') {
        this.onInvite?.(m.code, m.from, m.mode);
      } else if (m.t === 'error') {
        this.onNotice?.(m.msg);
      }
    };
    ws.onclose = () => {
      this.connected = false;
    };
    ws.onerror = () => {
      try { ws.close(); } catch { /* noop */ }
    };
  }

  send(m: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(m));
      } catch { /* ignore */ }
    }
  }

  disconnect() {
    try {
      this.ws?.close();
    } catch { /* ignore */ }
    this.ws = null;
    this.connected = false;
  }
}

export const lobby = new LobbyClient();
