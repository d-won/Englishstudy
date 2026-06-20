/**
 * Generates raster PNG icons (no external deps) from a simple procedural
 * design: diagonal purple→pink gradient with a white rounded "bite" notch.
 * Good enough for PWA installability + notification badges. The pretty
 * vector version lives in public/icons/icon.svg.
 *
 * Run:  node scripts/generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function makeRGBA(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const c1 = [108, 92, 231]; // #6c5ce7
  const c2 = [255, 107, 157]; // #ff6b9d
  const r = size * (maskable ? 0.5 : 0.22); // corner radius
  const cx = size / 2;
  const cy = size / 2;
  // a white rounded square "card" in the middle, with a circular bite removed
  const cardPad = size * 0.28;
  const cardR = size * 0.08;
  const biteCx = size * 0.74;
  const biteCy = size * 0.30;
  const biteR = size * 0.16;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = (x + y) / (2 * size);
      let R = lerp(c1[0], c2[0], t);
      let G = lerp(c1[1], c2[1], t);
      let B = lerp(c1[2], c2[2], t);
      let A = 255;

      // rounded-rect alpha mask for the whole icon (skip for maskable: full bleed)
      if (!maskable) {
        if (!insideRoundRect(x, y, 0, 0, size, size, r)) A = 0;
      }

      // white card
      if (
        insideRoundRect(x, y, cardPad, cardPad, size - cardPad, size - cardPad, cardR)
      ) {
        R = 255;
        G = 255;
        B = 255;
        // bite: remove a circle so it reads as "한입"
        const dx = x - biteCx;
        const dy = y - biteCy;
        if (dx * dx + dy * dy < biteR * biteR) {
          // revert to gradient (the bite shows background through)
          R = lerp(c1[0], c2[0], t);
          G = lerp(c1[1], c2[1], t);
          B = lerp(c1[2], c2[2], t);
        }
      }

      buf[i] = R;
      buf[i + 1] = G;
      buf[i + 2] = B;
      buf[i + 3] = A;
    }
  }
  return buf;
}

function insideRoundRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  // corners
  const nx = Math.max(x0 + r - px, 0, px - (x1 - r));
  const ny = Math.max(y0 + r - py, 0, py - (y1 - r));
  return nx * nx + ny * ny <= r * r;
}

// --- minimal PNG encoder (truecolor + alpha) ---
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // add filter byte (0) per scanline
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-180.png', size: 180, maskable: false },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
];
for (const t of targets) {
  const rgba = makeRGBA(t.size, { maskable: t.maskable });
  fs.writeFileSync(path.join(outDir, t.name), encodePNG(t.size, rgba));
  console.log('wrote', t.name);
}
console.log('done');
