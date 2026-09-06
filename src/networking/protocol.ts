// Protocol rețea (client <-> server). Versiunează-l: incompatibil -> reject clar.
export const NET_VERSION = 1;

export type ClientMsg =
  | { t: 'hello'; name: string; heroId: string; modeId: string; room?: string; token?: string; team?: number }
  | { t: 'register'; name: string; pass: string }
  | { t: 'login'; name: string; pass: string }
  | { t: 'refresh'; token: string }
  | { t: 'profile' }
  | { t: 'shop-buy'; token: string; item: string }
  | { t: 'shop-equip'; token: string; heroId: string; item: string }
  | { t: 'quest-claim'; token: string; quest: string }
  | { t: 'hero-upgrade'; token: string; hero: string }
  | { t: 'gadget-buy'; token: string; hero: string; gadget: string }
  | { t: 'friend-add'; token: string; name: string }
  | { t: 'friend-accept'; token: string; name: string }
  | { t: 'friend-decline'; token: string; name: string }
  | { t: 'friend-remove'; token: string; name: string }
  | { t: 'friend-list'; token: string }
  | { t: 'friend-invite'; token: string; name: string }
  | { t: 'lobby-hello'; token: string }
  | { t: 'room-create'; token: string; mode: string; map: string }
  | { t: 'room-join'; token: string; code: string }
  | { t: 'room-hero'; hero: string }
  | { t: 'room-leave' }
  | { t: 'room-start' }
  | { t: 'input'; mx: number; mz: number; ax: number; az: number; attack: boolean; super: boolean }
  | { t: 'ping'; at: number };

export interface FriendEntry {
  name: string;
  online: boolean;
  level: number;
  trophies: number;
}

export interface RoomPlayerInfo {
  name: string;
  hero: string;
  host: boolean;
}

export interface RoomStateInfo {
  code: string;
  mode: string;
  map: string;
  mapName: string;
  host: boolean;
  players: RoomPlayerInfo[];
  started: boolean;
}

export interface PublicProfile {
  name: string;
  coins: number;
  gems: number;
  xp: number;
  level: number;
  trophies: number;
  wins: number;
  kills: number;
  supers: number;
  stars: number;
  skins: string[];
  equippedSkin: Record<string, string>;
  questsClaimed: string[];
  heroPower: Record<string, number>;
  heroTrophies: Record<string, number>;
  heroGadgets: Record<string, string>;
}

export interface SafeSnap { team: number; hp: number; maxHp: number; x: number; z: number }

export type ServerMsg =
  | { t: 'welcome'; id: number; room: string; online: boolean; profile?: PublicProfile }
  | { t: 'auth-ok'; token: string; profile: PublicProfile }
  | { t: 'auth-error'; msg: string }
  | { t: 'profile'; profile: PublicProfile }
  | { t: 'shop-result'; ok: boolean; msg: string; profile?: PublicProfile }
  | { t: 'friend-state'; friends: FriendEntry[]; incoming: FriendEntry[]; outgoing: string[] }
  | { t: 'room-state'; room: RoomStateInfo | null }
  | { t: 'room-invite'; code: string; from: string; mode: string }
  | { t: 'lobby-ok' }
  | { t: 'snap'; fighters: SnapFighter[]; bullets: SnapBullet[]; stars: { id: number; x: number; z: number }[]; cubes: { id: number; x: number; z: number }[]; crates: { id: number; x: number; z: number }[]; safes: SafeSnap[]; gas: number; scoreA: number; scoreB: number; time: number; over: boolean; winner: number }
  | { t: 'event'; e: string; a?: unknown }
  | { t: 'reward'; coins: number; xp: number; trophies: number; profile?: PublicProfile }
  | { t: 'error'; msg: string }
  | { t: 'pong'; at: number };

export interface SnapFighter {
  id: number; x: number; z: number; facing: number; hp: number; maxHp: number;
  alive: boolean; team: number; heroId: string; name: string;
  kills: number; stars: number; superReady: boolean;
  ammo: number; powerups: number;
}

export interface SnapBullet {
  x: number; z: number; dx: number; dz: number; super: boolean; color: number; big: boolean;
}
