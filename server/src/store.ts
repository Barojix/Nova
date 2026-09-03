// Stoc conturi STARFORGE — JSON persistent, hash scrypt, fără dependențe.
// Suficient pentru single-instance free-tier; migrare la SQL când e nevoie.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MATCH_REWARDS, XP_PER_LEVEL } from '../../src/data/economy.js';

export interface Account {
  id: string;
  name: string;
  passHash: string;
  salt: string;
  token: string;
  tokenExp: number;
  coins: number;
  gems: number;
  xp: number;
  level: number;
  trophies: number;
  wins: number;
  kills: number;
  createdAt: number;
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
}

const DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const FILE = join(DIR, 'accounts.json');

const NAME_RE = /^[A-Za-z0-9_]{3,14}$/;

function hash(pass: string, salt: string): string {
  return scryptSync(pass, salt, 32).toString('hex');
}

export function toPublic(a: Account): PublicProfile {
  return {
    name: a.name, coins: a.coins, gems: a.gems, xp: a.xp,
    level: a.level, trophies: a.trophies, wins: a.wins, kills: a.kills,
  };
}

class Store {
  private accounts = new Map<string, Account>(); // id -> cont
  private byName = new Map<string, string>(); // lower(name) -> id
  private byToken = new Map<string, string>(); // token -> id

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (!existsSync(FILE)) return;
      const arr = JSON.parse(readFileSync(FILE, 'utf8')) as Account[];
      for (const a of arr) {
        this.accounts.set(a.id, a);
        this.byName.set(a.name.toLowerCase(), a.id);
        if (a.token && a.tokenExp > Date.now()) this.byToken.set(a.token, a.id);
      }
      console.log(`[conturi] ${this.accounts.size} conturi încărcate`);
    } catch (e) {
      console.error('[conturi] fișier corupt, pornesc gol:', (e as Error).message);
    }
  }

  private persist() {
    try {
      mkdirSync(DIR, { recursive: true });
      const tmp = FILE + '.tmp';
      writeFileSync(tmp, JSON.stringify([...this.accounts.values()]));
      renameSync(tmp, FILE);
    } catch (e) {
      console.error('[conturi] salvare eșuată:', (e as Error).message);
    }
  }

  register(name: string, pass: string): { ok: boolean; msg?: string; account?: Account } {
    const clean = String(name ?? '').trim();
    if (!NAME_RE.test(clean)) {
      return { ok: false, msg: 'Numele trebuie să aibă 3-14 caractere (litere, cifre, _).' };
    }
    if (typeof pass !== 'string' || pass.length < 4 || pass.length > 64) {
      return { ok: false, msg: 'Parola trebuie să aibă între 4 și 64 de caractere.' };
    }
    if (this.byName.has(clean.toLowerCase())) {
      return { ok: false, msg: 'Numele e deja folosit. Alege altul sau conectează-te.' };
    }
    const salt = randomBytes(16).toString('hex');
    const a: Account = {
      id: randomBytes(8).toString('hex'),
      name: clean,
      passHash: hash(pass, salt),
      salt,
      token: '',
      tokenExp: 0,
      coins: 250, gems: 30, xp: 0, level: 1, trophies: 0,
      wins: 0, kills: 0, createdAt: Date.now(),
    };
    this.issueToken(a);
    this.accounts.set(a.id, a);
    this.byName.set(a.name.toLowerCase(), a.id);
    this.persist();
    console.log(`[conturi] cont nou: ${a.name}`);
    return { ok: true, account: a };
  }

  login(name: string, pass: string): { ok: boolean; msg?: string; account?: Account } {
    const id = this.byName.get(String(name ?? '').trim().toLowerCase());
    const a = id ? this.accounts.get(id) : undefined;
    if (!a) return { ok: false, msg: 'Cont inexistent sau parolă greșită.' };
    const h = hash(String(pass ?? ''), a.salt);
    const hb = Buffer.from(h, 'hex');
    const ab = Buffer.from(a.passHash, 'hex');
    if (hb.length !== ab.length || !timingSafeEqual(hb, ab)) {
      return { ok: false, msg: 'Cont inexistent sau parolă greșită.' };
    }
    this.issueToken(a);
    this.persist();
    return { ok: true, account: a };
  }

  refresh(token: string): Account | null {
    if (!token) return null;
    const id = this.byToken.get(token);
    const a = id ? this.accounts.get(id) : undefined;
    if (!a || a.tokenExp < Date.now()) return null;
    return a;
  }

  applyMatchById(id: string, won: boolean, kills: number): PublicProfile | null {
    const a = this.accounts.get(id);
    if (!a) return null;
    return this.applyMatch(a, won, kills);
  }

  private issueToken(a: Account) {
    if (a.token) this.byToken.delete(a.token);
    a.token = randomBytes(32).toString('hex');
    a.tokenExp = Date.now() + 30 * 24 * 3600 * 1000;
    this.byToken.set(a.token, a.id);
  }

  /** Recompense validate server-side + level-up. Returnează profilul actualizat. */
  applyMatch(a: Account, won: boolean, kills: number): PublicProfile {
    const coins = won ? MATCH_REWARDS.winCoins : MATCH_REWARDS.loseCoins;
    let xp = won ? MATCH_REWARDS.winXp : MATCH_REWARDS.loseXp;
    a.coins += coins;
    a.xp += xp;
    a.trophies = Math.max(0, a.trophies + (won ? MATCH_REWARDS.trophyWin : MATCH_REWARDS.trophyLose));
    a.kills += kills;
    if (won) a.wins += 1;
    let need = XP_PER_LEVEL(a.level);
    while (a.xp >= need) {
      a.xp -= need;
      a.level += 1;
      a.coins += 50;
      a.gems += 5;
      need = XP_PER_LEVEL(a.level);
    }
    this.persist();
    return toPublic(a);
  }
}

export const store = new Store();
