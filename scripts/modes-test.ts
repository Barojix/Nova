// Test moduri noi: gemgrab (geme+hold), heist (seifuri), showdown (gaz+cutii+cuburi).
import { Match } from '../src/game/Match';
import type { PlayerSpec } from '../src/game/Match';
import { botInput } from '../src/game/Bots';
import { mapById } from '../src/data/maps';

const assert = (c: boolean, l: string) => {
  console.log(`${c ? 'OK  ' : 'FAIL'} ${l}`);
  if (!c) process.exitCode = 1;
};
const dt = 1 / 60;

function runSim(m: Match, secs: number, brain: (f: Parameters<typeof botInput>[1]) => void) {
  for (let i = 0; i < secs * 60 && !m.over; i++) {
    const inputs = new Map();
    for (const f of m.fighters) {
      inputs.set(f.id, f.isLocal
        ? { mx: Math.sin(i * 0.05), mz: Math.cos(i * 0.03), ax: 1, az: 0, attack: i % 40 === 0, super: false }
        : botInput(m, f, dt));
      brain(f);
    }
    m.update(dt, inputs);
    m.drain();
  }
}

// GEMGRAB 3v3
{
  const map = mapById('mina-gemelina');
  const m = new Match('gemgrab', map, [
    { name: 'L', heroId: 'volt', team: 0, isBot: false, isLocal: true },
    { name: 'B1', heroId: 'moss', team: 0, isBot: true },
    { name: 'B2', heroId: 'blip', team: 0, isBot: true },
    { name: 'E1', heroId: 'unda', team: 1, isBot: true },
    { name: 'E2', heroId: 'turbo', team: 1, isBot: true },
    { name: 'E3', heroId: 'ghimp', team: 1, isBot: true },
  ]);
  assert(m.stars.length >= 1, 'gemgrab: geme inițiale');
  runSim(m, 120, () => {});
  assert(m.scoreA + m.scoreB > 0, `gemgrab: geme culese (scor ${m.scoreA}:${m.scoreB})`);
  console.log(`  gemgrab over=${m.over} scor=${m.scoreA}:${m.scoreB} timp=${m.time.toFixed(0)}s`);
}

// HEIST 3v3
{
  const map = mapById('tunelul-seifului');
  const m = new Match('heist', map, [
    { name: 'L', heroId: 'mortar', team: 0, isBot: false, isLocal: true },
    { name: 'B1', heroId: 'moss', team: 0, isBot: true },
    { name: 'B2', heroId: 'unda', team: 0, isBot: true },
    { name: 'E1', heroId: 'volt', team: 1, isBot: true },
    { name: 'E2', heroId: 'moss', team: 1, isBot: true },
    { name: 'E3', heroId: 'blip', team: 1, isBot: true },
  ]);
  assert(m.safes.length === 2 && m.safes[0].hp === 12000, 'heist: 2 seifuri cu 12000 HP');
  runSim(m, 185, () => {});
  const dmgDone = 12000 - Math.min(m.safes[0].hp, m.safes[1].hp) > 0;
  assert(dmgDone || m.over, `heist: seifuri lovite (HP ${Math.round(m.safes[0].hp)}/${Math.round(m.safes[1].hp)}) over=${m.over}`);
}

// SHOWDOWN: gaz + cutii + cuburi
{
  const map = mapById('campia-furtunii');
  assert(map.size === 56 && (map.crates?.length ?? 0) >= 10, 'showdown: hartă 56 + 10+ cutii');
  const specs: PlayerSpec[] = [{ name: 'L', heroId: 'nova', team: 0, isBot: false, isLocal: true }];
  for (let i = 0; i < 9; i++) specs.push({ name: 'B' + i, heroId: 'volt', team: i + 1, isBot: true });
  const m = new Match('showdown', map, specs);
  assert(m.crates.length >= 10, `showdown: ${m.crates.length} cutii în meci`);
  const gas0 = m.gasR;
  runSim(m, 60, () => {});
  assert(m.gasR < gas0, `gazul se strânge (${gas0.toFixed(1)} → ${m.gasR.toFixed(1)})`);
  const cubesSeen = m.cubes.length > 0 || m.fighters.some((f) => f.powerups > 0);
  assert(cubesSeen, 'cutii sparte → cuburi culese');
  console.log(`  showdown over=${m.over} cutii ramase=${m.crates.length} timp=${m.time.toFixed(0)}s`);
}

// power scaling
{
  const map = mapById('crystal-hollow');
  const m = new Match('knockout', map, [
    { name: 'P1', heroId: 'volt', team: 0, isBot: false, isLocal: true, power: 11 },
    { name: 'P11', heroId: 'volt', team: 1, isBot: true, power: 1 },
  ]);
  const a = m.fighters[0], b = m.fighters[1];
  assert(a.hp > b.hp && a.def.damage > b.def.damage, `power 11 vs 1: HP ${a.hp}/${b.hp}, DMG ${a.def.damage}/${b.def.damage}`);
}
console.log('MODES-TEST DONE');
