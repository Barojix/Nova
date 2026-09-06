// Test showdown pe echipe: Duo (5x2), Trio (3x3), win = ultima echipa.
import { Match } from '../src/game/Match';
import type { PlayerSpec } from '../src/game/Match';
import { botInput } from '../src/game/Bots';
import { mapById } from '../src/data/maps';

const assert = (c: boolean, l: string) => {
  console.log(`${c ? 'OK  ' : 'FAIL'} ${l}`);
  if (!c) process.exitCode = 1;
};
const dt = 1 / 60;
const map = mapById('campia-furtunii');

function mkSpecs(total: number, size: number): PlayerSpec[] {
  const specs: PlayerSpec[] = [{ name: 'L', heroId: 'volt', team: 0, isBot: false, isLocal: true }];
  for (let i = 1; i < total; i++) {
    specs.push({ name: 'B' + i, heroId: 'moss', team: Math.floor(i / size), isBot: true });
  }
  return specs;
}
function runToEnd(m: Match, secs: number) {
  for (let i = 0; i < secs * 60 && !m.over; i++) {
    const inputs = new Map();
    for (const f of m.fighters) {
      inputs.set(f.id, f.isLocal
        ? { mx: Math.sin(i * 0.05), mz: Math.cos(i * 0.03), ax: 1, az: 0, attack: i % 30 === 0, super: false }
        : botInput(m, f, dt));
    }
    m.update(dt, inputs);
    m.drain();
  }
}

for (const [total, size, label] of [[10, 1, 'Solo'], [10, 2, 'Duo'], [9, 3, 'Trio'], [8, 4, 'Squad']] as const) {
  const m = new Match('showdown', map, mkSpecs(total, size) as never);
  const teams = [...new Set(m.fighters.map((f) => f.team))];
  assert(m.fighters.length === total && teams.length === Math.ceil(total / size), `${label}: ${total} luptători în ${teams.length} echipe`);
  runToEnd(m, 150);
  assert(m.over, `${label}: meciul se termină (t=${m.time.toFixed(0)}s)`);
}
console.log('TEAMS-TEST DONE');
