// Test ammo: max 3, consum la foc, regenerare, facing pe mișcare.
import { Match } from '../src/game/Match';
import { mapById } from '../src/data/maps';

const assert = (c: boolean, l: string) => {
  console.log(`${c ? 'OK  ' : 'FAIL'} ${l}`);
  if (!c) process.exitCode = 1;
};
const dt = 1 / 60;
const m = new Match('knockout', mapById('crystal-hollow'), [
  { name: 'L', heroId: 'volt', team: 0, isBot: false, isLocal: true },
  { name: 'E', heroId: 'volt', team: 1, isBot: true },
]);
const me = m.fighters[0];
const fire = () => {
  me.reloadT = 0;
  m.update(dt, new Map([[me.id, { mx: 0, mz: 0, ax: 1, az: 0, attack: true, super: false }]]));
  m.drain();
};
assert(me.ammo === 3, 'start cu 3 gloanțe');
fire(); fire(); fire();
assert(me.ammo === 0, `3 focuri → 0 gloanțe (am ${me.ammo})`);
const shotsBefore = m.bullets.length;
fire();
assert(m.bullets.length === shotsBefore, 'fără ammo → nu trage');
for (let i = 0; i < 60; i++) m.update(dt, new Map());
assert(me.ammo >= 1, `regenerează 1 glonț/s ciclu (am ${me.ammo})`);
// facing: merge dreapta, aim stânga → se uită unde merge
me.reloadT = 0;
m.update(dt, new Map([[me.id, { mx: 1, mz: 0, ax: -1, az: 0, attack: false, super: false }]]));
assert(Math.abs(me.facing - Math.PI / 2) < 0.01, `facing pe mișcare (${me.facing.toFixed(2)})`);
// foc pe loc spre stânga → snap la țintă doar la foc
me.reloadT = 0; me.ammo = 3;
m.update(dt, new Map([[me.id, { mx: 0, mz: 0, ax: -1, az: 0, attack: true, super: false }]]));
assert(Math.abs(me.facing + Math.PI / 2) < 0.01, `snap la foc (${me.facing.toFixed(2)})`);
console.log('AMMO-TEST DONE');
