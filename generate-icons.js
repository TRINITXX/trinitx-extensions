// Generateur d'icones PNG (sans dependance) — monogramme "T" sur fond degrade.
// Lancer : node generate-icons.js   (regenere icons/icon{16,48,128}.png)
const fs = require("fs");
const zlib = require("zlib");

// --- CRC32 ---
const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Forme de l'icone (coordonnees normalisees 0..1) ---
const TOP = [0x3a, 0x86, 0xff]; // bleu
const BOT = [0x2d, 0xd3, 0x6f]; // vert
const PAD = 0.04;
const R = 0.22; // rayon des coins

function roundedBoxInside(nx, ny) {
  const hx = 0.5 - PAD,
    hy = 0.5 - PAD;
  const qx = Math.abs(nx - 0.5) - (hx - R);
  const qy = Math.abs(ny - 0.5) - (hy - R);
  const ax = Math.max(qx, 0),
    ay = Math.max(qy, 0);
  const dist = Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - R;
  return dist <= 0;
}
function inT(nx, ny) {
  const barT = 0.26,
    barB = 0.43,
    barL = 0.2,
    barR = 0.8;
  const stemL = 0.41,
    stemR = 0.59,
    stemB = 0.76;
  const inBar = nx >= barL && nx <= barR && ny >= barT && ny <= barB;
  const inStem = nx >= stemL && nx <= stemR && ny >= barT && ny <= stemB;
  return inBar || inStem;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 4; // supersampling pour anti-aliasing
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ar = 0,
        ag = 0,
        ab = 0,
        cov = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (x + (sx + 0.5) / SS) / size;
          const ny = (y + (sy + 0.5) / SS) / size;
          if (!roundedBoxInside(nx, ny)) continue;
          cov++;
          if (inT(nx, ny)) {
            ar += 255;
            ag += 255;
            ab += 255;
          } else {
            ar += TOP[0] + (BOT[0] - TOP[0]) * ny;
            ag += TOP[1] + (BOT[1] - TOP[1]) * ny;
            ab += TOP[2] + (BOT[2] - TOP[2]) * ny;
          }
        }
      }
      const idx = (y * size + x) * 4;
      const total = SS * SS;
      if (cov > 0) {
        rgba[idx] = Math.round(ar / cov);
        rgba[idx + 1] = Math.round(ag / cov);
        rgba[idx + 2] = Math.round(ab / cov);
        rgba[idx + 3] = Math.round((cov / total) * 255);
      } else {
        rgba[idx + 3] = 0;
      }
    }
  }
  return encodePNG(size, rgba);
}

fs.mkdirSync(__dirname + "/icons", { recursive: true });
for (const size of [16, 48, 128]) {
  fs.writeFileSync(__dirname + `/icons/icon${size}.png`, render(size));
  console.log("ecrit icons/icon" + size + ".png");
}
