// Test controale Brawl headless: structură + tap/drag pe stick-uri.
import { createRequire } from 'node:module';
const require = createRequire('/root/joc-test/god-sandbox/package.json');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="t"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
});
// @ts-ignore
globalThis.window = dom.window;
// @ts-ignore
globalThis.document = dom.window.document;
// @ts-ignore
globalThis.localStorage = dom.window.localStorage;
// @ts-ignore
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

const assert = (c: boolean, l: string) => {
  console.log(`${c ? 'OK  ' : 'FAIL'} ${l}`);
  if (!c) process.exitCode = 1;
};

const { TouchControls } = await import('../src/player/TouchControls');
const root = document.getElementById('t')!;
const tc = new TouchControls(root);
assert(!!root.querySelector('#tc-atk'), 'stick atac există');
assert(!!root.querySelector('#tc-sup'), 'stick super există');
assert(!!root.querySelector('#tc-move'), 'stick mișcare există');
assert(!root.querySelector('#tc-atkbtn, .tc-btn'), 'fără buton separat de atac');

const PE = (dom.window as any).PointerEvent;
if (typeof PE === 'function') {
  const atk = root.querySelector('#tc-atk') as HTMLElement;
  atk.getBoundingClientRect = () => ({ left: 700, top: 200, width: 104, height: 104, right: 804, bottom: 304, x: 700, y: 200, toJSON: () => ({}) }) as DOMRect;
  const cx = 752, cy = 252;
  // TAP pe atac → foc cu auto-aim (fără aim manual)
  atk.dispatchEvent(new PE('pointerdown', { pointerId: 7, clientX: cx, clientY: cy, bubbles: true }));
  atk.dispatchEvent(new PE('pointerup', { pointerId: 7, clientX: cx, clientY: cy, bubbles: true }));
  assert(tc.state.attackPressed && !tc.state.aiming, 'tap atac → attackPressed, fără aim manual');
  assert(!tc.state.aimSuper, 'tap atac → nu e super-aim');
  assert(tc.consumeAttack() && !tc.state.aiming, 'consum tap → aiming rămâne jos');
  // DRAG pe atac → aim manual + foc la ridicare
  atk.dispatchEvent(new PE('pointerdown', { pointerId: 8, clientX: cx, clientY: cy, bubbles: true }));
  atk.dispatchEvent(new PE('pointermove', { pointerId: 8, clientX: cx + 50, clientY: cy, bubbles: true }));
  assert(tc.state.aiming && tc.state.ax > 0.9, 'drag atac → aim manual spre dreapta');
  atk.dispatchEvent(new PE('pointerup', { pointerId: 8, clientX: cx + 50, clientY: cy, bubbles: true }));
  assert(tc.state.attackPressed && tc.state.aiming, 'ridicare după drag → foc + aim păstrat');
  assert(tc.consumeAttack() && !tc.state.aiming, 'consum drag → aim eliberat');
  // TAP pe super
  const sup = root.querySelector('#tc-sup') as HTMLElement;
  sup.getBoundingClientRect = () => ({ left: 600, top: 100, width: 76, height: 76, right: 676, bottom: 176, x: 600, y: 100, toJSON: () => ({}) }) as DOMRect;
  sup.dispatchEvent(new PE('pointerdown', { pointerId: 9, clientX: 638, clientY: 138, bubbles: true }));
  sup.dispatchEvent(new PE('pointerup', { pointerId: 9, clientX: 638, clientY: 138, bubbles: true }));
  assert(tc.state.superPressed, 'tap super → superPressed');
  tc.consumeSuper();
  assert(!tc.state.aimSuper, 'consum super → aimSuper jos');
  // super gata → glow
  tc.setSuperReady(true);
  assert(sup.classList.contains('ready'), 'super ready → glow vizual');
} else {
  console.log('SKIP pointer events (jsdom fără PointerEvent)');
}
console.log('TOUCH-TEST DONE');
