// Generează iconițele PWA (PNG pur, fără dependențe): fundal navy + fulger lime.
// Rulează: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(w, 8);
  ihdr.writeUInt32BE(h, 12);
  ihdr[16] = 8; ihdr[17] = 6;
  const idat = deflateSync(raw);
  const idatChunk = Buffer.alloc(12 + idat.length);
  idatChunk.writeUInt32BE(idat.length, 0);
  idatChunk.write('IDAT', 4);
  idat.copy(idatChunk, 8);
  const crc = (buf, s, e) => {
    let c = 0xffffffff;
    const t = crcTable();
    for (let i = s; i < e; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const fix = (chunk, dataStart, dataEnd) => {
    chunk.writeUInt32BE(crc(chunk, 4, dataEnd), dataEnd);
  };
  fix(ihdr, 4, 21);
  fix(idatChunk, 4, 8 + idat.length);
  const sign = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  // CRC IHDR
  const out = Buffer.concat([sign, ihdr, idatChunk, iend]);
  return out;
}
let _ct = null;
function crcTable() {
  if (_ct) return _ct;
  _ct = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    _ct[n] = c >>> 0;
  }
  return _ct;
}

// desen: gradient navy + fulger
function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const bolt = (x, y) => {
    // poligon fulger normalizat 0..1
    const pts = [[0.55, 0.08], [0.28, 0.55], [0.46, 0.55], [0.4, 0.92], [0.72, 0.44], [0.53, 0.44]];
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size, ny = y / size;
      const i = (y * size + x) * 4;
      // colțuri rotunjite (doar estetic la maskable)
      const r = 0.18 * size;
      const cx = Math.min(x, size - 1 - x), cy = Math.min(y, size - 1 - y);
      const corner = cx < r && cy < r && Math.hypot(r - cx, r - cy) > r;
      if (corner) {
        buf[i + 3] = 0;
        continue;
      }
      const t = (nx + ny) / 2;
      buf[i] = Math.round(11 + t * 30);
      buf[i + 1] = Math.round(14 + t * 36);
      buf[i + 2] = Math.round(29 + t * 61);
      buf[i + 3] = 255;
      if (bolt(nx, ny)) {
        buf[i] = 184; buf[i + 1] = 241; buf[i + 2] = 53; buf[i + 3] = 255;
      }
    }
  }
  return buf;
}

mkdirSync(new URL('../public/icons', import.meta.url), { recursive: true });
for (const s of [192, 512]) {
  const out = png(s, s, draw(s));
  const p = new URL(`../public/icons/icon-${s}.png`, import.meta.url);
  writeFileSync(p, out);
  console.log('icon', s, out.length, 'bytes');
}
