// Draws the extension icon (violet rounded square, dashed "highlight" frame)
// as PNGs without any image dependencies.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function icon(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 128;
  const r = 28 * s;
  const inRounded = (x, y, x0, y0, x1, y1, rad) => {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const fx = x + 0.5, fy = y + 0.5;
      if (!inRounded(fx, fy, 0, 0, size, size, r)) continue;
      const t = (fx + fy) / (2 * size);
      let [R, G, B] = [Math.round(124 - 30 * t), Math.round(92 - 40 * t), 255];
      // dashed frame
      const m0 = 26 * s, m1 = size - 26 * s, w = Math.max(1.5, 7 * s);
      const onFrame = inRounded(fx, fy, m0, m0, m1, m1, 12 * s) && !inRounded(fx, fy, m0 + w, m0 + w, m1 - w, m1 - w, Math.max(1, 12 * s - w));
      const along = (fx + fy) / (16 * s);
      if (onFrame && (size < 32 || Math.floor(along) % 2 === 0)) [R, G, B] = [255, 255, 255];
      // centre dot
      if ((fx - size / 2) ** 2 + (fy - size / 2) ** 2 <= (14 * s) ** 2) [R, G, B] = [255, 255, 255];
      px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = 255;
    }
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync(new URL("../public/icons/", import.meta.url), { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url), icon(size));
console.log("icons written");
