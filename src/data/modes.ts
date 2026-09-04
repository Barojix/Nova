export interface GameModeDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  players: string;
  target: string;
}

export const MODES: GameModeDef[] = [
  { id: 'knockout', name: 'KNOCKOUT', desc: '3v3. Prima echipă la 8 eliminări câștigă.', icon: '⚔️', players: '3v3', target: '8 KO' },
  { id: 'gemgrab', name: 'GEM GRAB', desc: '3v3. Adună 10 geme din mină și ține-le 15 secunde.', icon: '💎', players: '3v3', target: '10 💎' },
  { id: 'heist', name: 'HEIST', desc: '3v3. Distruge seiful advers înainte să cadă al tău.', icon: '🏦', players: '3v3', target: 'Seif 💥' },
  { id: 'starrush', name: 'STAR RUSH', desc: 'Adună stele de la centru. Ține 10 stele 15 secunde.', icon: '⭐', players: '3v3', target: '10 ⭐' },
  { id: 'showdown', name: 'SHOWDOWN', desc: '10 eroi, fiecare pentru el. Sparge cutii, ia cuburi, fugi de gaz!', icon: '👑', players: 'Solo', target: 'Top 1' },
  { id: 'training', name: 'ANTRENAMENT', desc: 'Hartă de test. Ținte + bot pasiv. Fără presiune.', icon: '🎯', players: 'Solo', target: 'Practică' },
];

export const modeById = (id: string) => MODES.find((m) => m.id === id) ?? MODES[0];
