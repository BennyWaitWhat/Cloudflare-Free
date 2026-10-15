// Draws the app icons (a white cloud with a "0" on an orange square) as PNGs.
// Run with `node scripts/make-icons.mjs`; no image libraries needed.
import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const TOP = [0xf9, 0x73, 0x16];
const BOTTOM = [0xc2, 0x41, 0x0c];

const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

function roundedBox(x, y, cx, cy, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x - cx) - halfWidth + radius;
  const qy = Math.abs(y - cy) - halfHeight + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function cloud(x, y) {
  return Math.min(
    circle(x, y, 0.36, 0.56, 0.17),
    circle(x, y, 0.52, 0.45, 0.22),
    circle(x, y, 0.68, 0.57, 0.15),
    roundedBox(x, y, 0.52, 0.64, 0.3, 0.08, 0.08),
  );
}

function zeroRing(x, y) {
  const dx = (x - 0.52) / 0.06;
  const dy = (y - 0.58) / 0.08;
  return Math.abs((Math.hypot(dx, dy) - 1) * 0.06) - 0.0185;
}

/** Signed distances in icon units turned into anti-aliased coverage. */
const coverage = (distance, size) => Math.min(1, Math.max(0, 0.5 - distance * size));

function draw(size, { maskable }) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = maskable ? 0.8 : 1;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      const v = (py + 0.5) / size;
      const background = maskable ? 1 : coverage(roundedBox(u, v, 0.5, 0.5, 0.5, 0.5, 0.22), size);
      // Content coordinates, shrunk into the maskable safe zone when needed.
      const x = (u - 0.5) / scale + 0.5;
      const y = (v - 0.5) / scale + 0.5;
      const white = coverage(cloud(x, y) * scale, size);
      const ring = coverage(zeroRing(x, y) * scale, size) * white;
      let r = TOP[0] + (BOTTOM[0] - TOP[0]) * v;
      let g = TOP[1] + (BOTTOM[1] - TOP[1]) * v;
      let b = TOP[2] + (BOTTOM[2] - TOP[2]) * v;
      r += (255 - r) * white;
      g += (255 - g) * white;
      b += (255 - b) * white;
      r += (BOTTOM[0] - r) * ring;
      g += (BOTTOM[1] - g) * ring;
      b += (BOTTOM[2] - b) * ring;
      const offset = (py * size + px) * 4;
      pixels[offset] = Math.round(r);
      pixels[offset + 1] = Math.round(g);
      pixels[offset + 2] = Math.round(b);
      pixels[offset + 3] = Math.round(255 * background);
    }
  }
  return encodePng(size, pixels);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0; // no filter
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("icon-192.png", out), draw(192, { maskable: false }));
writeFileSync(new URL("icon-512.png", out), draw(512, { maskable: false }));
writeFileSync(new URL("maskable-512.png", out), draw(512, { maskable: true }));
console.log("Wrote public/icons/icon-192.png, icon-512.png and maskable-512.png");
