// Test headless al simulării: 3v3 knockout, 60s, input random + boți reali.
// Rulează cu: npm --prefix server exec tsx ../scripts/sim-test.ts
import { Match } from '../src/game/Match';
import { botInput } from '../src/game/Bots';
import { mapById } from '../src/data/maps';

const match = new Match('knockout', mapById('crystal-hollow'), [
  { name: 'Test', heroId: 'volt', team: 0, isBot: false, isLocal: true },
  { name: 'B1', heroId: 'moss', team: 0, isBot: true },
  { name: 'B2', heroId: 'blip', team: 0, isBot: true },
  { name: 'E1', heroId: 'volt', team: 1, isBot: true },
  { name: 'E2', heroId: 'moss', team: 1, isBot: true },
  { name: 'E3', heroId: 'blip', team: 1, isBot: true },
]);

let shoots = 0;
let kos = 0;
let ticks = 0;
const dt = 1 / 60;
for (let i = 0; i < 60 * 60; i++) {
  const inputs = new Map();
  for (const f of match.fighters) {
    if (f.isLocal) {
      inputs.set(f.id, {
        mx: Math.sin(i * 0.05), mz: Math.cos(i * 0.03),
        ax: 1, az: 0,
        attack: i % 45 === 0, super: f.superReady && i % 200 === 0,
      });
    } else {
      inputs.set(f.id, botInput(match, f, dt));
    }
  }
  match.update(dt, inputs);
  for (const e of match.drain()) {
    if (e.type === 'shoot' || e.type === 'super') shoots++;
    if (e.type === 'ko') kos++;
  }
  ticks++;
  if (match.over) break;
  // sanity: fără NaN
  for (const f of match.fighters) {
    if (!Number.isFinite(f.x) || !Number.isFinite(f.z) || !Number.isFinite(f.hp)) {
      console.error('FAIL: NaN în sim', f);
      process.exit(1);
    }
  }
}
console.log(`ticks=${ticks} shoots=${shoots} kos=${kos} over=${match.over} score=${match.scoreA}:${match.scoreB}`);
if (shoots < 10) {
  console.error('FAIL: prea puține atacuri — boții nu trag?');
  process.exit(1);
}
if (kos < 1) {
  console.error('FAIL: niciun KO în 60s — damage-ul nu funcționează?');
  process.exit(1);
}
console.log('SIM-TEST OK');
