// Jalankan: node --test tes/
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../public/logika.js');

// Acak yang bisa diulang: hasil sama untuk benih yang sama.
function rngBenih(benih) {
  let a = benih >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const kartu = (bentuk, warna, jumlah, isian) => ({ bentuk, warna, jumlah, isian });

function semuaId(s) {
  return [...s.meja, ...s.dek, ...s.buangan].map((k) => k.id).sort((a, b) => a - b);
}

// Meja 12 kartu tanpa satu pun rasi, dicari dengan cara serakah.
function mejaTanpaRasi() {
  for (let benih = 1; benih < 500; benih++) {
    const acak = L.acak(L.buatDek(), rngBenih(benih));
    const meja = [];
    for (const k of acak) {
      if (meja.length === 12) break;
      let aman = true;
      for (let i = 0; i < meja.length && aman; i++)
        for (let j = i + 1; j < meja.length; j++)
          if (L.cekTiga(meja[i], meja[j], k)) { aman = false; break; }
      if (aman) meja.push(k);
    }
    if (meja.length === 12) return { meja, sisa: acak.filter((k) => !meja.includes(k)) };
  }
  throw new Error('meja tanpa rasi tidak ketemu');
}

test('dek berisi 81 kartu unik dengan 4 sifat bernilai 0-2', () => {
  const dek = L.buatDek();
  assert.equal(dek.length, 81);
  assert.equal(new Set(dek.map((k) => k.id)).size, 81);
  assert.equal(new Set(dek.map((k) => L.SIFAT.map((s) => k[s]).join())).size, 81);
  for (const k of dek) for (const s of L.SIFAT) assert.ok([0, 1, 2].includes(k[s]));
});

test('cekTiga: semua sama atau semua beda dihitung rasi', () => {
  assert.ok(L.cekTiga(kartu(0, 0, 0, 0), kartu(0, 0, 1, 0), kartu(0, 0, 2, 0)));
  assert.ok(L.cekTiga(kartu(0, 0, 0, 0), kartu(1, 1, 1, 1), kartu(2, 2, 2, 2)));
  assert.ok(L.cekTiga(kartu(1, 2, 0, 1), kartu(1, 2, 0, 1), kartu(1, 2, 0, 1)) === true);
});

test('cekTiga: dua sama satu beda bukan rasi, dan sifatGagal menyebutnya', () => {
  const a = kartu(2, 0, 0, 1);
  const b = kartu(2, 0, 1, 1);
  const c = kartu(2, 2, 2, 1);
  assert.equal(L.cekTiga(a, b, c), false);
  assert.deepEqual(L.sifatGagal(a, b, c), ['warna']);
});

test('dua kartu pasti punya tepat satu pelengkap yang membentuk rasi', () => {
  const dek = L.buatDek();
  const a = dek[5];
  const b = dek[40];
  assert.equal(dek.filter((c) => c !== a && c !== b && L.cekTiga(a, b, c)).length, 1);
});

test('cariTiga mengembalikan indeks rasi, atau null kalau tidak ada', () => {
  const ada = [kartu(0, 0, 0, 0), kartu(1, 0, 0, 0), kartu(2, 0, 0, 0), kartu(0, 1, 0, 0)];
  assert.deepEqual(L.cariTiga(ada), [0, 1, 2]);
  const { meja } = mejaTanpaRasi();
  assert.equal(L.cariTiga(meja), null);
});

test('permainan baru: meja 12 kartu, ada rasi, skor 0, fase rebutan', () => {
  for (let benih = 1; benih <= 50; benih++) {
    const s = L.buatPermainan(rngBenih(benih));
    assert.equal(s.meja.length, L.UKURAN_MEJA);
    assert.notEqual(L.cariTiga(s.meja), null);
    assert.deepEqual(s.skor, [0, 0]);
    assert.equal(s.fase, 'rebutan');
    assert.equal(semuaId(s).length, 81);
    assert.equal(new Set(semuaId(s)).size, 81);
  }
});

test('acak dengan benih yang sama menghasilkan urutan yang sama', () => {
  const a = L.buatPermainan(rngBenih(7)).meja.map((k) => k.id);
  const b = L.buatPermainan(rngBenih(7)).meja.map((k) => k.id);
  assert.deepEqual(a, b);
});

test('hanya penekan pertama yang mengunci ronde', () => {
  const s = L.buatPermainan(rngBenih(1));
  assert.equal(L.tekanTombol(s, 1), true);
  assert.equal(s.aktif, 1);
  assert.equal(L.tekanTombol(s, 0), false);
  assert.equal(s.aktif, 1);
});

test('hanya pemain aktif yang bisa memilih kartu, dan indeks buruk ditolak', () => {
  const s = L.buatPermainan(rngBenih(1));
  assert.equal(L.pilihKartu(s, 0, 0), null); // belum ada yang menekan
  L.tekanTombol(s, 0);
  assert.equal(L.pilihKartu(s, 1, 0), null);
  assert.equal(L.pilihKartu(s, 0, -1), null);
  assert.equal(L.pilihKartu(s, 0, 12), null);
  assert.equal(L.pilihKartu(s, 0, 1.5), null);
});

test('memilih kartu yang sama dua kali membatalkannya', () => {
  const s = L.buatPermainan(rngBenih(1));
  L.tekanTombol(s, 0);
  L.pilihKartu(s, 0, 3);
  assert.deepEqual(s.pilihan, [3]);
  L.pilihKartu(s, 0, 3);
  assert.deepEqual(s.pilihan, []);
});

test('rasi benar: pemilih +1, meja berganti 3 kartu, ada rasi lagi', () => {
  const s = L.buatPermainan(rngBenih(3));
  const rasi = L.cariTiga(s.meja);
  L.tekanTombol(s, 0);
  L.pilihKartu(s, 0, rasi[0]);
  L.pilihKartu(s, 0, rasi[1]);
  const r = L.pilihKartu(s, 0, rasi[2]);
  assert.equal(r.selesai, true);
  assert.equal(r.hasil.jenis, 'benar');
  assert.deepEqual(s.skor, [1, 0]);

  const lama = s.meja.map((k) => k.id);
  L.lanjutRonde(s);
  const berubah = s.meja.map((k, i) => k.id !== lama[i]);
  assert.equal(berubah.filter(Boolean).length, 3);
  assert.deepEqual(rasi.sort(), berubah.map((b, i) => (b ? i : -1)).filter((i) => i >= 0).sort());
  assert.notEqual(L.cariTiga(s.meja), null);
  assert.equal(s.fase, 'rebutan');
  assert.equal(new Set(semuaId(s)).size, 81);
});

test('rasi salah: lawan +1, sifat gagal disebut, meja tidak berubah', () => {
  const s = L.buatPermainan(rngBenih(4));
  // Cari tiga kartu yang bukan rasi.
  let tiga = null;
  for (let i = 0; i < 12 && !tiga; i++)
    for (let j = i + 1; j < 12 && !tiga; j++)
      for (let k = j + 1; k < 12; k++)
        if (!L.cekTiga(s.meja[i], s.meja[j], s.meja[k])) { tiga = [i, j, k]; break; }
  L.tekanTombol(s, 0);
  tiga.forEach((i) => L.pilihKartu(s, 0, i));
  assert.equal(s.hasil.jenis, 'salah');
  assert.ok(s.hasil.gagal.length > 0);
  assert.deepEqual(s.skor, [0, 1]);
  const lama = s.meja.map((k) => k.id);
  L.lanjutRonde(s);
  assert.notDeepEqual(s.meja.map((k) => k.id), lama);
  assert.equal(s.meja.length, L.UKURAN_MEJA);
  assert.equal(s.penukaran, 'kocok');
  assert.equal(new Set(semuaId(s)).size, 81);
  assert.notEqual(L.cariTiga(s.meja), null);
  assert.deepEqual(s.skor, [0, 1]);
  assert.equal(s.fase, 'rebutan');
});

test('waktu habis: kartu juga dikocok, karena rasinya sudah ditunjukkan', () => {
  const s = L.buatPermainan(rngBenih(5));
  L.tekanTombol(s, 0);
  L.waktuHabis(s);
  const lama = s.meja.map((k) => k.id);
  L.lanjutRonde(s);
  assert.notDeepEqual(s.meja.map((k) => k.id), lama);
  assert.equal(s.penukaran, 'kocok');
  assert.equal(new Set(semuaId(s)).size, 81);
});

test('kocok berulang tidak menghilangkan kartu, termasuk kartu di buangan', () => {
  const s = L.buatPermainan(rngBenih(14));
  for (let ronde = 0; ronde < 300; ronde++) {
    s.skor = [0, 0];
    s.pemenang = null;
    L.tekanTombol(s, 0);
    if (ronde % 3 === 0) L.cariTiga(s.meja).forEach((i) => L.pilihKartu(s, 0, i));
    else L.waktuHabis(s);
    L.lanjutRonde(s);
    assert.equal(s.meja.length, 12);
    assert.equal(new Set(semuaId(s)).size, 81);
    assert.notEqual(L.cariTiga(s.meja), null);
  }
});

test('menang karena lawan salah: meja tidak dikocok lagi', () => {
  const s = L.buatPermainan(rngBenih(5));
  s.skor = [0, L.SKOR_MENANG - 1];
  L.tekanTombol(s, 0);
  L.waktuHabis(s);
  const lama = s.meja.map((k) => k.id);
  L.lanjutRonde(s);
  assert.equal(s.fase, 'selesai');
  assert.deepEqual(s.meja.map((k) => k.id), lama);
});

test('waktu habis: lawan +1, dan hanya berlaku saat memilih', () => {
  const s = L.buatPermainan(rngBenih(5));
  assert.equal(L.waktuHabis(s), null);
  L.tekanTombol(s, 1);
  const h = L.waktuHabis(s);
  assert.equal(h.jenis, 'waktu');
  assert.deepEqual(s.skor, [1, 0]);
});

test('pemain pertama mencapai 5 poin menang, lalu fase selesai', () => {
  const s = L.buatPermainan(rngBenih(6));
  for (let ronde = 0; ronde < L.SKOR_MENANG; ronde++) {
    assert.equal(s.pemenang, null);
    L.tekanTombol(s, 0);
    const rasi = L.cariTiga(s.meja);
    rasi.forEach((i) => L.pilihKartu(s, 0, i));
    L.lanjutRonde(s);
  }
  assert.equal(s.pemenang, 0);
  assert.equal(s.fase, 'selesai');
  assert.equal(L.lanjutRonde(s), false);
});

test('lanjutRonde ditolak di luar fase hasil', () => {
  const s = L.buatPermainan(rngBenih(1));
  assert.equal(L.lanjutRonde(s), false);
});

test('permainan panjang tidak menghilangkan atau menggandakan kartu', () => {
  const s = L.buatPermainan(rngBenih(11));
  for (let ronde = 0; ronde < 200; ronde++) {
    if (s.fase === 'selesai') break;
    L.tekanTombol(s, ronde % 2);
    L.cariTiga(s.meja).forEach((i) => L.pilihKartu(s, s.aktif, i));
    L.lanjutRonde(s);
    assert.equal(new Set(semuaId(s)).size, 81);
    assert.equal(s.meja.length, 12);
    if (s.fase === 'rebutan') assert.notEqual(L.cariTiga(s.meja), null);
  }
});

test('meja tanpa rasi ditukar otomatis dan ditandai (G-04)', () => {
  const { meja, sisa } = mejaTanpaRasi();
  const s = L.buatPermainan(rngBenih(9));
  s.meja = meja;
  s.dek = sisa;
  s.buangan = [];
  s.fase = 'hasil';
  s.hasil = { jenis: 'benar', pencetak: 1, gagal: [] };
  s.pilihan = [];
  L.lanjutRonde(s);
  assert.equal(s.penukaran, 'otomatis');
  assert.notEqual(L.cariTiga(s.meja), null);
  assert.equal(new Set(semuaId(s)).size, 81);
});

test('meja yang sudah punya rasi tidak ditandai ditukar', () => {
  const s = L.buatPermainan(rngBenih(2));
  s.fase = 'hasil';
  s.hasil = { jenis: 'benar', pencetak: 1, gagal: [] };
  s.pilihan = [];
  L.lanjutRonde(s);
  assert.equal(s.penukaran, null);
});

test('tukar kartu bersama: baru terjadi kalau kedua pemain setuju (G-01)', () => {
  const s = L.buatPermainan(rngBenih(8));
  const lama = s.meja.map((k) => k.id);
  assert.deepEqual(L.tukarKartu(s, 0), { ditukar: false });
  assert.deepEqual(s.meja.map((k) => k.id), lama);
  assert.deepEqual(s.setuju, [true, false]);

  assert.deepEqual(L.tukarKartu(s, 1), { ditukar: true });
  const berubah = s.meja.filter((k, i) => k.id !== lama[i]).length;
  assert.ok(berubah >= 1 && berubah <= 3);
  assert.deepEqual(s.setuju, [false, false]);
  assert.equal(s.penukaran, 'bersama');
  assert.deepEqual(s.skor, [0, 0]);
  assert.notEqual(L.cariTiga(s.meja), null);
  assert.equal(new Set(semuaId(s)).size, 81);
});

test('tukar kartu: pemain bisa membatalkan persetujuannya', () => {
  const s = L.buatPermainan(rngBenih(8));
  const lama = s.meja.map((k) => k.id);
  L.tukarKartu(s, 0);
  L.tukarKartu(s, 0); // batal
  assert.deepEqual(s.setuju, [false, false]);
  assert.deepEqual(L.tukarKartu(s, 1), { ditukar: false });
  assert.deepEqual(s.meja.map((k) => k.id), lama);
});

test('tukar kartu ditolak di luar fase rebutan atau untuk pemain tidak sah', () => {
  const s = L.buatPermainan(rngBenih(8));
  assert.equal(L.tukarKartu(s, 2), null);
  assert.equal(L.tukarKartu(s, -1), null);
  L.tekanTombol(s, 0);
  assert.equal(L.tukarKartu(s, 1), null);
});

test('menekan RASI! menghapus persetujuan tukar yang menggantung', () => {
  const s = L.buatPermainan(rngBenih(8));
  L.tukarKartu(s, 0);
  L.tekanTombol(s, 1);
  assert.deepEqual(s.setuju, [false, false]);
  L.waktuHabis(s);
  L.lanjutRonde(s);
  assert.deepEqual(s.setuju, [false, false]);
  assert.equal(s.fase, 'rebutan');
});
