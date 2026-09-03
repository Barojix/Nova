export interface SaveData {
  coins: number;
  gems: number;
  xp: number;
  level: number;
  trophies: number;
  selectedHero: string;
  unlockedHeroes: string[];
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
  unlockedHeroes: ['volt', 'moss', 'blip'],
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

export class SaveSystem {
  data: SaveData = { ...DEFAULTS };
  constructor() {
    this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...DEFAULTS, ...JSON.parse(raw) };
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
