export interface GameModeDef {
  id: string;
  name: string;
  nameEn: string;
  desc: string;
  descEn: string;
  icon: string;
  players: string;
  target: string;
  targetEn: string;
}

export const MODES: GameModeDef[] = [
  { id: 'knockout', name: 'KNOCKOUT', nameEn: 'KNOCKOUT', desc: '3v3. Prima echipă la 8 eliminări câștigă.', descEn: '3v3. First team to 8 takedowns wins.', icon: '⚔️', players: '3v3', target: '8 KO', targetEn: '8 KO' },
  { id: 'gemgrab', name: 'GEM GRAB', nameEn: 'GEM GRAB', desc: '3v3. Adună 10 geme din mină și ține-le 15 secunde.', descEn: '3v3. Grab 10 gems from the mine and hold them 15 seconds.', icon: '💎', players: '3v3', target: '10 💎', targetEn: '10 💎' },
  { id: 'heist', name: 'HEIST', nameEn: 'HEIST', desc: '3v3. Distruge seiful advers înainte să cadă al tău.', descEn: '3v3. Crack the enemy safe before yours falls.', icon: '🏦', players: '3v3', target: 'Seif 💥', targetEn: 'Safe 💥' },
  { id: 'starrush', name: 'STAR RUSH', nameEn: 'STAR RUSH', desc: 'Adună stele de la centru. Ține 10 stele 15 secunde.', descEn: 'Grab stars from the center. Hold 10 stars for 15 seconds.', icon: '⭐', players: '3v3', target: '10 ⭐', targetEn: '10 ⭐' },
  { id: 'showdown', name: 'SHOWDOWN', nameEn: 'SHOWDOWN', desc: '10 eroi, fiecare pentru el. Sparge cutii, ia cuburi, fugi de foc!', descEn: '10 heroes, every one for themselves. Smash boxes, grab cubes, outrun the fire!', icon: '👑', players: 'Solo', target: 'Top 1', targetEn: 'Top 1' },
  { id: 'training', name: 'ANTRENAMENT', nameEn: 'TRAINING', desc: 'Hartă de test. Ținte + bot pasiv. Fără presiune.', descEn: 'Practice map. Targets + passive bot. No pressure.', icon: '🎯', players: 'Solo', target: 'Practică', targetEn: 'Practice' },
];

export const modeById = (id: string) => MODES.find((m) => m.id === id) ?? MODES[0];
