'use strict';
// Tạo icon 512x512 (PNG) cho ứng dụng bằng Node thuần (zlib). Không cần thư viện ngoài.
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');

const W = 512, H = 512;
const data = Buffer.alloc(W * H * 4);
const idx = (x, y) => (y * W + x) * 4;
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function fillRect(x0, y0, x1, y1, r, g, b) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = idx(x, y); data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
}

// Nền bo góc + gradient teal
const R = 96;
function insideRounded(x, y) {
  let dx = 0, dy = 0;
  if (x < R) dx = R - x; else if (x >= W - R) dx = x - (W - R - 1);
  if (y < R) dy = R - y; else if (y >= H - R) dy = y - (H - R - 1);
  if (dx === 0 || dy === 0) return true;
  return dx * dx + dy * dy <= R * R;
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = idx(x, y);
  if (!insideRounded(x, y)) { data[i + 3] = 0; continue; }
  const t = y / H;
  data[i] = lerp(45, 13, t); data[i + 1] = lerp(212, 118, t); data[i + 2] = lerp(191, 110, t); data[i + 3] = 255;
}

// Mái nhà (tam giác trắng)
const roofApexY = 128, roofBaseY = 208, apexX = 256;
const roofHalf = 120;
for (let y = roofApexY; y < roofBaseY; y++) {
  const tt = (y - roofApexY) / (roofBaseY - roofApexY);
  fillRect(Math.round(apexX - roofHalf * tt), y, Math.round(apexX + roofHalf * tt), y + 1, 248, 250, 250);
}
// Thân toà nhà (trắng)
fillRect(160, 206, 352, 402, 248, 250, 250);
// Cửa sổ (teal) 3x3
const wc = 13, wg = 118, wb = 110;
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
  const wx = 180 + c * 58, wy = 226 + r * 50;
  fillRect(wx, wy, wx + 38, wy + 34, wc, wg, wb);
}
// Cửa chính (teal)
fillRect(236, 356, 276, 402, wc, wg, wb);

// ---- Mã hoá PNG ----
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, payload) {
  const len = Buffer.alloc(4); len.writeUInt32BE(payload.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, payload])), 0);
  return Buffer.concat([len, t, payload, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) { raw[y * (1 + W * 4)] = 0; data.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4); }
const png = Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const out = path.join(__dirname, 'icon.png');
fs.writeFileSync(out, png);
console.log('✔ Đã tạo', out, `(${(png.length / 1024).toFixed(1)} KB, ${W}x${H})`);
