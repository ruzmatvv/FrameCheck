// Builds the install assets (manifest, icons, service worker). Run by build.mjs; not part of the Worker bundle.
import {deflateSync, crc32} from "node:zlib";
import {createHash} from "node:crypto";

const BG = [14, 16, 17], LIME = [195, 252, 101];

// Three slanted speed bars, like the logo. `safe` shrinks the mark so a circular mask never cuts it.
function draw(size, safe) {
  const k = safe ? 0.7 : 1;
  const span = 0.56 * k, thick = 0.1 * k, gap = 0.17 * k, left = 0.5 - span / 2;
  const bars = [[-gap, 1], [0, 0.78], [gap, 0.56]]; // vertical offset, relative length
  const inside = (x, y) => {
    for (const [offset, rel] of bars) {
      const dy = y - (0.5 + offset);
      if (Math.abs(dy) > thick / 2) continue;
      const shift = dy * 0.9; // the lean
      if (x >= left + shift && x <= left + span * rel + shift) return true;
    }
    return false;
  };
  const rows = [], sub = 3;
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      let hit = 0;
      for (let sy = 0; sy < sub; sy++) for (let sx = 0; sx < sub; sx++) if (inside((px + (sx + 0.5) / sub) / size, (py + (sy + 0.5) / sub) / size)) hit++;
      const a = hit / (sub * sub);
      for (let c = 0; c < 3; c++) row[1 + px * 4 + c] = Math.round(BG[c] + (LIME[c] - BG[c]) * a);
      row[1 + px * 4 + 3] = 255;
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

export function makePng(size, safe = false) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(draw(size, safe), {level: 9})), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A .ico file that wraps one PNG picture (all current browsers read it).
export function makeIco(size = 32) {
  const png = makePng(size);
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);               // icon file, one image
  head[6] = size; head[7] = size; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); // size, planes, bits
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);   // data size and offset
  return Buffer.concat([head, png]);
}

export function manifest() {
  return JSON.stringify({
    name: "Framecheck", short_name: "Framecheck", lang: "uz", id: "/", start_url: "/", scope: "/", display: "standalone",
    background_color: "#0e1011", theme_color: "#0e1011",
    description: "Qurilmangiz uchun o‘yin talablari va taxminiy FPS.",
    icons: [
      {src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any"},
      {src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any"},
      {src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable"},
    ],
  });
}

export function buildPwa(serviceWorkerSource, html) {
  const version = createHash("sha256").update(html).digest("hex").slice(0, 12);
  return {
    manifest: manifest(),
    sw: serviceWorkerSource.replace("__VERSION__", version),
    icons: {
      "icon-48.png": makePng(48).toString("base64"),
      "icon-192.png": makePng(192).toString("base64"),
      "icon-512.png": makePng(512).toString("base64"),
      "maskable-512.png": makePng(512, true).toString("base64"),
      "apple-touch-icon.png": makePng(180, true).toString("base64"),
    },
  };
}
