// Protocol rețea (client <-> server). Versiunează-l: incompatibil -> reject clar.
export const NET_VERSION = 1;

export type ClientMsg =
  | { t: 'hello'; name: string; heroId: string; modeId: string; room?: string; token?: string }
  | { t: 'register'; name: string; pass: string }
  | { t: 'login'; name: string; pass: string }
  | { t: 'refresh'; token: string }
  | { t: 'profile' }
  | { t: 'input'; mx: number; mz: number; ax: number; az: number; attack: boolean; super: boolean }
  | { t: 'ping'; at: number };

export interface PublicProfile {
  name: string;
  coins: number;
  gems: number;
  xp: number;
  level: number;
  trophies: number;
  wins: number;
  kills: number;
}

export type ServerMsg =
  | { t: 'welcome'; id: number; room: string; online: boolean; profile?: PublicProfile }
  | { t: 'auth-ok'; token: string; profile: PublicProfile }
  | { t: 'auth-error'; msg: string }
  | { t: 'profile'; profile: PublicProfile }
  | { t: 'snap'; fighters: SnapFighter[]; bullets: SnapBullet[]; stars: { id: number; x: number; z: number }[]; scoreA: number; scoreB: number; time: number; over: boolean; winner: number }
  | { t: 'event'; e: string; a?: unknown }
  | { t: 'reward'; coins: number; xp: number; trophies: number; profile?: PublicProfile }
  | { t: 'error'; msg: string }
  | { t: 'pong'; at: number };

export interface SnapFighter {
  id: number; x: number; z: number; facing: number; hp: number; maxHp: number;
  alive: boolean; team: number; heroId: string; name: string;
  kills: number; stars: number; superReady: boolean;
}

export interface SnapBullet {
  x: number; z: number; dx: number; dz: number; super: boolean; color: number;
}
