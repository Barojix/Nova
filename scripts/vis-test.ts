// Test vizibilitate: canSee + boții nu țintesc prin tufiș + sim 60s sănătos.
import { Match } from '../src/game/Match';
import { botInput } from '../src/game/Bots';
import { canSee, inBushAt } from '../src/game/visibility';
import { mapById } from '../src/data/maps';

const assert = (c: boolean, l: string) => {
  console.log(`${c ? 'OK  ' : 'FAIL'} ${l}`);
  if (!c) process.exitCode = 1;
};

const bushes = [{ x: 0, z: 0, r: 3 }];
assert(inBushAt(bushes, 0, 0), 'inBush: centru');
assert(!inBushAt(bushes, 5, 0), 'inBush: afară');
assert(canSee(bushes, 10, 0, 8, 0), 'văz: ambele afară');
assert(!canSee(bushes, 10, 0, 0, 0), 'ascuns: ținta în tufiș, privitorul afară');
assert(canSee(bushes, 1, 0, 0, 0), 'văz: privitorul în același tufiș');
assert(canSee(bushes, 2, 0, 0, 0), 'văz: foarte aproape (<3)');
assert(!canSee(bushes, 6, 0, 0, 0), 'ascuns: la 6 unități');

// botul nu atacă ținta ascunsă în tufiș
const map = mapById('crystal-hollow');
const bush = map.bushes[0];
const match = new Match('knockout', map, [
  { name: 'Bot', heroId: 'volt', team: 0, isBot: true },
  { name: 'Ascuns', heroId: 'moss', team: 1, isBot: true },
]);
// pune inamicul în tufiș, botul departe, în câmp deschis
const bot = match.fighters[0];
const foe = match.fighters[1];
foe.x = bush.x; foe.z = bush.z;
bot.x = bush.x + bush.r + 6; bot.z = bush.z;
bot.aiT = 99; // forțează decizia proaspătă
bot.aiT = 0;
const inp = botInput(match, bot, 1 / 60);
assert(!inp.attack, 'botul NU trage spre tufiș (țintă ascunsă)');
// inamicul iese din tufiș → botul îl vede și trage
foe.x = bush.x + bush.r + 2; foe.z = bush.z;
bot.aiT = 0;
let fired = false;
for (let i = 0; i < 30; i++) {
  const inp2 = botInput(match, bot, 1 / 60);
  if (inp2.attack) { fired = true; break; }
}
assert(fired, 'botul trage când ținta iese din tufiș');
console.log('VIS-TEST DONE');
