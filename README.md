# NOVA ARENA — hero brawler mobil original

Joc original inspirat ca **experiență/structură** din hero brawlerele de tip Brawl Stars,
dar cu personaje, hărți, UI, sunete și lore 100% originale. Three.js + TypeScript +
Capacitor + server autoritativ Node + `ws`.

## Status: v0.1 ✅ (testat)

- ✅ Meniu principal (profil, XP, trofee, monezi, vitrină 3D animată a eroului)
- ✅ 3 eroi originali (VOLT, MOSS, BLIP) + 4 moduri (Knockout 3v3, Star Rush 3v3, Showdown, Antrenament)
- ✅ 2 hărți originale, joystick dual + auto-aim + butoane ATAC/SUPER, tastatură pe desktop
- ✅ Combat: proiectile, Super, respawn, knockback, tufișuri stealth, damage numbers, screen shake
- ✅ Boți cu AI (luptă/kiting/fugă/stele/ocolire ziduri)
- ✅ Multiplayer REAL: server autoritativ (camere, snapshot 15Hz, validare, recompense) — testat cu 2 clienți
- ✅ Economie (monezi/gemuri/trofee/XP), shop skin-uri, misiuni, recompense zilnice, salvare locală
- ✅ Audio 100% sintetizat (SFX + muzică), setări (calitate/FPS/volum/controale), monitor FPS/ping
- ✅ Fallback offline cu boți dacă serverul nu e disponibil

**Verificat automat:** `tsc` curat · sim headless (252 atacuri, 11 KO) · `vite build` ·
server bundle · 2 clienți WS în aceeași cameră · 15/15 aserțiuni UI (jsdom).

## Dezvoltare rapidă

```bash
cd nova-arena
npm install
npm run dev            # client http://localhost:5173
npm run dev:server     # server ws://localhost:2567 (în alt terminal)
```

Teste:

```bash
npm run build                              # typecheck + build client
npm --prefix server exec tsx ../scripts/sim-test.ts   # sim headless
node scripts/smoke.mjs                     # artefacte build
```

## Multiplayer real (gratuit / open-source)

Serverul din `server/` e autoritativ pentru damage, HP, rezultate și recompense.
Deploy gratuit (free-tier): Railway / Render / Fly.io sau orice VPS:

```bash
cd server && npm install && npm run build && npm start   # PORT=2567 implicit
```

Apoi setează URL-ul în client (`VITE_NOVA_SERVER=wss://domeniul-tău` la build)
și în `capacitor.config.ts` pentru mobil. Două telefoane în aceeași rețea pot juca
și fără internet: pornește serverul pe PC și pune IP-ul LAN în `VITE_NOVA_SERVER`.

Fără server → jocul intră automat în mod **OFFLINE cu boți**.

## Pe telefon (Capacitor)

```bash
npm run build
npx cap add android   # o singură dată
npx cap sync
npx cap open android   # apoi Run din Android Studio
```

### APK automat din cloud (recomandat, fără PC puternic)

La fiecare push pe `main`, GitHub Actions construiește automat APK-ul debug:

1. Creează un repo GitHub gol (ex. `nova-arena`).
2. `git remote add origin git@github.com:USER/nova-arena.git && git push -u origin main`
3. Deschide repo-ul pe telefon → tab-ul **Actions** → ultimul run → artefactul
   **nova-arena-apk** → descarcă și instalează (permite „surse necunoscute”).
4. La tag-uri `v*` (ex. `git tag v0.2.0 && git push --tags`) se creează automat
   un **Release** cu APK + `version.json` + changelog.

APK-urile sunt semnate cu aceeași cheie (`android/app/debug.keystore` comisă în
repo), iar `versionCode` crește la fiecare build — update-urile se instalează
peste versiunea veche fără dezinstalare.

### Actualizări automate în aplicație (OTA)

Jocul verifică singur ultimul Release GitHub:

- o dată pe sesiune, silențios, în meniu (toast doar dacă există update);
- manual din **Setări → Verifică actualizări** (arată versiunea instalată);
- la update disponibil apare dialog cu changelog → **Actualizează acum**:
  pe Android descarcă APK-ul via DownloadManager și deschide promptul de
  instalare; pe alte platforme deschide pagina release-ului în browser.

Configurare: `src/updater/repo.ts` (`VITE_GITHUB_REPO="user/repo"` la build).
Până la conectarea repo-ului, verificarea răspunde „neconfigurat".

## Controale

- Joystick stânga: mișcare · drag dreapta: țintire (ridicarea degetului = foc)
- ATAC / SUPER, auto-aim opțional, sensibilitate + mărime joystick din Setări
- Desktop: WASD + mouse + Space (atac) + E (super)

## Roadmap (continuous updates)

v0.2 gameplay+bugfix → v0.3 UI/UX → v0.4 animații → v0.5 VFX → v0.6 audio →
v0.7 performanță → v0.8 stabilitate multiplayer (reconnect, party codes în UI) →
v0.9 mobil (Capacitor build pe device) → v1.0 QA final.
