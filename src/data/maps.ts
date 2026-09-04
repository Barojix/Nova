export interface WallDef { x: number; z: number; w: number; d: number }
export interface BushDef { x: number; z: number; r: number }
export interface SpawnDef { x: number; z: number; team: number }

export interface MapDef {
  id: string;
  name: string;
  size: number; // hartă pătrată size x size
  walls: WallDef[];
  bushes: BushDef[];
  spawnsA: SpawnDef[];
  spawnsB: SpawnDef[];
  mine?: { x: number; z: number };       // gemgrab: mina de geme
  safes?: { x: number; z: number; team: number }[]; // heist
  crates?: { x: number; z: number }[];   // showdown: cutii distructibile
}

// Hartă originală: "Hollow de Cristal" — simetrică, 2 culoare + centru disputat.
export const MAPS: MapDef[] = [
  {
    id: 'crystal-hollow',
    name: 'Hollow de Cristal',
    size: 34,
    walls: [
      // centru — 4 blocuri în cruce cu deschidere
      { x: -3, z: -3, w: 4, d: 1.2 }, { x: 3, z: -3, w: 4, d: 1.2 },
      { x: -3, z: 3, w: 4, d: 1.2 }, { x: 3, z: 3, w: 4, d: 1.2 },
      { x: 0, z: 0, w: 2.4, d: 2.4 },
      // laterale
      { x: -10, z: 0, w: 1.4, d: 8 }, { x: 10, z: 0, w: 1.4, d: 8 },
      { x: -6, z: -9, w: 6, d: 1.2 }, { x: 6, z: 9, w: 6, d: 1.2 },
      { x: -6, z: 9, w: 6, d: 1.2 }, { x: 6, z: -9, w: 6, d: 1.2 },
      // colțuri
      { x: -13, z: -13, w: 3, d: 3 }, { x: 13, z: -13, w: 3, d: 3 },
      { x: -13, z: 13, w: 3, d: 3 }, { x: 13, z: 13, w: 3, d: 3 },
    ],
    bushes: [
      { x: 0, z: -7, r: 2.6 }, { x: 0, z: 7, r: 2.6 },
      { x: -7, z: 0, r: 2.2 }, { x: 7, z: 0, r: 2.2 },
      { x: -12, z: 5, r: 2.0 }, { x: 12, z: -5, r: 2.0 },
      { x: -12, z: -5, r: 2.0 }, { x: 12, z: 5, r: 2.0 },
    ],
    spawnsA: [
      { x: -13, z: 0, team: 0 }, { x: -14, z: -2, team: 0 }, { x: -14, z: 2, team: 0 },
    ],
    spawnsB: [
      { x: 13, z: 0, team: 1 }, { x: 14, z: -2, team: 1 }, { x: 14, z: 2, team: 1 },
    ],
  },
  {
    id: 'dune-rush',
    name: 'Viteza Dunelor',
    size: 30,
    walls: [
      { x: 0, z: -6, w: 10, d: 1.2 }, { x: 0, z: 6, w: 10, d: 1.2 },
      { x: -5, z: 0, w: 1.4, d: 6 }, { x: 5, z: 0, w: 1.4, d: 6 },
      { x: -11, z: -8, w: 4, d: 1.2 }, { x: 11, z: 8, w: 4, d: 1.2 },
      { x: 11, z: -8, w: 4, d: 1.2 }, { x: -11, z: 8, w: 4, d: 1.2 },
    ],
    bushes: [
      { x: 0, z: 0, r: 3.0 },
      { x: -8, z: 0, r: 2.0 }, { x: 8, z: 0, r: 2.0 },
    ],
    spawnsA: [
      { x: -11, z: 0, team: 0 }, { x: -12, z: -2, team: 0 }, { x: -12, z: 2, team: 0 },
    ],
    spawnsB: [
      { x: 11, z: 0, team: 1 }, { x: 12, z: -2, team: 1 }, { x: 12, z: 2, team: 1 },
    ],
  },
  {
    id: 'oaza-stelelor',
    name: 'Oaza Stelelor',
    size: 36,
    walls: [
      { x: 0, z: 0, w: 3, d: 3 },
      { x: -7, z: -5, w: 5, d: 1.2 }, { x: 7, z: 5, w: 5, d: 1.2 },
      { x: 7, z: -5, w: 5, d: 1.2 }, { x: -7, z: 5, w: 5, d: 1.2 },
      { x: -13, z: 0, w: 1.4, d: 9 }, { x: 13, z: 0, w: 1.4, d: 9 },
      { x: 0, z: -13, w: 9, d: 1.4 }, { x: 0, z: 13, w: 9, d: 1.4 },
      { x: -14, z: -12, w: 3, d: 3 }, { x: 14, z: 12, w: 3, d: 3 },
      { x: 14, z: -12, w: 3, d: 3 }, { x: -14, z: 12, w: 3, d: 3 },
    ],
    bushes: [
      { x: -4, z: -10, r: 2.4 }, { x: 4, z: 10, r: 2.4 },
      { x: -10, z: 4, r: 2.2 }, { x: 10, z: -4, r: 2.2 },
      { x: -10, z: -4, r: 1.8 }, { x: 10, z: 4, r: 1.8 },
    ],
    spawnsA: [
      { x: -14, z: 0, team: 0 }, { x: -15, z: -2, team: 0 }, { x: -15, z: 2, team: 0 },
    ],
    spawnsB: [
      { x: 14, z: 0, team: 1 }, { x: 15, z: -2, team: 1 }, { x: 15, z: 2, team: 1 },
    ],
  },
  {
    id: 'mina-gemelina',
    name: 'Mina Gemelină',
    size: 36,
    mine: { x: 0, z: 0 },
    walls: [
      { x: -4, z: 0, w: 1.4, d: 6 }, { x: 4, z: 0, w: 1.4, d: 6 },
      { x: 0, z: -5, w: 8, d: 1.2 }, { x: 0, z: 5, w: 8, d: 1.2 },
      { x: -10, z: -9, w: 5, d: 1.2 }, { x: 10, z: 9, w: 5, d: 1.2 },
      { x: 10, z: -9, w: 5, d: 1.2 }, { x: -10, z: 9, w: 5, d: 1.2 },
      { x: -14, z: 0, w: 2, d: 6 }, { x: 14, z: 0, w: 2, d: 6 },
    ],
    bushes: [
      { x: -7, z: 0, r: 2.6 }, { x: 7, z: 0, r: 2.6 },
      { x: 0, z: -10, r: 2.0 }, { x: 0, z: 10, r: 2.0 },
      { x: -13, z: 6, r: 1.8 }, { x: 13, z: -6, r: 1.8 },
    ],
    spawnsA: [
      { x: -14, z: -3, team: 0 }, { x: -15, z: 0, team: 0 }, { x: -14, z: 3, team: 0 },
    ],
    spawnsB: [
      { x: 14, z: 3, team: 1 }, { x: 15, z: 0, team: 1 }, { x: 14, z: -3, team: 1 },
    ],
  },
  {
    id: 'tunelul-seifului',
    name: 'Tunelul Seifului',
    size: 40,
    safes: [
      { x: -16, z: 0, team: 0 }, { x: 16, z: 0, team: 1 },
    ],
    walls: [
      // culoar central cu intrări laterale
      { x: 0, z: -7, w: 14, d: 1.2 }, { x: 0, z: 7, w: 14, d: 1.2 },
      { x: -8, z: 0, w: 1.4, d: 8 }, { x: 8, z: 0, w: 1.4, d: 8 },
      // forturi seif
      { x: -14, z: -4, w: 4, d: 1.2 }, { x: -14, z: 4, w: 4, d: 1.2 },
      { x: 14, z: -4, w: 4, d: 1.2 }, { x: 14, z: 4, w: 4, d: 1.2 },
      { x: -5, z: -12, w: 6, d: 1.2 }, { x: 5, z: 12, w: 6, d: 1.2 },
      { x: 5, z: -12, w: 6, d: 1.2 }, { x: -5, z: 12, w: 6, d: 1.2 },
    ],
    bushes: [
      { x: -4, z: -11, r: 2.4 }, { x: 4, z: 11, r: 2.4 },
      { x: -11, z: 8, r: 2.0 }, { x: 11, z: -8, r: 2.0 },
      { x: 0, z: 0, r: 1.6 },
    ],
    spawnsA: [
      { x: -13, z: -6, team: 0 }, { x: -13, z: 6, team: 0 }, { x: -11, z: 0, team: 0 },
    ],
    spawnsB: [
      { x: 13, z: 6, team: 1 }, { x: 13, z: -6, team: 1 }, { x: 11, z: 0, team: 1 },
    ],
  },
  {
    id: 'campia-furtunii',
    name: 'Câmpia Furtunii',
    size: 56,
    walls: [
      // obstacole rare, împrăștiate (hartă mare de supraviețuire)
      { x: -14, z: -14, w: 6, d: 1.4 }, { x: 14, z: 14, w: 6, d: 1.4 },
      { x: 14, z: -14, w: 6, d: 1.4 }, { x: -14, z: 14, w: 6, d: 1.4 },
      { x: 0, z: -18, w: 10, d: 1.4 }, { x: 0, z: 18, w: 10, d: 1.4 },
      { x: -18, z: 0, w: 1.4, d: 10 }, { x: 18, z: 0, w: 1.4, d: 10 },
      { x: -6, z: -6, w: 3, d: 3 }, { x: 6, z: 6, w: 3, d: 3 },
      { x: 6, z: -6, w: 3, d: 3 }, { x: -6, z: 6, w: 3, d: 3 },
      { x: -22, z: 8, w: 4, d: 1.4 }, { x: 22, z: -8, w: 4, d: 1.4 },
    ],
    bushes: [
      { x: 0, z: 0, r: 3.4 },
      { x: -10, z: -10, r: 2.8 }, { x: 10, z: 10, r: 2.8 },
      { x: 10, z: -10, r: 2.8 }, { x: -10, z: 10, r: 2.8 },
      { x: -20, z: -2, r: 2.4 }, { x: 20, z: 2, r: 2.4 },
      { x: -2, z: -20, r: 2.4 }, { x: 2, z: 20, r: 2.4 },
      { x: -24, z: -20, r: 2.6 }, { x: 24, z: 20, r: 2.6 },
    ],
    spawnsA: [{ x: -20, z: -20, team: 0 }],
    spawnsB: [{ x: 20, z: 20, team: 1 }],
    crates: [
      { x: -4, z: -12 }, { x: 4, z: 12 }, { x: -12, z: 4 }, { x: 12, z: -4 },
      { x: -8, z: 14 }, { x: 8, z: -14 }, { x: 16, z: 6 }, { x: -16, z: -6 },
      { x: 0, z: 8 }, { x: 0, z: -8 }, { x: 22, z: 14 }, { x: -22, z: -14 },
    ],
  },
];

export const mapById = (id: string) => MAPS.find((m) => m.id === id) ?? MAPS[0];

/** Harta potrivită fiecărui mod (custom poate alege oricare). */
export const MAP_FOR_MODE: Record<string, string> = {
  knockout: 'crystal-hollow',
  starrush: 'oaza-stelelor',
  gemgrab: 'mina-gemelina',
  heist: 'tunelul-seifului',
  showdown: 'campia-furtunii',
  training: 'dune-rush',
};

export const mapForMode = (modeId: string): string => MAP_FOR_MODE[modeId] ?? 'crystal-hollow';
