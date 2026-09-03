// Date data-driven — NU hardcoda stat-uri prin cod. Totul se balansează de aici.
export type Rarity = 'comun' | 'rar' | 'epic' | 'legendar';
export type AttackKind = 'bolt' | 'spread' | 'lob';

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  rarity: Rarity;
  color: number;      // culoare principală (siluetă)
  accent: number;     // culoare secundară
  hp: number;
  damage: number;     // per proiectil
  projectiles: number;// câte proiectile per atac (spread)
  range: number;      // unități lume
  reloadMs: number;   // timp între atacuri
  speed: number;      // unități / secundă
  superDamage: number;
  superCount: number;
  superRange: number;
  superCooldownHits: number; // câte hituri încarcă super-ul
  sightRange: number;
}

export const HEROES: HeroDef[] = [
  {
    id: 'volt',
    name: 'VOLT',
    title: 'Scânteia Rebelă',
    desc: 'Atac rapid cu fulgere. Perfect pentru începători. Super: descărcare în lanț.',
    rarity: 'comun',
    color: 0xffd23f, accent: 0x2d7dff,
    hp: 3400, damage: 420, projectiles: 1,
    range: 9.5, reloadMs: 750, speed: 7.2,
    superDamage: 900, superCount: 5, superRange: 11,
    superCooldownHits: 8, sightRange: 13,
  },
  {
    id: 'moss',
    name: 'MOSS',
    title: 'Gardianul Verde',
    desc: 'Tank masiv cu semințe explosive. Încasează mult, lovește pe arie.',
    rarity: 'rar',
    color: 0x3ddc84, accent: 0x7a4a21,
    hp: 5200, damage: 300, projectiles: 3,
    range: 7.0, reloadMs: 1050, speed: 6.1,
    superDamage: 650, superCount: 9, superRange: 8,
    superCooldownHits: 9, sightRange: 12,
  },
  {
    id: 'blip',
    name: 'BLIP',
    title: 'Micuta Supernovă',
    desc: 'Aruncă mine gravitaționale care explodează. Gameplay tactic, damage uriaș.',
    rarity: 'epic',
    color: 0xb15cff, accent: 0xff5fa2,
    hp: 2800, damage: 780, projectiles: 1,
    range: 8.5, reloadMs: 1250, speed: 6.8,
    superDamage: 1500, superCount: 1, superRange: 9,
    superCooldownHits: 7, sightRange: 13,
  },
];

export const heroById = (id: string): HeroDef =>
  HEROES.find((h) => h.id === id) ?? HEROES[0];

export const RARITY_COLOR: Record<Rarity, string> = {
  comun: '#3ddc84',
  rar: '#2d7dff',
  epic: '#b15cff',
  legendar: '#ffb020',
};
