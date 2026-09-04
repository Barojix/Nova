// Server autoritativ Nova Arena — Node + ws.
// Validează: input (clamp + NaN-drop), rate, damage/HP/recompense (tabele oglindite).
// Rulează simularea pură din ../src/game/Match.ts (fără Three.js).
import { WebSocketServer, WebSocket } from 'ws';
import { Match, type SimFighter, type SimInput } from '../../src/game/Match.js';
import { canSee } from '../../src/game/visibility.js';
import { mapById, mapForMode } from '../../src/data/maps.js';
import { heroById, isHeroId, scaleHeroDef, HERO_IDS } from '../../src/data/heroes.js';
import { MODES } from '../../src/data/modes.js';
import { uid } from '../../src/utils/math.js';
import { MATCH_REWARDS } from '../../src/data/economy.js';
import { store, toPublic } from './store.js';
import type { ClientMsg, ServerMsg } from '../../src/networking/protocol.js';

const PORT = Number(process.env.PORT ?? 2567);
const TICK_HZ = 20;
const SNAP_HZ = 15;

const clampN = (v: unknown, a: number, b: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(a, Math.min(b, n));
};

interface Player {
  ws: WebSocket;
  fighterId: number;
  name: string;
  accountId?: string;
  input: SimInput;
  lastInputAt: number;
  lastAttackAt: number;
}

interface Room {
  code: string;
  modeId: string;
  match: Match;
  players: Player[];
  createdAt: number;
  endedAt: number;
  snapT: number;
  /** cameră custom: fără umplere cu boți, membrii pre-definiți din lobby */
  custom?: { hostId: string; members: Map<string, number> };
}

/** Lobby custom (înainte de start): cod -> setări + jucători. */
interface Lobby {
  code: string;
  modeId: string;
  mapId: string;
  hostId: string;
  players: Map<string, { ws: WebSocket; name: string; hero: string }>;
}

const rooms = new Map<string, Room>();
const lobbies = new Map<string, Lobby>();
/** prezență: accountId -> socket-uri deschise (lobby + meciuri) */
const accountSockets = new Map<string, Set<WebSocket>>();
/** socket lobby -> accountId */
const lobbyByWs = new Map<WebSocket, string>();
const authHits = new Map<string, number[]>();
let roomSeq = 1;

const BOT_NAMES = ['Rook', 'Zed', 'Pip', 'Kira', 'Jax', 'Luma', 'Onyx', 'Fizz'];

function roomSize(modeId: string): number {
  if (modeId === 'showdown') return 10;
  if (modeId === 'training') return 4;
  return 6;
}

const VALID_MODES = new Set(MODES.map((m) => m.id));

function onlineIds(): Set<string> {
  return new Set(accountSockets.keys());
}

function trackSocket(accountId: string | undefined, ws: WebSocket) {
  if (!accountId) return;
  let set = accountSockets.get(accountId);
  if (!set) {
    set = new Set();
    accountSockets.set(accountId, set);
  }
  set.add(ws);
}

function untrackSocket(ws: WebSocket) {
  for (const [id, set] of accountSockets) {
    if (set.delete(ws) && set.size === 0) accountSockets.delete(id);
  }
  lobbyByWs.delete(ws);
}

function sendToAccount(accountId: string, msg: unknown) {
  const set = accountSockets.get(accountId);
  if (!set) return false;
  let ok = false;
  for (const ws of set) {
    if (ws.readyState === 1) {
      send(ws, msg as never);
      ok = true;
    }
  }
  return ok;
}

function lobbyState(l: Lobby): Extract<import('../../src/networking/protocol.js').ServerMsg, { t: 'room-state' }> {
  return {
    t: 'room-state',
    room: {
      code: l.code,
      mode: l.modeId,
      map: l.mapId,
      mapName: mapById(l.mapId).name,
      host: false, // completat per-destinatar
      players: [...l.players.values()].map((p) => ({ name: p.name, hero: p.hero, host: false })),
      started: false,
    },
  };
}

function broadcastLobby(l: Lobby) {
  for (const [id, p] of l.players) {
    const st = lobbyState(l);
    if (st.room) {
      st.room.host = id === l.hostId;
      st.room.players = [...l.players.entries()].map(([pid, pl]) => ({
        name: pl.name, hero: pl.hero, host: pid === l.hostId,
      }));
    }
    if (p.ws.readyState === 1) send(p.ws, st as never);
  }
}

function leaveLobby(ws: WebSocket) {
  for (const [code, l] of lobbies) {
    for (const [id, p] of l.players) {
      if (p.ws === ws) {
        l.players.delete(id);
        if (l.players.size === 0) {
          lobbies.delete(code);
          console.log(`[lobby] ${code} închis (gol)`);
        } else {
          if (l.hostId === id) {
            l.hostId = [...l.players.keys()][0];
          }
          broadcastLobby(l);
        }
        return;
      }
    }
  }
}

// AI server-side minimal (fără Three.js): apropiere + trage în range + strânge stele.
function serverBot(m: Match, f: SimFighter, dt: number): SimInput {
  const out: SimInput = { mx: 0, mz: 0, ax: 0, az: 0, attack: false, super: false };
  if (!f.alive) return out;
  f.aiT -= dt;
  let target: SimFighter | null = null;
  let best = Infinity;
  for (const e of m.fighters) {
    if (!e.alive || e.id === f.id) continue;
    if (m.modeId !== 'showdown' && e.team === f.team) continue;
    if (!canSee(m.map.bushes, f.x, f.z, e.x, e.z)) continue;
    const d = Math.hypot(e.x - f.x, e.z - f.z);
    if (d < best) {
      best = d;
      target = e;
    }
  }
  let gx: number | null = null;
  let gz: number | null = null;
  if ((m.modeId === 'starrush' || m.modeId === 'gemgrab') && f.stars < 6 && m.stars.length > 0) {
    let bd = 10;
    for (const s of m.stars) {
      const d = Math.hypot(s.x - f.x, s.z - f.z);
      if (d < bd) {
        bd = d;
        gx = s.x;
        gz = s.z;
      }
    }
  }
  if (m.modeId === 'heist' && (!target || best > f.def.range)) {
    const foe = m.safes.find((s) => s.team !== f.team && s.hp > 0);
    if (foe) {
      gx = foe.x + (f.team === 0 ? 3 : -3);
      gz = foe.z;
      const d = Math.hypot(foe.x - f.x, foe.z - f.z);
      if (d < f.def.range) {
        out.ax = (foe.x - f.x) / (d || 1);
        out.az = (foe.z - f.z) / (d || 1);
        out.attack = Math.random() < 0.8;
      }
    }
  }
  if (f.hp < f.def.hp * 0.3) {
    gx = f.team === 0 ? -12 : 12;
    gz = 0;
  } else if (target && (gx === null || best < 5)) {
    gx = target.x;
    gz = target.z;
  }
  if (gx === null || gz === null) {
    if (f.aiT <= 0) {
      f.aiT = 1 + Math.random() * 2;
      f.aiTx = (Math.random() - 0.5) * 16;
      f.aiTz = (Math.random() - 0.5) * 16;
    }
    gx = f.aiTx;
    gz = f.aiTz;
  }
  // anti-blocare în ziduri: progres mic + țintă departe -> ocolire perpendiculară
  const hasPrev = f.lx !== undefined;
  const moved = hasPrev ? Math.hypot(f.x - f.lx!, f.z - f.lz!) : 99;
  f.lx = f.x;
  f.lz = f.z;
  if ((f.stuckT ?? 0) > 0) {
    f.stuckT = (f.stuckT ?? 0) - dt;
  } else if (hasPrev && moved < 0.15 && Math.hypot(gx - f.x, gz - f.z) > 3) {
    const gl = Math.hypot(gx - f.x, gz - f.z) || 1;
    const nx = (gx - f.x) / gl;
    const nz = (gz - f.z) / gl;
    const side = Math.random() < 0.5 ? 1 : -1;
    gx = f.x + -nz * side * 7;
    gz = f.z + nx * side * 7;
    f.aiTx = Math.max(-15, Math.min(15, gx));
    f.aiTz = Math.max(-15, Math.min(15, gz));
    gx = f.aiTx;
    gz = f.aiTz;
    f.stuckT = 1.4;
  }
  const dx = gx - f.x;
  const dz = gz - f.z;
  const dl = Math.hypot(dx, dz);
  // păstrează distanța optimă de tragere
  if (target && best < f.def.range * 0.6) {
    out.mx = -dx / (dl || 1);
    out.mz = -dz / (dl || 1);
  } else if (dl > 1) {
    out.mx = dx / dl;
    out.mz = dz / dl;
  }
  if (target && best < f.def.range) {
    const ax = target.x - f.x;
    const az = target.z - f.z;
    const al = Math.hypot(ax, az) || 1;
    out.ax = ax / al;
    out.az = az / al;
    out.attack = true;
    if (f.superReady && best < f.def.superRange * 0.8 && Math.random() < 0.1) out.super = true;
  }
  return out;
}

function send(ws: WebSocket, m: ServerMsg) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(m));
    } catch {
      /* ignore */
    }
  }
}

function snapOf(room: Room): Extract<ServerMsg, { t: 'snap' }> {
  const m = room.match;
  return {
    t: 'snap',
    fighters: m.fighters.map((f) => ({
      id: f.id, x: f.x, z: f.z, facing: f.facing,
      hp: Math.max(0, Math.round(f.hp)), maxHp: f.def.hp,
      alive: f.alive, team: f.team, heroId: f.heroId, name: f.name,
      kills: f.kills, stars: f.stars, superReady: f.superReady,
    })),
    bullets: m.bullets.map((b) => ({ x: b.x, z: b.z, dx: b.dx, dz: b.dz, super: b.isSuper, color: b.color, big: b.big })),
    stars: m.stars.map((s) => ({ id: s.id, x: s.x, z: s.z })),
    cubes: m.cubes.map((s) => ({ id: s.id, x: s.x, z: s.z })),
    crates: m.crates.map((s) => ({ id: s.id, x: s.x, z: s.z })),
    safes: m.safes.map((s) => ({ team: s.team, hp: Math.max(0, Math.round(s.hp)), maxHp: s.maxHp, x: s.x, z: s.z })),
    gas: m.gasR,
    scoreA: m.scoreA, scoreB: m.scoreB,
    time: m.time, over: m.over, winner: m.winner,
  };
}

function findOrCreateRoom(modeId: string, code?: string): Room {
  if (code) {
    const r = rooms.get(code);
    if (r && !r.match.over && r.players.length < roomSize(r.modeId)) return r;
  }
  for (const r of rooms.values()) {
    if (r.custom) continue; // custom nu primește străini din quick-match
    if (r.modeId === modeId && !r.match.over && r.players.length < roomSize(modeId)) return r;
  }
  const map = mapById(mapForMode(modeId));
  const room: Room = {
    code: `R${roomSeq++}${Math.floor(Math.random() * 90 + 10)}`,
    modeId,
    match: new Match(modeId, map, []),
    players: [],
    createdAt: Date.now(),
    endedAt: 0,
    snapT: 0,
  };
  rooms.set(room.code, room);
  console.log(`[room] ${room.code} ${modeId} pe ${map.name}`);
  return room;
}

function teamFor(room: Room): number {
  if (room.modeId === 'showdown') return room.match.fighters.length;
  const a = room.match.fighters.filter((f) => f.team === 0).length;
  const b = room.match.fighters.filter((f) => f.team === 1).length;
  return a <= b ? 0 : 1;
}

const wss = new WebSocketServer({ port: PORT });
console.log(`[starforge-server] ascult pe :${PORT}`);

wss.on('connection', (ws: WebSocket, req) => {
  let room: Room | null = null;
  let player: Player | null = null;
  let connToken = '';
  const ip = req?.socket?.remoteAddress ?? 'unknown';

  const authAllowed = (): boolean => {
    const now = Date.now();
    const arr = (authHits.get(ip) ?? []).filter((t) => now - t < 60000);
    if (arr.length >= 10) return false;
    arr.push(now);
    authHits.set(ip, arr);
    return true;
  };

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { t: 'error', msg: ' mesaj invalid' });
      return;
    }
    if (msg.t === 'hello') {
      const modeId = VALID_MODES.has(msg.modeId) ? msg.modeId : 'knockout';
      room = findOrCreateRoom(modeId, msg.room);
      const m = room.match;
      const account = msg.token ? store.refresh(msg.token) : null;
      if (account) {
        connToken = account.token;
        trackSocket(account.id, ws);
      }
      // cameră custom pornită: membrul se atașează la luptătorul rezervat
      if (room.custom && account) {
        const fid = room.custom.members.get(account.id);
        const f = m.fighters.find((x) => x.id === fid);
        if (!f) {
          send(ws, { t: 'error', msg: 'Camera a pornit fără tine. Creează alta.' });
          return;
        }
        player = {
          ws, fighterId: f.id, name: f.name,
          accountId: account.id,
          input: { mx: 0, mz: 0, ax: 1, az: 0, attack: false, super: false },
          lastInputAt: Date.now(), lastAttackAt: 0,
        };
        room.players.push(player);
        trackSocket(account.id, ws);
        send(ws, {
          t: 'welcome', id: f.id, room: room.code, online: true,
          profile: toPublic(account),
        });
        console.log(`[join-custom] ${f.name} -> ${room.code}`);
        return;
      }
      const heroId = isHeroId(msg.heroId) ? msg.heroId : 'volt';
      const power = account
        ? Math.max(1, Math.min(11, Math.round(account.heroPower[heroId] ?? 1)))
        : 1;
      const name = account ? account.name : String(msg.name ?? 'Erou').slice(0, 14) || 'Erou';
      const team = teamFor(room);
      // spawn simplu pe jumătatea echipei
      const sp = team === 0 ? { x: -13, z: 0 } : { x: 13, z: 0 };
      const def = scaleHeroDef(heroById(heroId), power);
      const f: SimFighter = {
        id: uid(), name, heroId, def, team,
        isBot: false, isLocal: false,
        x: sp.x + (Math.random() - 0.5) * 2, z: sp.z + (Math.random() - 0.5) * 4,
        facing: 0, hp: def.hp, alive: true, respawnT: 0, reloadT: 0,
        superCharge: 0, superReady: false, supersUsed: 0, kills: 0, deaths: 0, stars: 0,
        power, powerups: 0,
        aiT: 0, aiTx: 0, aiTz: 0, aiMode: 'fight',
      };
      m.fighters.push(f);
      // completează cu boți până la dimensiunea camerei (nu la custom)
      const want = roomSize(room.modeId);
      if (!room.custom) {
      const botsNow = m.fighters.filter((x) => x.isBot).length;
      const humans = m.fighters.filter((x) => !x.isBot).length;
      for (let i = humans + botsNow; i < want; i++) {
        const bt = room.modeId === 'showdown' ? i : teamFor(room);
        const bh = HERO_IDS[i % HERO_IDS.length];
        const bdef = scaleHeroDef(heroById(bh), 1 + (i % 3));
        const a = (i / want) * Math.PI * 2;
        const bsp = room.modeId === 'showdown'
          ? { x: Math.cos(a) * 12, z: Math.sin(a) * 12 }
          : bt === 0 ? { x: -13, z: (i % 3) * 2 - 2 } : { x: 13, z: (i % 3) * 2 - 2 };
        m.fighters.push({
          id: uid(), name: BOT_NAMES[i % BOT_NAMES.length], heroId: bh, def: bdef, team: bt,
          isBot: true, isLocal: false,
          x: bsp.x, z: bsp.z, facing: 0, hp: bdef.hp, alive: true,
          respawnT: 0, reloadT: 0, superCharge: 0, superReady: false, supersUsed: 0,
          kills: 0, deaths: 0, stars: 0, power: 1, powerups: 0,
          aiT: 0, aiTx: 0, aiTz: 0, aiMode: 'fight',
        });
      }
      }
      player = {
        ws, fighterId: f.id, name,
        accountId: account?.id,
        input: { mx: 0, mz: 0, ax: 1, az: 0, attack: false, super: false },
        lastInputAt: Date.now(), lastAttackAt: 0,
      };
      room.players.push(player);
      // cameră plină cu boți? eliberează un bot pentru om (maxim constant)
      const maxTotal = roomSize(room.modeId);
      const bots = m.fighters.filter((x) => x.isBot);
      if (m.fighters.length > maxTotal && bots.length > 0) {
        const drop = bots[bots.length - 1];
        m.fighters = m.fighters.filter((x) => x.id !== drop.id);
        console.log(`[room] ${room.code}: bot ${drop.name} înlocuit de ${name}`);
      }
      send(ws, {
        t: 'welcome', id: f.id, room: room.code, online: true,
        profile: account ? toPublic(account) : undefined,
      });
      console.log(`[join] ${name} -> ${room.code} (${room.players.length} umani)`);
      return;
    }
    if (msg.t === 'register' || msg.t === 'login' || msg.t === 'refresh') {
      if (!authAllowed()) {
        send(ws, { t: 'auth-error', msg: 'Prea multe încercări. Așteaptă un minut.' });
        return;
      }
      if (msg.t === 'refresh') {
        const a = store.refresh(msg.token);
        if (a) send(ws, { t: 'auth-ok', token: a.token, profile: toPublic(a) });
        else send(ws, { t: 'auth-error', msg: 'Sesiune expirată. Conectează-te din nou.' });
        return;
      }
      const r = msg.t === 'register' ? store.register(msg.name, msg.pass) : store.login(msg.name, msg.pass);
      if (r.ok && r.account) {
        send(ws, { t: 'auth-ok', token: r.account.token, profile: toPublic(r.account) });
      } else {
        send(ws, { t: 'auth-error', msg: r.msg ?? 'Eroare autentificare.' });
      }
      return;
    }
    if (msg.t === 'profile') {
      const a = store.refresh(connToken);
      if (a) send(ws, { t: 'profile', profile: toPublic(a) });
      return;
    }
    if (msg.t === 'shop-buy' || msg.t === 'shop-equip' || msg.t === 'quest-claim') {
      if (!authAllowed()) {
        send(ws, { t: 'shop-result', ok: false, msg: 'Prea multe cereri. Așteaptă.' });
        return;
      }
      const a = store.refresh(msg.token);
      if (!a) {
        send(ws, { t: 'shop-result', ok: false, msg: 'Sesiune expirată. Conectează-te din nou.' });
        return;
      }
      const r =
        msg.t === 'shop-buy'
          ? store.buyItem(a.id, msg.item)
          : msg.t === 'shop-equip'
            ? store.equipSkin(a.id, msg.heroId, msg.item)
            : store.claimQuest(a.id, msg.quest);
      send(ws, { t: 'shop-result', ok: r.ok, msg: r.msg, profile: r.profile });
      return;
    }
    if (msg.t === 'hero-upgrade') {
      if (!authAllowed()) {
        send(ws, { t: 'shop-result', ok: false, msg: 'Prea multe cereri. Așteaptă.' });
        return;
      }
      const a = store.refresh(msg.token);
      if (!a) {
        send(ws, { t: 'shop-result', ok: false, msg: 'Sesiune expirată. Conectează-te din nou.' });
        return;
      }
      const r = store.upgradeHero(a.id, msg.hero);
      send(ws, { t: 'shop-result', ok: r.ok, msg: r.msg, profile: r.profile });
      return;
    }
    if (msg.t === 'lobby-hello') {
      const a = store.refresh(msg.token);
      if (!a) {
        send(ws, { t: 'error', msg: 'Sesiune expirată. Conectează-te din nou.' });
        return;
      }
      connToken = a.token;
      lobbyByWs.set(ws, a.id);
      trackSocket(a.id, ws);
      send(ws, { t: 'lobby-ok' });
      send(ws, {
        t: 'friend-state',
        ...store.friendState(a.id, onlineIds()),
      });
      return;
    }
    if (
      msg.t === 'friend-add' || msg.t === 'friend-accept' ||
      msg.t === 'friend-decline' || msg.t === 'friend-remove' ||
      msg.t === 'friend-list' || msg.t === 'friend-invite'
    ) {
      if (!authAllowed()) {
        send(ws, { t: 'error', msg: 'Prea multe cereri. Așteaptă.' });
        return;
      }
      const a = store.refresh(msg.token);
      if (!a) {
        send(ws, { t: 'error', msg: 'Sesiune expirată.' });
        return;
      }
      if (msg.t === 'friend-list') {
        send(ws, { t: 'friend-state', ...store.friendState(a.id, onlineIds()) });
        return;
      }
      if (msg.t === 'friend-invite') {
        // invită un prieten în camera custom unde ești (trebuie să fii în lobby)
        let mine: Lobby | null = null;
        for (const l of lobbies.values()) {
          if (l.players.has(a.id)) { mine = l; break; }
        }
        if (!mine) {
          send(ws, { t: 'error', msg: 'Creează mai întâi o cameră.' });
          return;
        }
        const other = store.accountByName(msg.name);
        if (!other || !a.friends.includes(other.id)) {
          send(ws, { t: 'error', msg: 'Doar prietenii pot fi invitați.' });
          return;
        }
        const delivered = sendToAccount(other.id, {
          t: 'room-invite', code: mine.code, from: a.name, mode: mine.modeId,
        });
        send(ws, {
          t: 'error',
          msg: delivered ? `Invitație trimisă lui ${other.name}!` : `${other.name} nu e online acum. Dă-i codul: ${mine.code}`,
        });
        return;
      }
      const r =
        msg.t === 'friend-add' ? store.friendAdd(a.id, msg.name)
        : msg.t === 'friend-accept' ? store.friendAccept(a.id, msg.name)
        : msg.t === 'friend-decline' ? store.friendDecline(a.id, msg.name)
        : store.friendRemove(a.id, msg.name);
      if (!r.ok) {
        send(ws, { t: 'error', msg: r.msg });
        return;
      }
      // actualizează ambele părți live
      send(ws, { t: 'friend-state', ...store.friendState(a.id, onlineIds()) });
      const other = store.accountByName(msg.name);
      if (other) {
        sendToAccount(other.id, { t: 'friend-state', ...store.friendState(other.id, onlineIds()) });
      }
      return;
    }
    if (msg.t === 'room-create' || msg.t === 'room-join' || msg.t === 'room-hero' || msg.t === 'room-leave' || msg.t === 'room-start') {
      // room-hero vine pe socket-ul de lobby (fără token în mesaj)
      const token = msg.t === 'room-hero' ? '' : ((msg as { token?: string }).token ?? '');
      const myId = lobbyByWs.get(ws) ?? store.refresh(token)?.id;
      const me = myId ? store.accountById(myId) : undefined;
      if (!me) {
        send(ws, { t: 'error', msg: 'Intră în cont pentru camere custom.' });
        return;
      }
      if (msg.t === 'room-create') {
        leaveLobby(ws);
        lobbyByWs.set(ws, me.id);
        trackSocket(me.id, ws);
        const mode = VALID_MODES.has(msg.mode) && msg.mode !== 'training' ? msg.mode : 'knockout';
        const map = mapById(msg.map);
        const code = `C${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const l: Lobby = {
          code, modeId: mode, mapId: map.id, hostId: me.id,
          players: new Map([[me.id, { ws, name: me.name, hero: 'volt' }]]),
        };
        lobbies.set(code, l);
        console.log(`[lobby] ${code} ${mode} pe ${map.name} (host ${me.name})`);
        broadcastLobby(l);
        return;
      }
      if (msg.t === 'room-join') {
        const l = lobbies.get(String(msg.code ?? '').toUpperCase());
        if (!l) {
          send(ws, { t: 'error', msg: 'Cod inexistent.' });
          return;
        }
        if (l.players.size >= roomSize(l.modeId)) {
          send(ws, { t: 'error', msg: 'Camera e plină.' });
          return;
        }
        leaveLobby(ws);
        lobbyByWs.set(ws, me.id);
        trackSocket(me.id, ws);
        l.players.set(me.id, { ws, name: me.name, hero: 'volt' });
        broadcastLobby(l);
        return;
      }
      // restul: trebuie să fii într-un lobby
      let mine: Lobby | null = null;
      for (const l of lobbies.values()) {
        if (l.players.has(me.id)) { mine = l; break; }
      }
      if (!mine) {
        send(ws, { t: 'room-state', room: null });
        return;
      }
      if (msg.t === 'room-hero') {
        const pl = mine.players.get(me.id);
        if (pl && isHeroId(msg.hero)) {
          pl.hero = msg.hero;
          broadcastLobby(mine);
        }
        return;
      }
      if (msg.t === 'room-leave') {
        leaveLobby(ws);
        send(ws, { t: 'room-state', room: null });
        return;
      }
      if (msg.t === 'room-start') {
        if (mine.hostId !== me.id) {
          send(ws, { t: 'error', msg: 'Doar host-ul pornește meciul.' });
          return;
        }
        if (mine.players.size < 2) {
          send(ws, { t: 'error', msg: 'Așteaptă măcar un prieten (minim 2 jucători).' });
          return;
        }
        const map = mapById(mine.mapId);
        const room: Room = {
          code: mine.code,
          modeId: mine.modeId,
          match: new Match(mine.modeId, map, []),
          players: [],
          createdAt: Date.now(),
          endedAt: 0,
          snapT: 0,
          custom: { hostId: mine.hostId, members: new Map() },
        };
        // echipe: host 0, restul alternativ (showdown: fiecare separat)
        let i = 0;
        for (const [pid, pl] of mine.players) {
          const acc = store.accountById(pid);
          const hero = isHeroId(pl.hero) ? pl.hero : 'volt';
          const power = acc ? Math.max(1, Math.min(11, Math.round(acc.heroPower[hero] ?? 1))) : 1;
          const def = scaleHeroDef(heroById(hero), power);
          const team = mine.modeId === 'showdown' ? i : i % 2;
          const a = (i / Math.max(1, mine.players.size)) * Math.PI * 2;
          const half = map.size / 2;
          const sp = mine.modeId === 'showdown'
            ? { x: Math.cos(a) * half * 0.72, z: Math.sin(a) * half * 0.72 }
            : team === 0 ? { x: -half + 4, z: (i % 3) * 2 - 2 } : { x: half - 4, z: (i % 3) * 2 - 2 };
          const fid = uid();
          room.match.fighters.push({
            id: fid, name: pl.name, heroId: hero, def, team,
            isBot: false, isLocal: false,
            x: sp.x, z: sp.z, facing: 0, hp: def.hp, alive: true,
            respawnT: 0, reloadT: 0, superCharge: 0, superReady: false,
            supersUsed: 0, kills: 0, deaths: 0, stars: 0, power, powerups: 0,
            aiT: 0, aiTx: 0, aiTz: 0, aiMode: 'fight',
          });
          room.custom!.members.set(pid, fid);
          i++;
        }
        rooms.set(room.code, room);
        lobbies.delete(mine.code);
        console.log(`[start] custom ${room.code} ${room.modeId} cu ${room.match.fighters.length} jucători`);
        for (const [, pl] of mine.players) {
          if (pl.ws.readyState === 1) {
            send(pl.ws, {
              t: 'room-state',
              room: {
                code: room.code, mode: room.modeId, map: mine.mapId,
                mapName: map.name, host: false, players: [], started: true,
              },
            });
          }
        }
        return;
      }
    }
    if (msg.t === 'input' && room && player) {
      // validare server-side: clamp + NaN-drop + rate-limit atac
      player.input = {
        mx: clampN(msg.mx, -1, 1),
        mz: clampN(msg.mz, -1, 1),
        ax: clampN(msg.ax, -1, 1),
        az: clampN(msg.az, -1, 1),
        attack: msg.attack === true,
        super: msg.super === true,
      };
      player.lastInputAt = Date.now();
      return;
    }
    if (msg.t === 'ping') {
      send(ws, { t: 'pong', at: msg.at });
      return;
    }
  });

  ws.on('close', () => {
    leaveLobby(ws);
    untrackSocket(ws);
    if (room && player) {
      // deconectat -> luptătorul devine bot (meciul continuă pentru ceilalți)
      const f = room.match.fighters.find((x) => x.id === player!.fighterId);
      if (f) {
        f.isBot = true;
        f.name = `${player.name} (BOT)`;
      }
      room.players = room.players.filter((p) => p !== player);
      console.log(`[leave] ${player.name} din ${room.code}`);
      if (room.players.length === 0) {
        // cameră goală -> șterge după 30s
        const code = room.code;
        setTimeout(() => {
          const r = rooms.get(code);
          if (r && r.players.length === 0) {
            rooms.delete(code);
            console.log(`[room] ${code} ștearsă (goală)`);
          }
        }, 30000);
      }
    }
  });
});

// bucla autoritativă
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const room of rooms.values()) {
    const m = room.match;
    if (m.over) {
      if (!room.endedAt) {
        room.endedAt = now;
        // recompense validate + persistate server-side pentru conturi
        for (const p of room.players) {
          const f = m.fighters.find((x) => x.id === p.fighterId);
          const won = f ? f.team === m.winner : false;
          if (p.accountId) {
            const profile = store.applyMatchById(
              p.accountId, won, f?.kills ?? 0, f?.supersUsed ?? 0, f?.stars ?? 0
            );
            send(p.ws, {
              t: 'reward',
              coins: won ? MATCH_REWARDS.winCoins : MATCH_REWARDS.loseCoins,
              xp: won ? MATCH_REWARDS.winXp : MATCH_REWARDS.loseXp,
              trophies: won ? MATCH_REWARDS.trophyWin : MATCH_REWARDS.trophyLose,
              profile: profile ?? undefined,
            });
          } else {
            send(p.ws, {
              t: 'reward',
              coins: won ? MATCH_REWARDS.winCoins : MATCH_REWARDS.loseCoins,
              xp: won ? MATCH_REWARDS.winXp : MATCH_REWARDS.loseXp,
              trophies: won ? MATCH_REWARDS.trophyWin : MATCH_REWARDS.trophyLose,
            });
          }
        }
      }
      continue;
    }
    const inputs = new Map<number, SimInput>();
    for (const f of m.fighters) {
      if (f.isBot) {
        inputs.set(f.id, serverBot(m, f, dt));
      } else {
        const p = room.players.find((x) => x.fighterId === f.id);
        if (p) {
          // timeout input 3s -> preia botul (anti-AFK)
          if (now - p.lastInputAt > 3000) {
            inputs.set(f.id, serverBot(m, f, dt));
          } else {
            const inp = { ...p.input };
            // rate-limit: atacul trece prin reload-ul din sim oricum; aici doar igienă
            if (inp.attack && now - p.lastAttackAt < 200) inp.attack = false;
            if (inp.attack) p.lastAttackAt = now;
            // edge-uri: consumă-le o singură dată
            p.input.attack = false;
            p.input.super = false;
            inputs.set(f.id, inp);
          }
        } else {
          inputs.set(f.id, serverBot(m, f, dt));
        }
      }
    }
    // pași ficși
    m.update(Math.min(dt, 1 / 20), inputs);
    // transmite evenimente + snapshot
    const evts = m.drain();
    for (const e of evts) {
      for (const p of room.players) {
        send(p.ws, { t: 'event', e: e.type, a: e });
      }
    }
    room.snapT -= dt;
    if (room.snapT <= 0) {
      room.snapT = 1 / SNAP_HZ;
      const snap = snapOf(room);
      for (const p of room.players) send(p.ws, snap);
    }
  }
}, 1000 / TICK_HZ);
