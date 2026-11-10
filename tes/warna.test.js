const test = require('node:test');
const assert = require('node:assert/strict');
const { selisihPalet, kontrasPalet, paletDariHalaman, skinDariHalaman } = require('../alat/warna.js');
const R = require('../public/progres.js');

const SELISIH_MINIMUM = 25;
const KONTRAS_MINIMUM = 3;

test('palet kartu terbaca dari halaman', () => {
  assert.deepEqual(paletDariHalaman().map((w) => w.nama), ['emas', 'biru es', 'koral']);
});

test('G-06: ketiga warna tetap berbeda di semua jenis buta warna', () => {
  for (const r of selisihPalet(paletDariHalaman())) {
    assert.ok(r.selisih >= SELISIH_MINIMUM, `${r.jenis}: ${r.a} vs ${r.b} = ${r.selisih.toFixed(1)}`);
  }
});

test('G-06: setiap warna terbaca di atas latar kartu', () => {
  for (const r of kontrasPalet(paletDariHalaman(), '#1d2350')) {
    assert.ok(r.kontras >= KONTRAS_MINIMUM, `${r.jenis}: ${r.nama} = ${r.kontras.toFixed(1)}`);
  }
});

test('Card Skin: daftar tampilan cocok dengan daftar di progres', () => {
  assert.deepEqual(skinDariHalaman().map((s) => s.id), R.SKIN);
});

test('skin dasar memakai warna kartu yang sudah lolos G-06', () => {
  const dasar = skinDariHalaman().find((s) => s.id === 'dasar');
  assert.equal(dasar.latar, '#1d2350');
  assert.equal(dasar.tepi, '#39417f');
});

test('G-06: setiap warna terbaca di semua skin, pada kartu biasa dan kartu petunjuk', () => {
  for (const s of skinDariHalaman()) {
    for (const [jenisKartu, latar] of [['biasa', s.latar], ['petunjuk', s.latarTetap]]) {
      for (const r of kontrasPalet(paletDariHalaman(), latar)) {
        assert.ok(r.kontras >= KONTRAS_MINIMUM, `${s.id} ${jenisKartu} ${latar}, ${r.jenis}: ${r.nama} = ${r.kontras.toFixed(2)}`);
      }
    }
  }
});
