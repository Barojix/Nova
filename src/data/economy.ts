// Economie data-driven. Serverul validează (server/src/index.ts oglindește tabelele).
export const XP_PER_LEVEL = (level: number) => 100 + (level - 1) * 60;

export const MATCH_REWARDS = {
  winCoins: 40,
  loseCoins: 12,
  drawCoins: 20,
  winXp: 60,
  loseXp: 20,
  starPlayerXp: 25,
  trophyWin: 8,
  trophyLose: -4,
};

export interface ShopItem {
  id: string;
  kind: 'skin' | 'emote' | 'coins' | 'gems';
  name: string;
  price: number;
  currency: 'coins' | 'gems';
  heroId?: string;
  color?: number;
  tag?: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'skin-volt-neon', kind: 'skin', name: 'Volt Neon', price: 400, currency: 'coins', heroId: 'volt', color: 0x00f0ff, tag: 'POPULAR' },
  { id: 'skin-volt-magma', kind: 'skin', name: 'Volt Magmă', price: 60, currency: 'gems', heroId: 'volt', color: 0xff4400 },
  { id: 'skin-moss-gold', kind: 'skin', name: 'Moss Auriu', price: 600, currency: 'coins', heroId: 'moss', color: 0xffc93f },
  { id: 'skin-blip-abyss', kind: 'skin', name: 'Blip Abisal', price: 80, currency: 'gems', heroId: 'blip', color: 0x0aff9d },
  { id: 'emote-gg', kind: 'emote', name: 'Emote GG', price: 150, currency: 'coins', tag: 'NOU' },
  { id: 'emote-star', kind: 'emote', name: 'Emote Stea', price: 25, currency: 'gems' },
  { id: 'coins-pack', kind: 'coins', name: 'Pumn de monezi', price: 20, currency: 'gems' },
];

export interface QuestDef {
  id: string;
  name: string;
  desc: string;
  target: number;
  rewardCoins: number;
  rewardXp: number;
}

export const QUESTS: QuestDef[] = [
  { id: 'q-kills', name: 'Luptător', desc: 'Elimină 10 inamici', target: 10, rewardCoins: 60, rewardXp: 40 },
  { id: 'q-wins', name: 'Campion', desc: 'Câștigă 3 meciuri', target: 3, rewardCoins: 100, rewardXp: 60 },
  { id: 'q-super', name: 'Supernovă', desc: 'Folosește Super de 5 ori', target: 5, rewardCoins: 50, rewardXp: 30 },
  { id: 'q-stars', name: 'Vânător de stele', desc: 'Colectează 15 stele', target: 15, rewardCoins: 70, rewardXp: 40 },
];
