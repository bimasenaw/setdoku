/*
 * Simulasi buta warna untuk palet kartu.
 * Matriks dari Machado, Oliveira, Fernandes (2009), tingkat keparahan penuh.
 * Selisih warna memakai CIEDE2000. Jalankan: node alat/warna.js
 */
const fs = require('fs');
const path = require('path');

const SIMULASI = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

const keLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function linearDariHex(hex) {
  return [1, 3, 5].map((i) => keLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
}

function simulasikan(rgb, matriks) {
  return matriks.map((b) => Math.min(1, Math.max(0, b[0] * rgb[0] + b[1] * rgb[1] + b[2] * rgb[2])));
}

function labDariLinear([r, g, b]) {
  const xyz = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ];
  const f = xyz.map((t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116));
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}

function ciede2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cr = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cr ** 7 / (Cr ** 7 + 25 ** 7)));
  const p1 = a1 * (1 + G);
  const p2 = a2 * (1 + G);
  const c1 = Math.hypot(p1, b1);
  const c2 = Math.hypot(p2, b2);
  const sudut = (b, a) => (Math.atan2(b, a) / rad + 360) % 360;
  const h1 = sudut(b1, p1);
  const h2 = sudut(b2, p2);
  let dh = h2 - h1;
  if (c1 * c2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dL = L2 - L1;
  const dC = c2 - c1;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh / 2) * rad);
  const Lr = (L1 + L2) / 2;
  const cr = (c1 + c2) / 2;
  let hr = h1 + h2;
  if (c1 * c2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) hr /= 2;
    else hr = h1 + h2 < 360 ? (hr + 360) / 2 : (hr - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hr - 30) * rad) + 0.24 * Math.cos(2 * hr * rad)
    + 0.32 * Math.cos((3 * hr + 6) * rad) - 0.2 * Math.cos((4 * hr - 63) * rad);
  const SL = 1 + (0.015 * (Lr - 50) ** 2) / Math.sqrt(20 + (Lr - 50) ** 2);
  const SC = 1 + 0.045 * cr;
  const SH = 1 + 0.015 * cr * T;
  const RT = -2 * Math.sqrt(cr ** 7 / (cr ** 7 + 25 ** 7))
    * Math.sin(60 * Math.exp(-(((hr - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

function luminansi(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function kontras(a, b) {
  const [t, r] = [luminansi(a), luminansi(b)].sort((x, y) => y - x);
  return (t + 0.05) / (r + 0.05);
}

// Selisih terkecil antarpasangan warna, untuk setiap jenis penglihatan.
function selisihPalet(palet) {
  const hasil = [];
  for (const [jenis, matriks] of Object.entries(SIMULASI)) {
    for (let i = 0; i < palet.length; i++) {
      for (let j = i + 1; j < palet.length; j++) {
        const lab = [palet[i], palet[j]].map((w) => labDariLinear(simulasikan(linearDariHex(w.hex), matriks)));
        hasil.push({ jenis, a: palet[i].nama, b: palet[j].nama, selisih: ciede2000(lab[0], lab[1]) });
      }
    }
  }
  return hasil;
}

function kontrasPalet(palet, latar) {
  const dasar = linearDariHex(latar);
  const hasil = [];
  for (const [jenis, matriks] of Object.entries(SIMULASI)) {
    for (const w of palet) {
      hasil.push({ jenis, nama: w.nama, kontras: kontras(simulasikan(linearDariHex(w.hex), matriks), dasar) });
    }
  }
  return hasil;
}

function paletDariHalaman() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  return [...html.matchAll(/\{ nama: '([^']+)', hex: '(#[0-9a-f]{6})' \}/g)].map((m) => ({ nama: m[1], hex: m[2] }));
}

function skinDariHalaman() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const pola = /\{ id: '([^']+)', nama: '([^']+)', latar: '(#[0-9a-f]{6})', tepi: '(#[0-9a-f]{6})', latarTetap: '(#[0-9a-f]{6})', tepiTetap: '(#[0-9a-f]{6})' \}/g;
  return [...html.matchAll(pola)].map((m) => ({
    id: m[1], nama: m[2], latar: m[3], tepi: m[4], latarTetap: m[5], tepiTetap: m[6],
  }));
}

if (require.main === module) {
  const palet = process.argv.length > 2
    ? process.argv.slice(2).map((hex, i) => ({ nama: `warna ${i + 1}`, hex }))
    : paletDariHalaman();
  console.log(palet.map((w) => `${w.nama} ${w.hex}`).join(' | '));
  for (const r of selisihPalet(palet)) {
    console.log(`${r.jenis.padEnd(13)} ${r.a} vs ${r.b}: ${r.selisih.toFixed(1)}`);
  }
  for (const r of kontrasPalet(palet, '#1d2350')) {
    if (r.jenis === 'normal') console.log(`kontras ${r.nama}: ${r.kontras.toFixed(1)}`);
  }
}

module.exports = { selisihPalet, kontrasPalet, paletDariHalaman, skinDariHalaman };
