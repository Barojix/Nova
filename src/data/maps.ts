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
];

export const mapById = (id: string) => MAPS.find((m) => m.id === id) ?? MAPS[0];
