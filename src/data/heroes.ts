// Date data-driven — NU hardcoda stat-uri prin cod. Totul se balansează de aici.
export type Rarity = 'comun' | 'rar' | 'super-rar' | 'epic' | 'mitic' | 'legendar' | 'cosmic';
export type AttackKind = 'bolt' | 'spread' | 'lob' | 'pierce' | 'wave' | 'mortar';
export type Species = 'uman' | 'robot' | 'animal' | 'monstru';

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  titleEn: string;
  desc: string;
  descEn: string;
  rarity: Rarity;
  kind: AttackKind;
  species: Species;
  sizeMul: number;   // mărime vizuală (0.85-1.3)
  color: number;      // culoare principală (siluetă)
  accent: number;     // culoare secundară
  hp: number;
  damage: number;     // per proiectil
  projectiles: number;// câte proiectile per atac
  ammoMax: number;    // gloanțe (1-5, diversitate per erou)
  range: number;      // unități lume
  reloadMs: number;   // timp regenerare 1 glonț
  speed: number;      // unități / secundă
  superDamage: number;
  superCount: number;
  superRange: number;
  superCooldownHits: number; // câte hituri încarcă super-ul
  sightRange: number;
}

// kind: bolt=proiectil rapid | spread=evantai | lob=bombă lentă mare |
//       pierce=străpunge inamicii | wave=undă lată scurtă | mortar=lovitură lungă lentă
export const HEROES: HeroDef[] = [
  {
    id: 'volt', name: 'VOLT', title: 'Scânteia Rebelă', titleEn: 'Rebel Spark',
    desc: 'Atac rapid cu fulgere. Perfect pentru începători. Super: descărcare în lanț.',
    descEn: 'Fast lightning bolts. Great for beginners. Super: chain discharge.',
    rarity: 'comun', kind: 'bolt', species: 'uman', sizeMul: 1.0,
    color: 0xffd23f, accent: 0x2d7dff,
    hp: 3400, damage: 420, projectiles: 1, ammoMax: 3,
    range: 9.5, reloadMs: 750, speed: 7.2,
    superDamage: 900, superCount: 5, superRange: 11,
    superCooldownHits: 8, sightRange: 13,
  },
  {
    id: 'pietro', name: 'PIETRO', title: 'Zidul de Piatră', titleEn: 'Stone Wall',
    desc: 'Golem de piatră, lent dar greu de doborât. Aruncă șrapnel în evantai scurt.',
    descEn: 'Slow stone golem, hard to take down. Hurls shrapnel in a short fan.',
    rarity: 'comun', kind: 'spread', species: 'monstru', sizeMul: 1.15,
    color: 0x8a8f9e, accent: 0x3ddc84,
    hp: 4600, damage: 260, projectiles: 3, ammoMax: 3,
    range: 6.5, reloadMs: 1100, speed: 6.0,
    superDamage: 700, superCount: 7, superRange: 7.5,
    superCooldownHits: 9, sightRange: 12,
  },
  {
    id: 'sprint', name: 'SPRINT', title: 'Viteazul', titleEn: 'The Swift',
    desc: 'Cel mai iute erou. Înțeapă rapid de la distanță medie.',
    descEn: 'The fastest hero. Pokes fast from mid range.',
    rarity: 'comun', kind: 'bolt', species: 'robot', sizeMul: 0.85,
    color: 0x22d3ee, accent: 0xffffff,
    hp: 2800, damage: 340, projectiles: 1, ammoMax: 4,
    range: 8.5, reloadMs: 600, speed: 8.2,
    superDamage: 700, superCount: 4, superRange: 10,
    superCooldownHits: 8, sightRange: 13,
  },
  {
    id: 'bula', name: 'BULA', title: 'Tunul cu Bule', titleEn: 'Bubble Cannon',
    desc: 'Broscuță artilerist. Bombele-bule trec peste ziduri.',
    descEn: 'Artillery froglet. Bubble bombs fly over walls.',
    rarity: 'comun', kind: 'lob', species: 'animal', sizeMul: 0.9,
    color: 0x7af0ff, accent: 0xff5fa2,
    hp: 3600, damage: 620, projectiles: 1, ammoMax: 2,
    range: 8.0, reloadMs: 1300, speed: 6.6,
    superDamage: 1100, superCount: 3, superRange: 9,
    superCooldownHits: 8, sightRange: 12,
  },
  {
    id: 'moss', name: 'MOSS', title: 'Gardianul Verde', titleEn: 'Green Warden',
    desc: 'Tank vegetal cu semințe explosive. Încasează mult, lovește pe arie.',
    descEn: 'Bulky plant tank with explosive seeds. Soaks hits, deals area damage.',
    rarity: 'rar', kind: 'spread', species: 'monstru', sizeMul: 1.1,
    color: 0x3ddc84, accent: 0x7a4a21,
    hp: 5200, damage: 300, projectiles: 3, ammoMax: 3,
    range: 7.0, reloadMs: 1050, speed: 6.1,
    superDamage: 650, superCount: 9, superRange: 8,
    superCooldownHits: 9, sightRange: 12,
  },
  {
    id: 'ghimp', name: 'GHIMP', title: 'Aruncătorul de Spini', titleEn: 'Thorn Hurler',
    desc: 'Cactus viu. Evantai larg de 5 spini, rege pe culoare înguste.',
    descEn: 'Living cactus. Wide fan of 5 thorns, king of narrow lanes.',
    rarity: 'rar', kind: 'spread', species: 'monstru', sizeMul: 1.0,
    color: 0x86efac, accent: 0x14532d,
    hp: 3400, damage: 220, projectiles: 5, ammoMax: 4,
    range: 8.0, reloadMs: 1150, speed: 6.9,
    superDamage: 500, superCount: 11, superRange: 9,
    superCooldownHits: 8, sightRange: 13,
  },
  {
    id: 'unda', name: 'UNDA', title: 'Mareea Vie', titleEn: 'Living Tide',
    desc: 'Val care străpunge toți inamicii în linie. Superb contra grupurilor.',
    descEn: 'Wave that pierces every enemy in line. Superb against groups.',
    rarity: 'rar', kind: 'pierce', species: 'uman', sizeMul: 1.0,
    color: 0x2d7dff, accent: 0x7af0ff,
    hp: 3200, damage: 480, projectiles: 1, ammoMax: 2,
    range: 9.0, reloadMs: 950, speed: 6.8,
    superDamage: 1000, superCount: 3, superRange: 11,
    superCooldownHits: 7, sightRange: 13,
  },
  {
    id: 'turbo', name: 'TURBO', title: 'Racheta de Buzunar', titleEn: 'Pocket Rocket',
    desc: 'Robot-racheta. Trage rafale duble. Fragil, dar nimeni nu-l prinde.',
    descEn: 'Rocket robot. Fires twin bursts. Fragile, but uncatchable.',
    rarity: 'rar', kind: 'bolt', species: 'robot', sizeMul: 0.9,
    color: 0xff6b35, accent: 0xffe066,
    hp: 2600, damage: 300, projectiles: 2, ammoMax: 4,
    range: 8.0, reloadMs: 700, speed: 7.8,
    superDamage: 650, superCount: 6, superRange: 9.5,
    superCooldownHits: 7, sightRange: 13,
  },
  {
    id: 'vifor', name: 'VIFOR', title: 'Furtuna Albă', titleEn: 'White Storm',
    desc: 'Îmblânzitoare de viscol. Undă lată de vânt rece pe jumătate de culoar.',
    descEn: 'Blizzard tamer. Wide wave of cold wind across half a lane.',
    rarity: 'super-rar', kind: 'wave', species: 'uman', sizeMul: 1.0,
    color: 0xe0f2fe, accent: 0x0284c7,
    hp: 3800, damage: 560, projectiles: 1, ammoMax: 2,
    range: 7.5, reloadMs: 1050, speed: 6.7,
    superDamage: 1200, superCount: 1, superRange: 10,
    superCooldownHits: 8, sightRange: 13,
  },
  {
    id: 'magma', name: 'MAGMA', title: 'Inima Vulcanului', titleEn: 'Volcano Heart',
    desc: 'Demon de lavă. Bulbuc de foc cu explozie mare, trece peste ziduri.',
    descEn: 'Lava demon. Big fiery blob over walls.',
    rarity: 'super-rar', kind: 'lob', species: 'monstru', sizeMul: 1.15,
    color: 0xff4400, accent: 0xffd23f,
    hp: 4200, damage: 760, projectiles: 1, ammoMax: 2,
    range: 8.5, reloadMs: 1350, speed: 6.3,
    superDamage: 1400, superCount: 3, superRange: 9.5,
    superCooldownHits: 8, sightRange: 12,
  },
  {
    id: 'lance', name: 'LANCE', title: 'Cavalerul Laser', titleEn: 'Laser Knight',
    desc: 'Un singur glonț, dar ce glonț: suliță energetică prin rânduri întregi.',
    descEn: 'A single shot, but what a shot: energy lance through whole rows.',
    rarity: 'super-rar', kind: 'pierce', species: 'uman', sizeMul: 1.0,
    color: 0xc084fc, accent: 0xfef08a,
    hp: 3400, damage: 640, projectiles: 1, ammoMax: 1,
    range: 10.5, reloadMs: 1100, speed: 6.9,
    superDamage: 1300, superCount: 2, superRange: 13,
    superCooldownHits: 7, sightRange: 14,
  },
  {
    id: 'ricosa', name: 'RICOȘA', title: 'Regina Ricoșeului', titleEn: 'Ricochet Queen',
    desc: 'Trio de proiectile rapide în evantai strâns. Precizie mortală.',
    descEn: 'Trio of fast shells in a tight fan. Deadly precision.',
    rarity: 'super-rar', kind: 'spread', species: 'uman', sizeMul: 1.0,
    color: 0xf472b6, accent: 0x2d7dff,
    hp: 3000, damage: 320, projectiles: 3, ammoMax: 3,
    range: 9.5, reloadMs: 800, speed: 7.1,
    superDamage: 750, superCount: 7, superRange: 11,
    superCooldownHits: 7, sightRange: 14,
  },
  {
    id: 'blip', name: 'BLIP', title: 'Micuța Supernovă', titleEn: 'Tiny Supernova',
    desc: 'Robotel curios. Mine gravitaționale care explodează. Damage uriaș.',
    descEn: 'Curious little robot. Exploding gravity mines. Huge damage.',
    rarity: 'epic', kind: 'lob', species: 'robot', sizeMul: 0.95,
    color: 0xb15cff, accent: 0xff5fa2,
    hp: 2800, damage: 780, projectiles: 1, ammoMax: 2,
    range: 8.5, reloadMs: 1250, speed: 6.8,
    superDamage: 1500, superCount: 1, superRange: 9,
    superCooldownHits: 7, sightRange: 13,
  },
  {
    id: 'mortar', name: 'MORTAR', title: 'Tunul de Asediu', titleEn: 'Siege Cannon',
    desc: 'Bombardament de la distanță uriașă, peste orice zid. Nu-l lăsa să te fixeze.',
    descEn: 'Long-range bombardment over any wall. Do not let it lock on you.',
    rarity: 'epic', kind: 'mortar', species: 'robot', sizeMul: 1.1,
    color: 0x57534e, accent: 0xff9f1c,
    hp: 3600, damage: 950, projectiles: 1, ammoMax: 1,
    range: 13.0, reloadMs: 1900, speed: 5.9,
    superDamage: 1700, superCount: 3, superRange: 14,
    superCooldownHits: 8, sightRange: 15,
  },
  {
    id: 'spectru', name: 'SPECTRU', title: 'Umbra Arenei', titleEn: 'Arena Shade',
    desc: 'Fâșii fantomatice ce trec prin ziduri de inamici. Rapid și tăcut.',
    descEn: 'Ghostly slashes through walls of enemies. Fast and silent.',
    rarity: 'epic', kind: 'pierce', species: 'monstru', sizeMul: 1.0,
    color: 0x334155, accent: 0x7af0ff,
    hp: 3000, damage: 560, projectiles: 2, ammoMax: 3,
    range: 9.0, reloadMs: 900, speed: 7.4,
    superDamage: 1100, superCount: 4, superRange: 10,
    superCooldownHits: 6, sightRange: 14,
  },
  {
    id: 'coral', name: 'CORAL', title: 'Regina Recifului', titleEn: 'Reef Queen',
    desc: 'Crab uriaș și vesel. Valuri duble de apă vie, controlează centrul.',
    descEn: 'Giant cheerful crab. Double waves of living water, owns the center.',
    rarity: 'epic', kind: 'wave', species: 'animal', sizeMul: 1.05,
    color: 0x06b6d4, accent: 0xf0abfc,
    hp: 4000, damage: 480, projectiles: 2, ammoMax: 3,
    range: 7.5, reloadMs: 1000, speed: 6.6,
    superDamage: 1000, superCount: 3, superRange: 9.5,
    superCooldownHits: 8, sightRange: 13,
  },
  {
    id: 'nova', name: 'NOVA', title: 'Steaua Arenei', titleEn: 'Arena Star',
    desc: 'Eroul-simbol. Explozii stelare echilibrate, super devastator.',
    descEn: 'The icon hero. Balanced star blasts, devastating super.',
    rarity: 'mitic', kind: 'bolt', species: 'uman', sizeMul: 1.0,
    color: 0xffe066, accent: 0xff3b6b,
    hp: 3800, damage: 620, projectiles: 1, ammoMax: 3,
    range: 10.0, reloadMs: 800, speed: 7.2,
    superDamage: 1500, superCount: 5, superRange: 12,
    superCooldownHits: 7, sightRange: 14,
  },
  {
    id: 'golem', name: 'GOLEM', title: 'Muntele care Merge', titleEn: 'Walking Mountain',
    desc: 'Cel mai rezistent erou. Zdrobire seismică pe arie largă.',
    descEn: 'The toughest hero. Wide-area seismic slam.',
    rarity: 'mitic', kind: 'wave', species: 'monstru', sizeMul: 1.3,
    color: 0x78716c, accent: 0xb8f135,
    hp: 6400, damage: 520, projectiles: 1, ammoMax: 2,
    range: 6.5, reloadMs: 1200, speed: 5.7,
    superDamage: 1300, superCount: 1, superRange: 9,
    superCooldownHits: 9, sightRange: 12,
  },
  {
    id: 'viespe', name: 'VIESPE', title: 'Acul de Aur', titleEn: 'Golden Stinger',
    desc: 'Viespe uriașă. Înțepături străpungătoare la distanță extremă. Nu te ascunde.',
    descEn: 'Giant wasp. Piercing stings at extreme range. Nowhere to hide.',
    rarity: 'mitic', kind: 'pierce', species: 'animal', sizeMul: 0.9,
    color: 0xfacc15, accent: 0x18181b,
    hp: 2800, damage: 700, projectiles: 1, ammoMax: 2,
    range: 12.0, reloadMs: 1050, speed: 7.0,
    superDamage: 1600, superCount: 1, superRange: 14,
    superCooldownHits: 6, sightRange: 15,
  },
  {
    id: 'dragon', name: 'DRAGON', title: 'Suflarea Străveche', titleEn: 'Ancient Breath',
    desc: 'Dragon adevărat. Con de foc nimicitor, arde echipe întregi.',
    descEn: 'A true dragon. Annihilating fire cone, burns whole teams.',
    rarity: 'legendar', kind: 'wave', species: 'animal', sizeMul: 1.2,
    color: 0xdc2626, accent: 0xfbbf24,
    hp: 4600, damage: 640, projectiles: 2, ammoMax: 2,
    range: 8.0, reloadMs: 1050, speed: 6.5,
    superDamage: 1600, superCount: 3, superRange: 10,
    superCooldownHits: 7, sightRange: 13,
  },
  {
    id: 'titan', name: 'TITAN', title: 'Pumnul Cosmic', titleEn: 'Cosmic Fist',
    desc: 'Robot-colos. Mortiere titanice cu undă de șoc peste ziduri.',
    descEn: 'Colossus robot. Titanic shockwave mortars over walls.',
    rarity: 'legendar', kind: 'mortar', species: 'robot', sizeMul: 1.2,
    color: 0x4c1d95, accent: 0xff9f1c,
    hp: 4200, damage: 1100, projectiles: 1, ammoMax: 1,
    range: 12.5, reloadMs: 1800, speed: 6.2,
    superDamage: 2000, superCount: 3, superRange: 13,
    superCooldownHits: 7, sightRange: 14,
  },
  {
    id: 'fantoma', name: 'FANTOMA', title: 'Șoapta din Vid', titleEn: 'Void Whisper',
    desc: 'Șapte lame spectrale într-un evantai perfect. Frumusețe letală.',
    descEn: 'Seven spectral blades in a perfect fan. Lethal beauty.',
    rarity: 'legendar', kind: 'spread', species: 'monstru', sizeMul: 0.95,
    color: 0xe2e8f0, accent: 0xb15cff,
    hp: 3200, damage: 300, projectiles: 7, ammoMax: 5,
    range: 8.5, reloadMs: 1200, speed: 7.0,
    superDamage: 700, superCount: 9, superRange: 10,
    superCooldownHits: 6, sightRange: 14,
  },
  {
    id: 'quasar', name: 'QUASAR', title: 'Ochiul Galaxiei', titleEn: 'Galaxy Eye',
    desc: 'Entitate stelară. Jet relativistic ce topește orice.',
    descEn: 'Stellar entity. Relativistic jet that melts everything.',
    rarity: 'cosmic', kind: 'pierce', species: 'monstru', sizeMul: 1.05,
    color: 0x00ffd0, accent: 0xffffff,
    hp: 3600, damage: 880, projectiles: 1, ammoMax: 2,
    range: 11.5, reloadMs: 950, speed: 7.3,
    superDamage: 1900, superCount: 3, superRange: 13,
    superCooldownHits: 6, sightRange: 15,
  },
  {
    id: 'gaura', name: 'GAURA', title: 'Neagră și Nemiloasă', titleEn: 'Black and Merciless',
    desc: 'Singularitate vie. Înghite lumină, speranță și puncte de viață.',
    descEn: 'Living singularity. Swallows light, hope and hit points.',
    rarity: 'cosmic', kind: 'lob', species: 'monstru', sizeMul: 1.15,
    color: 0x0f0f1a, accent: 0xb15cff,
    hp: 4800, damage: 1000, projectiles: 1, ammoMax: 1,
    range: 9.5, reloadMs: 1500, speed: 6.4,
    superDamage: 2200, superCount: 1, superRange: 11,
    superCooldownHits: 7, sightRange: 14,
  },
];


// ---------- Gadgeturi (abilități pasive cumpărabile per erou) ----------
export interface GadgetDef {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  desc: string;
  descEn: string;
  price: number;
}

export const GADGETS: GadgetDef[] = [
  {
    id: 'scut', name: 'Scut de Start', nameEn: 'Starter Shield', icon: '🛡️',
    desc: '+800 viață la începutul meciului.', descEn: '+800 health at match start.',
    price: 300,
  },
  {
    id: 'vampir', name: 'Colți de Vampir', nameEn: 'Vampire Fangs', icon: '🩸',
    desc: '12% din damage-ul dat îți revine ca viață.', descEn: '12% of damage dealt returns as health.',
    price: 350,
  },
  {
    id: 'sprint', name: 'Ghete Iuți', nameEn: 'Swift Boots', icon: '👟',
    desc: '+10% viteză de mișcare.', descEn: '+10% move speed.',
    price: 300,
  },
  {
    id: 'furie', name: 'Furie', nameEn: 'Fury', icon: '😡',
    desc: 'Super-ul se încarcă cu 2 lovituri mai devreme.', descEn: 'Super charges 2 hits earlier.',
    price: 400,
  },
];

export const gadgetById = (id: string | undefined): GadgetDef | null =>
  GADGETS.find((g) => g.id === id) ?? null;

export const HERO_IDS = HEROES.map((h) => h.id);

export const heroById = (id: string): HeroDef =>
  HEROES.find((h) => h.id === id) ?? HEROES[0];

export const isHeroId = (id: unknown): id is string =>
  typeof id === 'string' && HERO_IDS.includes(id);

export const RARITY_COLOR: Record<Rarity, string> = {
  comun: '#3ddc84',
  rar: '#2d7dff',
  'super-rar': '#22d3ee',
  epic: '#b15cff',
  mitic: '#ff4d7e',
  legendar: '#ffb020',
  cosmic: '#f5f7ff',
};

export const RARITY_ORDER: Rarity[] = ['comun', 'rar', 'super-rar', 'epic', 'mitic', 'legendar', 'cosmic'];

// ---------- Putere erou (nivele 1-11) ----------
export const POWER_MAX = 11;
/** Costul upgrade-ului de la nivelul p la p+1 (monezi). */
export const UPGRADE_COST: number[] = [0, 20, 40, 70, 110, 160, 220, 300, 390, 500, 620, 0];

/** Scalare stat-uri cu nivelul de putere (serverul aplică aceeași formulă). */
export function scaleHeroDef(def: HeroDef, power: number): HeroDef {
  const p = Math.max(1, Math.min(POWER_MAX, Math.round(power) || 1));
  if (p === 1) return def;
  const hpMul = 1 + 0.055 * (p - 1);
  const dmgMul = 1 + 0.075 * (p - 1);
  return {
    ...def,
    hp: Math.round(def.hp * hpMul),
    damage: Math.round(def.damage * dmgMul),
    superDamage: Math.round(def.superDamage * dmgMul),
  };
}
