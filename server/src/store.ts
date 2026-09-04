// Stoc conturi STARFORGE — JSON persistent, hash scrypt, fără dependențe.
// Suficient pentru single-instance free-tier; migrare la SQL când e nevoie.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MATCH_REWARDS, QUESTS, SHOP_ITEMS, XP_PER_LEVEL } from '../../src/data/economy.js';
import { HEROES, POWER_MAX, UPGRADE_COST } from '../../src/data/heroes.js';

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
  supers: number;
  stars: number;
  skins: string[];
  equippedSkin: Record<string, string>;
  questsClaimed: string[];
  heroPower: Record<string, number>;
  heroTrophies: Record<string, number>;
  friends: string[];
  incoming: string[];
  outgoing: string[];
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
  supers: number;
  stars: number;
  skins: string[];
  equippedSkin: Record<string, string>;
  questsClaimed: string[];
  heroPower: Record<string, number>;
  heroTrophies: Record<string, number>;
}

const DIR = process.env.DATA_DIR || join(process.cwd(), 'data');const FILE = join(DIR, 'accounts.json');

const NAME_RE = /^[A-Za-z0-9_]{3,14}$/;

function hash(pass: string, salt: string): string {
  return scryptSync(pass, salt, 32).toString('hex');
}

export function toPublic(a: Account): PublicProfile {
  return {
    name: a.name, coins: a.coins, gems: a.gems, xp: a.xp,
    level: a.level, trophies: a.trophies, wins: a.wins, kills: a.kills,
    supers: a.supers, stars: a.stars,
    skins: [...a.skins], equippedSkin: { ...a.equippedSkin },
    questsClaimed: [...a.questsClaimed],
    heroPower: { ...a.heroPower },
    heroTrophies: { ...(a.heroTrophies ?? {}) },
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
        // migrare conturi vechi (câmpuri noi cu default)
        a.supers ??= 0;        a.stars ??= 0;
        a.skins ??= [];
        a.equippedSkin ??= {};
        a.questsClaimed ??= [];
        a.heroPower ??= {};
        a.heroTrophies ??= {};
        a.friends ??= [];
        a.incoming ??= [];
        a.outgoing ??= [];
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
      wins: 0, kills: 0, supers: 0, stars: 0,
      skins: [], equippedSkin: {}, questsClaimed: [],
      heroPower: {}, friends: [], incoming: [], outgoing: [],
      heroTrophies: {},
      createdAt: Date.now(),
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

  applyMatchById(id: string, won: boolean, kills: number, supers = 0, stars = 0, heroId = ''): PublicProfile | null {
    const a = this.accounts.get(id);
    if (!a) return null;
    return this.applyMatch(a, won, kills, supers, stars, heroId);
  }

  private issueToken(a: Account) {
    if (a.token) this.byToken.delete(a.token);
    a.token = randomBytes(32).toString('hex');
    a.tokenExp = Date.now() + 30 * 24 * 3600 * 1000;
    this.byToken.set(a.token, a.id);
  }

  /** Adaugă monede/XP cu level-up (folosit de meciuri și misiuni). */
  private addRewards(a: Account, coins: number, xp: number) {
    a.coins += coins;
    a.xp += xp;
    let need = XP_PER_LEVEL(a.level);
    while (a.xp >= need) {
      a.xp -= need;
      a.level += 1;
      a.coins += 50;
      a.gems += 5;
      need = XP_PER_LEVEL(a.level);
    }
  }

  /** Recompense validate server-side + level-up. Returnează profilul actualizat. */
  applyMatch(a: Account, won: boolean, kills: number, supers = 0, stars = 0, heroId = '') {
    const coins = won ? MATCH_REWARDS.winCoins : MATCH_REWARDS.loseCoins;
    const xp = won ? MATCH_REWARDS.winXp : MATCH_REWARDS.loseXp;
    this.addRewards(a, coins, xp);
    const trophyDelta = won ? MATCH_REWARDS.trophyWin : MATCH_REWARDS.trophyLose;
    a.trophies = Math.max(0, a.trophies + trophyDelta);
    if (heroId) {
      a.heroTrophies[heroId] = Math.max(0, (a.heroTrophies[heroId] ?? 0) + trophyDelta);
    }
    a.kills += kills;
    a.supers += supers;
    a.stars += stars;
    if (won) a.wins += 1;
    this.persist();
    return toPublic(a);
  }

  buyItem(id: string, itemId: string): { ok: boolean; msg: string; profile?: PublicProfile } {
    const a = this.accounts.get(id);
    if (!a) return { ok: false, msg: 'Cont inexistent.' };
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return { ok: false, msg: 'Obiect inexistent.' };
    if (item.kind !== 'coins' && a.skins.includes(itemId)) {
      return { ok: false, msg: 'Deții deja obiectul.' };
    }
    if (item.currency === 'coins' && a.coins < item.price) {
      return { ok: false, msg: 'Nu ai suficiente monezi.' };
    }
    if (item.currency === 'gems' && a.gems < item.price) {
      return { ok: false, msg: 'Nu ai suficiente gemuri.' };
    }
    if (item.currency === 'coins') a.coins -= item.price;
    else a.gems -= item.price;
    if (item.kind === 'coins') {
      a.coins += 500;
    } else {
      a.skins.push(itemId);
      if (item.kind === 'skin' && item.heroId) a.equippedSkin[item.heroId] = itemId;
    }
    this.persist();
    return { ok: true, msg: `Ai cumpărat ${item.name}!`, profile: toPublic(a) };
  }

  equipSkin(id: string, heroId: string, itemId: string): { ok: boolean; msg: string; profile?: PublicProfile } {
    const a = this.accounts.get(id);
    if (!a) return { ok: false, msg: 'Cont inexistent.' };
    if (!a.skins.includes(itemId)) return { ok: false, msg: 'Nu deții skin-ul.' };
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item || item.heroId !== heroId) return { ok: false, msg: 'Skin incompatibil.' };
    a.equippedSkin[heroId] = itemId;
    this.persist();
    return { ok: true, msg: 'Skin echipat!', profile: toPublic(a) };
  }

  claimQuest(id: string, questId: string): { ok: boolean; msg: string; profile?: PublicProfile } {
    const a = this.accounts.get(id);
    if (!a) return { ok: false, msg: 'Cont inexistent.' };
    const q = QUESTS.find((x) => x.id === questId);
    if (!q) return { ok: false, msg: 'Misiune inexistentă.' };
    if (a.questsClaimed.includes(questId)) return { ok: false, msg: 'Deja revendicată.' };
    const progress: Record<string, number> = {
      'q-kills': a.kills, 'q-wins': a.wins, 'q-super': a.supers, 'q-stars': a.stars,
    };
    if ((progress[questId] ?? 0) < q.target) {
      return { ok: false, msg: `Progres insuficient (${Math.min(q.target, progress[questId] ?? 0)}/${q.target}).` };
    }
    a.questsClaimed.push(questId);
    this.addRewards(a, q.rewardCoins, q.rewardXp);
    this.persist();
    return { ok: true, msg: `Misiune completă! +${q.rewardCoins} 🪙`, profile: toPublic(a) };
  }
  /** Upgrade putere erou (nivele 1-11, cost în monezi). */
  upgradeHero(id: string, heroId: string): { ok: boolean; msg: string; profile?: PublicProfile } {
    const a = this.accounts.get(id);
    if (!a) return { ok: false, msg: 'Cont inexistent.' };
    if (!HEROES.some((h) => h.id === heroId)) return { ok: false, msg: 'Erou inexistent.' };
    const cur = Math.max(1, Math.min(POWER_MAX, Math.round(a.heroPower[heroId] ?? 1)));
    if (cur >= POWER_MAX) return { ok: false, msg: 'Putere maximă atinsă!' };
    const cost = UPGRADE_COST[cur] ?? 999999;
    if (a.coins < cost) return { ok: false, msg: `Îți lipsesc ${cost - a.coins} monezi.` };
    a.coins -= cost;
    a.heroPower[heroId] = cur + 1;
    this.persist();
    return { ok: true, msg: `Putere ${cur + 1}!`, profile: toPublic(a) };
  }

  accountById(id: string): Account | undefined {
    return this.accounts.get(id);
  }

  accountByName(name: string): Account | undefined {
    const id = this.byName.get(String(name ?? '').trim().toLowerCase());
    return id ? this.accounts.get(id) : undefined;
  }

  /** Cerere de prietenie către alt cont (după nume). */
  friendAdd(id: string, name: string): { ok: boolean; msg: string } {
    const a = this.accounts.get(id);
    const b = this.accountByName(name);
    if (!a) return { ok: false, msg: 'Cont inexistent.' };
    if (!b) return { ok: false, msg: 'Jucătorul nu există.' };
    if (b.id === a.id) return { ok: false, msg: 'Nu te poți adăuga singur.' };
    if (a.friends.includes(b.id)) return { ok: false, msg: 'Sunteți deja prieteni.' };
    if (a.outgoing.includes(b.id)) return { ok: false, msg: 'Cererea e deja trimisă.' };
    if (a.incoming.includes(b.id)) {
      // cerere reciprocă -> prietenie directă
      return this.friendAccept(id, b.name);
    }
    a.outgoing.push(b.id);
    b.incoming.push(a.id);
    this.persist();
    return { ok: true, msg: `Cerere trimisă lui ${b.name}!` };
  }

  friendAccept(id: string, name: string): { ok: boolean; msg: string } {
    const a = this.accounts.get(id);
    const b = this.accountByName(name);
    if (!a || !b) return { ok: false, msg: 'Cerere inexistentă.' };
    if (!a.incoming.includes(b.id)) return { ok: false, msg: 'Cerere inexistentă.' };
    a.incoming = a.incoming.filter((x) => x !== b.id);
    b.outgoing = b.outgoing.filter((x) => x !== a.id);
    a.outgoing = a.outgoing.filter((x) => x !== b.id);
    b.incoming = b.incoming.filter((x) => x !== a.id);
    if (!a.friends.includes(b.id)) a.friends.push(b.id);
    if (!b.friends.includes(a.id)) b.friends.push(a.id);
    this.persist();
    return { ok: true, msg: `Ești prieten cu ${b.name}!` };
  }

  friendDecline(id: string, name: string): { ok: boolean; msg: string } {
    const a = this.accounts.get(id);
    const b = this.accountByName(name);
    if (!a || !b) return { ok: false, msg: 'Cerere inexistentă.' };
    a.incoming = a.incoming.filter((x) => x !== b.id);
    b.outgoing = b.outgoing.filter((x) => x !== a.id);
    this.persist();
    return { ok: true, msg: 'Cerere refuzată.' };
  }

  friendRemove(id: string, name: string): { ok: boolean; msg: string } {
    const a = this.accounts.get(id);
    const b = this.accountByName(name);
    if (!a || !b) return { ok: false, msg: 'Prieten inexistent.' };
    a.friends = a.friends.filter((x) => x !== b.id);
    b.friends = b.friends.filter((x) => x !== a.id);
    this.persist();
    return { ok: true, msg: `${b.name} a fost șters din prieteni.` };
  }

  friendState(
    id: string,
    onlineIds: Set<string>,
  ): { friends: { name: string; online: boolean; level: number; trophies: number }[]; incoming: { name: string; level: number }[]; outgoing: string[] } {
    const a = this.accounts.get(id);
    if (!a) return { friends: [], incoming: [], outgoing: [] };
    return {
      friends: a.friends.flatMap((fid) => {
        const x = this.accounts.get(fid);
        return x ? [{ name: x.name, online: onlineIds.has(x.id), level: x.level, trophies: x.trophies }] : [];
      }),
      incoming: a.incoming.flatMap((fid) => {
        const x = this.accounts.get(fid);
        return x ? [{ name: x.name, level: x.level }] : [];
      }),
      outgoing: a.outgoing.flatMap((fid) => {
        const n = this.accounts.get(fid)?.name ?? '';
        return n !== '' ? [n] : [];
      }),
    };
  }
}

export const store = new Store();
