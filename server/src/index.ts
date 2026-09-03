// Server autoritativ Nova Arena — Node + ws.
// Validează: input (clamp + NaN-drop), rate, damage/HP/recompense (tabele oglindite).
// Rulează simularea pură din ../src/game/Match.ts (fără Three.js).
import { WebSocketServer, WebSocket } from 'ws';
import { Match, type SimFighter, type SimInput } from '../../src/game/Match.js';
import { mapById } from '../../src/data/maps.js';
import { heroById } from '../../src/data/heroes.js';
import { uid } from '../../src/utils/math.js';
import { MATCH_REWARDS } from '../../src/data/economy.js';
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
}

const rooms = new Map<string, Room>();
let roomSeq = 1;

const BOT_NAMES = ['Rook', 'Zed', 'Pip', 'Kira', 'Jax', 'Luma', 'Onyx', 'Fizz'];
const BOT_HEROES = ['volt', 'moss', 'blip'];

function roomSize(modeId: string): number {
  return modeId === 'showdown' ? 10 : 6;
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
    const d = Math.hypot(e.x - f.x, e.z - f.z);
    if (d < best) {
      best = d;
      target = e;
    }
  }
  let gx: number | null = null;
  let gz: number | null = null;
  if (m.modeId === 'starrush' && f.stars < 6 && m.stars.length > 0) {
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
    bullets: m.bullets.map((b) => ({ x: b.x, z: b.z, dx: b.dx, dz: b.dz, super: b.isSuper, color: b.color })),
    stars: m.stars.map((s) => ({ id: s.id, x: s.x, z: s.z })),
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
    if (r.modeId === modeId && !r.match.over && r.players.length < roomSize(modeId)) return r;
  }
  const map = mapById(modeId === 'training' ? 'dune-rush' : 'crystal-hollow');
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

wss.on('connection', (ws: WebSocket) => {
  let room: Room | null = null;
  let player: Player | null = null;

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { t: 'error', msg: ' mesaj invalid' });
      return;
    }
    if (msg.t === 'hello') {
      const modeId = ['knockout', 'starrush', 'showdown'].includes(msg.modeId) ? msg.modeId : 'knockout';
      room = findOrCreateRoom(modeId, msg.room);
      const m = room.match;
      const heroId = ['volt', 'moss', 'blip'].includes(msg.heroId) ? msg.heroId : 'volt';
      const name = String(msg.name ?? 'Erou').slice(0, 14) || 'Erou';
      const team = teamFor(room);
      // spawn simplu pe jumătatea echipei
      const sp = team === 0 ? { x: -13, z: 0 } : { x: 13, z: 0 };
      const def = heroById(heroId);
      const f: SimFighter = {
        id: uid(), name, heroId, def, team,
        isBot: false, isLocal: false,
        x: sp.x + (Math.random() - 0.5) * 2, z: sp.z + (Math.random() - 0.5) * 4,
        facing: 0, hp: def.hp, alive: true, respawnT: 0, reloadT: 0,
        superCharge: 0, superReady: false, kills: 0, deaths: 0, stars: 0,
        aiT: 0, aiTx: 0, aiTz: 0, aiMode: 'fight',
      };
      m.fighters.push(f);
      // completează cu boți până la dimensiunea camerei
      const want = roomSize(room.modeId);
      const botsNow = m.fighters.filter((x) => x.isBot).length;
      const humans = m.fighters.filter((x) => !x.isBot).length;
      for (let i = humans + botsNow; i < want; i++) {
        const bt = room.modeId === 'showdown' ? i : teamFor(room);
        const bh = BOT_HEROES[i % BOT_HEROES.length];
        const bdef = heroById(bh);
        const a = (i / want) * Math.PI * 2;
        const bsp = room.modeId === 'showdown'
          ? { x: Math.cos(a) * 12, z: Math.sin(a) * 12 }
          : bt === 0 ? { x: -13, z: (i % 3) * 2 - 2 } : { x: 13, z: (i % 3) * 2 - 2 };
        m.fighters.push({
          id: uid(), name: BOT_NAMES[i % BOT_NAMES.length], heroId: bh, def: bdef, team: bt,
          isBot: true, isLocal: false,
          x: bsp.x, z: bsp.z, facing: 0, hp: bdef.hp, alive: true,
          respawnT: 0, reloadT: 0, superCharge: 0, superReady: false,
          kills: 0, deaths: 0, stars: 0, aiT: 0, aiTx: 0, aiTz: 0, aiMode: 'fight',
        });
      }
      player = {
        ws, fighterId: f.id, name,
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
      send(ws, { t: 'welcome', id: f.id, room: room.code, online: true });
      console.log(`[join] ${name} -> ${room.code} (${room.players.length} umani)`);
      return;
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
        // recompense validate de server
        for (const p of room.players) {
          const f = m.fighters.find((x) => x.id === p.fighterId);
          const won = f ? f.team === m.winner : false;
          send(p.ws, {
            t: 'reward',
            coins: won ? MATCH_REWARDS.winCoins : MATCH_REWARDS.loseCoins,
            xp: won ? MATCH_REWARDS.winXp : MATCH_REWARDS.loseXp,
            trophies: won ? MATCH_REWARDS.trophyWin : MATCH_REWARDS.trophyLose,
          });
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
