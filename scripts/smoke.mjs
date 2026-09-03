// Verifică artefactele de build. Rulează după `npm run build` + build server.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
let fail = 0;
const check = (p, label) => {
  const ok = existsSync(join(root, p));
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} (${p})`);
  if (!ok) fail++;
};

check('dist/index.html', 'client html');
check('server/dist/index.js', 'server bundle');

try {
  const assets = readdirSync(join(root, 'dist/assets'));
  const js = assets.filter((f) => f.endsWith('.js'));
  console.log(`${js.length > 0 ? 'OK  ' : 'FAIL'} client bundle js (${js.length} fișiere)`);
  if (js.length === 0) fail++;
} catch {
  console.log('FAIL dist/assets lipsește');
  fail++;
}

process.exit(fail ? 1 : 0);
