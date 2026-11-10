// Kontras warna tema gelap dan terang, dibaca langsung dari CSS halaman.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function tokenDari(blok) {
  const hasil = {};
  for (const [, nama, nilai] of blok.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) hasil[nama] = nilai;
  return hasil;
}

const gelap = tokenDari(html.match(/:root \{([\s\S]*?)\n\}/)[1]);
const blokTerang = html.match(/:root\[data-tema="terang"\] \{([\s\S]*?)\}/)[1];
const blokTerangOtomatis = html.match(/:root:not\(\[data-tema="gelap"\]\) \{([\s\S]*?)\}/)[1];
const terang = { ...gelap, ...tokenDari(blokTerang) };

const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function luminansi(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function kontras(a, b) {
  const [t, r] = [luminansi(a), luminansi(b)].sort((x, y) => y - x);
  return (t + 0.05) / (r + 0.05);
}

// [teks, latar, minimum]. 4,5 untuk teks biasa, 3 untuk teks tebal besar dan garis penting.
const PASANGAN = [
  ['teks', 'malam', 4.5], ['teks', 'malam-2', 4.5], ['redup', 'malam', 4.5], ['redup', 'malam-2', 4.5],
  ['salah', 'malam-2', 4.5], ['salah', 'toast', 4.5], ['emas', 'toast', 4.5], ['info', 'toast', 4.5],
  ['teks-isi', 'malam', 4.5], ['benar', 'malam-2', 3], ['p1', 'malam', 3], ['p2', 'malam-2', 3],
];

for (const [nama, palet] of [['gelap', gelap], ['terang', terang]]) {
  test(`tema ${nama}: kontras teks memenuhi WCAG`, () => {
    for (const [a, b, min] of PASANGAN) {
      const k = kontras(palet[a], palet[b]);
      assert.ok(k >= min, `--${a} di atas --${b}: ${k.toFixed(2)}, minimal ${min}`);
    }
  });
}

test('tema terang: blok otomatis sama dengan blok pilihan pemain', () => {
  const rapikan = (s) => s.replace(/\s+/g, ' ').trim();
  assert.equal(rapikan(blokTerangOtomatis), rapikan(blokTerang));
});

test('tema terang mengganti setiap token warna antarmuka', () => {
  for (const nama of ['malam', 'malam-2', 'garis', 'teks', 'redup', 'toast', 'kaca', 'tirai', 'isi-slot', 'jalur', 'emas', 'info']) {
    assert.ok(new RegExp(`--${nama}:`).test(blokTerang), `--${nama}`);
  }
});

test('halaman memberi tahu browser bahwa temanya sudah diatur, supaya tidak dibalik paksa', () => {
  assert.match(html, /<meta name="color-scheme" content="dark light">/);
  assert.match(html, /color-scheme: dark;/);
  assert.match(html, /color-scheme: light;/);
});

test('di luar token, CSS tidak lagi memakai warna gelap antarmuka yang tertanam', () => {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/:root \{[\s\S]*?\n\}/, '');
  for (const warna of ['#070a1d', '#1a2048', '#151a3a', '#0a0d26', '#d6d9f3', '#68dcf3']) {
    assert.ok(!css.toLowerCase().includes(warna), `${warna} masih tertanam`);
  }
});
