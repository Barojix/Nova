export interface SaveData {
  coins: number;
  gems: number;
  xp: number;
  level: number;
  trophies: number;
  selectedHero: string;
  unlockedHeroes: string[];
  heroPower: Record<string, number>; // heroId -> nivel putere 1-11
  heroTrophies: Record<string, number>; // heroId -> trofee per erou
  skins: string[];        // item ids deținute
  equippedSkin: Record<string, string>; // heroId -> itemId
  quests: Record<string, number>; // questId -> progres
  questsClaimed: string[];
  wins: number;
  kills: number;
  supers: number;
  stars: number;
  lastDaily: string;
}

const KEY = 'nova-arena-save-v1';

const DEFAULTS: SaveData = {
  coins: 250,
  gems: 30,
  xp: 0,
  level: 1,
  trophies: 0,
  selectedHero: 'volt',
  unlockedHeroes: [...HERO_IDS],
  heroPower: {},
  heroTrophies: {},
  skins: [],
  equippedSkin: {},
  quests: {},
  questsClaimed: [],
  wins: 0,
  kills: 0,
  supers: 0,
  stars: 0,
  lastDaily: '',
};

import { HERO_IDS } from '../data/heroes';

export class SaveSystem {
  data: SaveData = { ...DEFAULTS, unlockedHeroes: [...HERO_IDS] };
  constructor() {
    this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...DEFAULTS, ...JSON.parse(raw) };
      // toți eroii deblocați + migrare putere
      for (const id of HERO_IDS) {
        if (!this.data.unlockedHeroes.includes(id)) this.data.unlockedHeroes.push(id);
      }
      this.data.heroPower ??= {};
      this.data.heroTrophies ??= {};
    } catch { /* corupt -> default */ }
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch { /* storage plin */ }
  }
  reset() {
    this.data = { ...DEFAULTS };
    this.save();
  }
}

export const save = new SaveSystem();
