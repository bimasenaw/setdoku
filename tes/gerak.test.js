const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../public/gerak.js');

// Menjalankan pegas sampai diam atau sampai batas waktu, dan mencatat nilai terbesarnya.
function jalankan(param, { awal = 0, target = 100, kec = 0, batas = 5 } = {}) {
  const pegas = G.buatPegas(param);
  const k = { nilai: awal, kec, target };
  let waktu = 0;
  let puncak = awal;
  while (waktu < batas && !G.sudahDiam(k, 0.05)) {
    G.majukan(pegas, k, 1 / 60);
    waktu += 1 / 60;
    puncak = Math.max(puncak, k.nilai);
  }
  return { k, waktu, puncak };
}

test('pegas berhenti di target', () => {
  for (const param of [{ redaman: 1, respons: 0.35 }, { redaman: 0.65, respons: 0.38 }, { redaman: 0.45, respons: 0.3 }]) {
    const { k, waktu } = jalankan(param);
    assert.ok(Math.abs(k.nilai - 100) < 0.05, `berhenti di ${k.nilai}`);
    assert.ok(waktu < 5, 'harus diam sebelum batas waktu');
  }
});

test('redaman 1 tidak melewati target', () => {
  const { puncak } = jalankan({ redaman: 1, respons: 0.35 });
  assert.ok(puncak <= 100.01, `puncak ${puncak}`);
});

test('redaman di bawah 1 melewati target, dan makin kecil makin jauh', () => {
  const sedang = jalankan({ redaman: 0.65, respons: 0.38 }).puncak;
  const pantul = jalankan({ redaman: 0.45, respons: 0.38 }).puncak;
  assert.ok(sedang > 100.5, `puncak ${sedang}`);
  assert.ok(pantul > sedang, `${pantul} harus lebih dari ${sedang}`);
});

test('respons lebih kecil sampai lebih cepat', () => {
  const gesit = jalankan({ redaman: 1, respons: 0.2 }).waktu;
  const lambat = jalankan({ redaman: 1, respons: 0.6 }).waktu;
  assert.ok(gesit < lambat, `${gesit} harus kurang dari ${lambat}`);
});

test('kecepatan awal terbawa ke gerakan', () => {
  const pegas = G.buatPegas({ redaman: 1, respons: 0.4 });
  const diam = { nilai: 0, kec: 0, target: 100 };
  const lempar = { nilai: 0, kec: 800, target: 100 };
  G.majukan(pegas, diam, 0.05);
  G.majukan(pegas, lempar, 0.05);
  assert.ok(lempar.nilai > diam.nilai + 10, `${lempar.nilai} vs ${diam.nilai}`);
});

test('pegas tetap stabil dengan dt besar', () => {
  const pegas = G.buatPegas({ redaman: 0.45, respons: 0.14 });
  const k = { nilai: 0, kec: 0, target: 1 };
  for (let i = 0; i < 300; i++) G.majukan(pegas, k, 1 / 30);
  assert.ok(Math.abs(k.nilai - 1) < 0.01, `nilai ${k.nilai}`);
});

test('proyeksi memakai rumus Apple', () => {
  assert.equal(G.proyeksi(0), 0);
  assert.ok(Math.abs(G.proyeksi(1000, 0.99) - 99) < 1e-9);
  assert.ok(Math.abs(G.proyeksi(1000, 0.998) - 499) < 1e-9);
  assert.equal(G.proyeksi(-500, 0.99), -G.proyeksi(500, 0.99));
});

test('karet selalu kurang dari jarak lewat, dan terbatas', () => {
  const dekat = G.karet(20, 400);
  const jauh = G.karet(4000, 400);
  assert.ok(dekat > 0 && dekat < 20);
  assert.ok(jauh > dekat);
  assert.ok(jauh < 400 * 0.55 * 2);
  assert.equal(G.karet(-20, 400), -dekat);
});

test('kecepatan dihitung dari sampel terakhir', () => {
  const riwayat = [
    { x: 0, y: 0, t: 0 },
    { x: 100, y: 50, t: 200 },
    { x: 110, y: 60, t: 250 },
    { x: 120, y: 70, t: 300 },
  ];
  const v = G.kecepatan(riwayat, 300);
  assert.equal(v.x, 200);
  assert.equal(v.y, 200);
});

test('kecepatan nol kalau jari sudah diam sebelum diangkat atau sampel kurang', () => {
  const riwayat = [{ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 50 }];
  assert.deepEqual(G.kecepatan(riwayat, 500), { x: 0, y: 0 });
  assert.deepEqual(G.kecepatan([{ x: 5, y: 5, t: 0 }], 0), { x: 0, y: 0 });
});

test('kurva CSS berawal di 0, berakhir di 1, dan memantul kalau redaman di bawah 1', () => {
  const { kurva, durasiMs } = G.kurvaCss({ redaman: 0.5, respons: 0.25 });
  const titik = kurva.slice('linear('.length, -1).split(', ').map(Number);
  assert.equal(titik[0], 0);
  assert.equal(titik[titik.length - 1], 1);
  assert.ok(Math.max(...titik) > 1, 'harus melewati 1');
  assert.ok(durasiMs > 0 && durasiMs < 3000, `durasi ${durasiMs}`);
});
