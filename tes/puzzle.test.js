const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../public/logika.js');
const P = require('../public/puzzle.js');
const LEVEL = require('../public/level.js');

const id = (bentuk, warna, jumlah, isian) => bentuk * 27 + warna * 9 + jumlah * 3 + isian;

// Pola SETDOKU: baris sewarna, kolom sebentuk, isian berbeda.
const PAPAN_POLA = [
  id(0, 0, 0, 0), id(1, 0, 0, 1), id(2, 0, 0, 2),
  id(0, 1, 0, 1), id(1, 1, 0, 2), id(2, 1, 0, 0),
  id(0, 2, 0, 2), id(1, 2, 0, 0), id(2, 2, 0, 1),
];

function puzzleDari(solusi, petunjuk, pengecoh = []) {
  return {
    papan: solusi.map((k, i) => (petunjuk.includes(i) ? k : null)),
    tersedia: [...solusi.filter((_, i) => !petunjuk.includes(i)), ...pengecoh],
  };
}

test('id kartu sama dengan posisinya di dek', () => {
  P.DEK.forEach((k, i) => {
    assert.equal(k.id, i);
    assert.equal(id(k.bentuk, k.warna, k.jumlah, k.isian), i);
  });
});

test('pelengkap selalu membentuk rasi dan berbeda dari kedua kartu', () => {
  for (let a = 0; a < 81; a++) {
    for (let b = 0; b < 81; b++) {
      if (a === b) continue;
      const c = P.pelengkap(a, b);
      assert.ok(c !== a && c !== b);
      assert.ok(P.adalahRasi(a, b, c));
    }
  }
});

test('S-01: papan pola SETDOKU benar, dan keenam garisnya lolos cekTiga', () => {
  assert.equal(P.papanBenar(PAPAN_POLA), true);
  for (const g of P.GARIS) {
    assert.ok(L.cekTiga(...g.map((i) => P.DEK[PAPAN_POLA[i]])));
  }
});

test('papan belum penuh atau berisi kartu kembar tidak dianggap benar', () => {
  const belum = PAPAN_POLA.slice();
  belum[4] = null;
  assert.equal(P.papanBenar(belum), false);
  const kembar = PAPAN_POLA.slice();
  kembar[4] = kembar[0];
  assert.equal(P.papanBenar(kembar), false);
});

test('garisGagal menyebut garis dan sifat yang salah, dan melewati garis belum penuh', () => {
  const salah = PAPAN_POLA.slice();
  [salah[0], salah[1]] = [salah[1], salah[0]]; // bentuk dan isian baris 1 tetap, kolom 1 dan 2 rusak
  const gagal = P.garisGagal(salah);
  assert.deepEqual(gagal.map((g) => g.nama), ['Kolom 1', 'Kolom 2']);
  assert.ok(gagal[0].sifat.includes('bentuk'));

  const belum = PAPAN_POLA.slice();
  belum[0] = null;
  assert.deepEqual(P.garisGagal(belum), []);
});

test('G-11: dua baris sewarna dengan baris ketiga berbeda ditolak aturan rasi', () => {
  const papan = [
    id(0, 0, 0, 0), id(1, 0, 0, 1), id(2, 0, 0, 2),
    id(0, 0, 0, 1), id(1, 0, 0, 2), id(2, 0, 0, 0),
    id(0, 2, 0, 2), id(1, 2, 0, 0), id(2, 2, 0, 1),
  ];
  const gagal = P.garisGagal(papan);
  assert.equal(gagal.length, 3);
  for (const g of gagal) assert.deepEqual(g.sifat, ['warna']);
});

test('S-02: pemeriksa mengenali puzzle dengan satu solusi', () => {
  const p = puzzleDari(PAPAN_POLA, [0, 1, 3, 4]);
  assert.equal(P.hitungSolusi(p), 1);
  assert.deepEqual(P.cariSolusi(p)[0], PAPAN_POLA);
});

test('S-02: dua petunjuk tidak pernah menghasilkan satu solusi', () => {
  for (let a = 0; a < 9; a++) {
    for (let b = a + 1; b < 9; b++) {
      assert.ok(P.hitungSolusi(puzzleDari(PAPAN_POLA, [a, b])) >= 2);
    }
  }
});

test('S-02: tiga petunjuk diagonal selalu punya solusi cerminan', () => {
  assert.ok(P.hitungSolusi(puzzleDari(PAPAN_POLA, [0, 4, 8])) >= 2);
});

test('S-02: petunjuk yang saling bertentangan tidak punya solusi', () => {
  const p = puzzleDari(PAPAN_POLA, [0, 1, 2]);
  [p.papan[0], p.papan[1]] = [id(0, 0, 0, 0), id(0, 1, 1, 1)]; // baris 1 tidak bisa jadi rasi
  assert.equal(P.hitungSolusi(p), 0);
});

test('batas pencarian dihormati', () => {
  const p = puzzleDari(PAPAN_POLA, []);
  assert.equal(P.hitungSolusi(p, 5), 5);
});

test('S-03: rantai pelengkap diukur sebagai tingkat 1', () => {
  const r = P.ukurPenalaran(puzzleDari(PAPAN_POLA, [0, 1, 3, 4]));
  assert.equal(r.selesai, true);
  assert.equal(r.tingkat, 1);
  assert.equal(r.pelengkap, 5);
  assert.equal(r.skor, 5);
});

test('S-03: tiga petunjuk butuh mencoret calon (tingkat 2)', () => {
  const p = puzzleDari(PAPAN_POLA, [0, 1, 3]);
  assert.equal(P.hitungSolusi(p), 1);
  const r = P.ukurPenalaran(p);
  assert.equal(r.selesai, true);
  assert.equal(r.tingkat, 2);
  assert.ok(r.eliminasi >= 1);
  assert.ok(r.skor > 5);
});

test('S-03: puzzle yang tidak unik tidak bisa diselesaikan tanpa menebak', () => {
  assert.equal(P.ukurPenalaran(puzzleDari(PAPAN_POLA, [0, 4, 8])).selesai, false);
});

test('sesi: kartu dipilih, ditaruh, dan diambil lagi', () => {
  const p = puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]);
  const s = P.mulaiSesi(p);
  const kartu = PAPAN_POLA[7];

  assert.equal(P.tekanSlot(s, 7), false); // belum ada kartu terpilih
  assert.equal(P.tekanKartu(s, kartu), true);
  assert.equal(s.terpilih, kartu);
  assert.equal(P.tekanKartu(s, kartu), true); // tekan lagi membatalkan
  assert.equal(s.terpilih, null);

  P.tekanKartu(s, kartu);
  assert.equal(P.tekanSlot(s, 7), true);
  assert.equal(s.papan[7], kartu);
  assert.equal(s.terpilih, null);
  assert.equal(P.kartuDipakai(s, kartu), true);
  assert.equal(P.tekanKartu(s, kartu), false); // sudah terpasang

  assert.equal(P.tekanSlot(s, 7), true); // ambil lagi
  assert.equal(s.papan[7], null);
  assert.equal(P.kartuDipakai(s, kartu), false);
});

test('sesi: petunjuk tidak bisa diubah, dan kartu asing ditolak', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  P.tekanKartu(s, PAPAN_POLA[7]);
  assert.equal(P.tekanSlot(s, 0), false);
  assert.equal(s.papan[0], PAPAN_POLA[0]);
  assert.equal(P.tekanKartu(s, PAPAN_POLA[0]), false);
});

test('sesi: menaruh di slot terisi mengganti, dan kartu lama kembali tersedia', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  const [a, b] = [PAPAN_POLA[7], PAPAN_POLA[8]];
  P.tekanKartu(s, a);
  P.tekanSlot(s, 7);
  P.tekanKartu(s, b);
  P.tekanSlot(s, 7);
  assert.equal(s.papan[7], b);
  assert.equal(P.kartuDipakai(s, a), false);
});

test('sesi: kunci ditolak kalau papan belum penuh', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  assert.equal(P.kunci(s), null);
  assert.equal(s.kunciSalah, 0);
});

test('S-05: kunci salah menyebut garis, dihitung, dan hilang saat papan berubah', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  P.tekanKartu(s, PAPAN_POLA[8]);
  P.tekanSlot(s, 7);
  P.tekanKartu(s, PAPAN_POLA[7]);
  P.tekanSlot(s, 8);
  const r = P.kunci(s);
  assert.equal(r.benar, false);
  assert.ok(r.gagal.some((g) => g.nama === 'Baris 3' || g.nama === 'Kolom 2'));
  assert.equal(s.kunciSalah, 1);
  assert.equal(s.selesai, false);

  P.tekanSlot(s, 7);
  assert.deepEqual(s.gagal, []);
});

test('sesi: kunci benar menyelesaikan puzzle dan mengunci papan', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  P.tekanKartu(s, PAPAN_POLA[7]);
  P.tekanSlot(s, 7);
  P.tekanKartu(s, PAPAN_POLA[8]);
  P.tekanSlot(s, 8);
  assert.deepEqual(P.kunci(s), { benar: true, gagal: [] });
  assert.equal(s.selesai, true);
  assert.equal(P.tekanSlot(s, 7), false);
  assert.equal(P.kosongkan(s), false);
  assert.equal(P.kunci(s), null);
});

test('seret: taruhKartu menaruh kartu, dan kartu lama kembali tersedia', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  const [a, b] = [PAPAN_POLA[7], PAPAN_POLA[8]];
  s.terpilih = b;
  assert.equal(P.taruhKartu(s, a, 7), true);
  assert.equal(s.papan[7], a);
  assert.equal(s.terpilih, null);

  assert.equal(P.taruhKartu(s, a, 8), false); // sudah terpasang
  assert.equal(P.taruhKartu(s, b, 7), true); // mengganti
  assert.equal(s.papan[7], b);
  assert.equal(P.kartuDipakai(s, a), false);
});

test('seret: taruhKartu menolak petunjuk, kartu asing, dan slot di luar papan', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  assert.equal(P.taruhKartu(s, PAPAN_POLA[7], 0), false);
  assert.equal(s.papan[0], PAPAN_POLA[0]);
  assert.equal(P.taruhKartu(s, PAPAN_POLA[0], 7), false);
  assert.equal(P.taruhKartu(s, PAPAN_POLA[7], 9), false);
  assert.equal(s.papan.length, 9);
});

test('seret: pindahKartu memindahkan ke slot kosong dan menukar dengan slot terisi', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5]));
  const [a, b] = [PAPAN_POLA[6], PAPAN_POLA[7]];
  P.taruhKartu(s, a, 6);
  assert.equal(P.pindahKartu(s, 6, 7), true);
  assert.equal(s.papan[6], null);
  assert.equal(s.papan[7], a);

  P.taruhKartu(s, b, 6);
  assert.equal(P.pindahKartu(s, 6, 7), true);
  assert.equal(s.papan[6], a);
  assert.equal(s.papan[7], b);
});

test('seret: pindahKartu menolak petunjuk, slot kosong, dan slot yang sama', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5]));
  P.taruhKartu(s, PAPAN_POLA[6], 6);
  assert.equal(P.pindahKartu(s, 6, 0), false); // tujuan petunjuk
  assert.equal(P.pindahKartu(s, 0, 7), false); // asal petunjuk
  assert.equal(P.pindahKartu(s, 7, 8), false); // asal kosong
  assert.equal(P.pindahKartu(s, 6, 6), false);
  assert.equal(s.papan[6], PAPAN_POLA[6]);
  assert.equal(s.papan[0], PAPAN_POLA[0]);
});

test('seret: ambilKartu mengembalikan kartu, dan menolak petunjuk serta slot kosong', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  const kartu = PAPAN_POLA[7];
  assert.equal(P.ambilKartu(s, 7), false);
  assert.equal(P.ambilKartu(s, 0), false);
  P.taruhKartu(s, kartu, 7);
  assert.equal(P.ambilKartu(s, 7), true);
  assert.equal(s.papan[7], null);
  assert.equal(P.kartuDipakai(s, kartu), false);
});

test('seret: perubahan menghapus pesan gagal, dan sesi selesai menolak semuanya', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  P.taruhKartu(s, PAPAN_POLA[8], 7);
  P.taruhKartu(s, PAPAN_POLA[7], 8);
  P.kunci(s);
  assert.ok(s.gagal.length > 0);
  assert.equal(P.pindahKartu(s, 7, 8), true);
  assert.deepEqual(s.gagal, []);

  assert.deepEqual(P.kunci(s), { benar: true, gagal: [] });
  assert.equal(P.taruhKartu(s, PAPAN_POLA[7], 7), false);
  assert.equal(P.pindahKartu(s, 7, 8), false);
  assert.equal(P.ambilKartu(s, 7), false);
});

test('Hint: memasang kartu yang benar, mengunci slotnya, dan mendahulukan slot kosong', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5]));
  P.taruhKartu(s, PAPAN_POLA[7], 6); // salah tempat, slot 7 masih kosong
  const r = P.bukaPetunjuk(s);
  assert.deepEqual(r, { slot: 7, id: PAPAN_POLA[7] });
  assert.equal(s.papan[7], PAPAN_POLA[7]);
  assert.equal(s.tetap[7], true);
  assert.equal(s.papan[6], null, 'kartu yang sama dilepas dari slot lamanya');
  assert.equal(P.ambilKartu(s, 7), false);
  assert.equal(P.taruhKartu(s, PAPAN_POLA[8], 7), false);
});

test('Hint: memperbaiki slot yang salah kalau tidak ada yang kosong, dan kartu lama kembali', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  P.taruhKartu(s, PAPAN_POLA[8], 7);
  P.taruhKartu(s, PAPAN_POLA[7], 8);
  const r = P.bukaPetunjuk(s);
  // Slot 7 dibetulkan: kartu benarnya dipindah dari slot 8, dan kartu salah kembali tersedia.
  assert.deepEqual(r, { slot: 7, id: PAPAN_POLA[7] });
  assert.equal(s.tetap[7], true);
  assert.equal(s.papan[8], null);
  assert.equal(P.kartuDipakai(s, PAPAN_POLA[8]), false);

  // Hint berikutnya mengisi slot 8 yang kosong.
  assert.deepEqual(P.bukaPetunjuk(s), { slot: 8, id: PAPAN_POLA[8] });
  assert.equal(P.bukaPetunjuk(s), false);
});

test('Hint: tidak ada yang dibuka kalau papan sudah benar atau sesi selesai', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  P.taruhKartu(s, PAPAN_POLA[7], 7);
  P.taruhKartu(s, PAPAN_POLA[8], 8);
  assert.equal(P.bukaPetunjuk(s), false);
  P.kunci(s);
  assert.equal(P.bukaPetunjuk(s), false);
});

test('Hint: pada semua puzzle Practice dan Ranked, setiap Hint cocok dengan solusi dan akhirnya menyelesaikan papan', () => {
  for (const l of LEVEL) {
    for (const [jenis, puzzle] of [['Practice', l.practice], ['Ranked', l.ranked]]) {
      const nama = `Level ${l.level} ${jenis}`;
      const kunciJawaban = P.cariSolusi(puzzle, 2)[0];
      const s = P.mulaiSesi(puzzle);
      let panggilan = 0;
      for (let r = P.bukaPetunjuk(s); r; r = P.bukaPetunjuk(s)) {
        assert.equal(r.id, kunciJawaban[r.slot], nama);
        assert.equal(s.tetap[r.slot], true, nama);
        assert.ok(++panggilan <= 9, `${nama}: tidak berhenti`);
      }
      assert.deepEqual(s.papan, kunciJawaban, nama);
      assert.deepEqual(P.kunci(s), { benar: true, gagal: [] }, nama);
    }
  }
});

test('Hint: benar dari slot mana pun Hint pertama dibuka, dan solusinya tanpa kartu kembar', () => {
  for (const l of LEVEL) {
    for (const puzzle of [l.practice, l.ranked]) {
      const kunciJawaban = P.cariSolusi(puzzle, 2)[0];
      puzzle.papan.forEach((k, awal) => {
        if (k !== null) return;
        const s = P.mulaiSesi(puzzle);
        // Seolah Hint sebelumnya sudah membuka slot ini.
        s.papan[awal] = kunciJawaban[awal];
        s.tetap[awal] = true;
        for (let r = P.bukaPetunjuk(s); r; r = P.bukaPetunjuk(s)) {
          assert.equal(r.id, kunciJawaban[r.slot], `Level ${l.level}, mulai dari slot ${awal}`);
        }
        assert.deepEqual(s.papan, kunciJawaban, `Level ${l.level}, mulai dari slot ${awal}`);
        assert.equal(new Set(s.papan).size, 9, `Level ${l.level}: kartu kembar`);
      });
    }
  }
});

test('Hint: tetap benar walau pemain sudah menaruh kartu salah di banyak slot', () => {
  for (const l of LEVEL.filter((x) => x.level >= 14)) {
    const kunciJawaban = P.cariSolusi(l.ranked, 2)[0];
    const s = P.mulaiSesi(l.ranked);
    const kosong = s.papan.flatMap((k, i) => (k === null ? [i] : []));
    const urut = s.tersedia.filter((id) => !kosong.some((i) => kunciJawaban[i] === id)).concat(
      kosong.map((i) => kunciJawaban[i]).reverse(),
    );
    kosong.forEach((slot, n) => P.taruhKartu(s, urut[n], slot));
    const r = P.bukaPetunjuk(s);
    assert.ok(r === false || r.id === kunciJawaban[r.slot], `Level ${l.level}`);
  }
});

test('akhiriSesi mengunci papan tanpa dianggap menang', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  P.tekanKartu(s, PAPAN_POLA[7]);
  P.akhiriSesi(s);
  assert.equal(s.selesai, true);
  assert.equal(s.kalah, true);
  assert.equal(s.terpilih, null);
  assert.equal(P.taruhKartu(s, PAPAN_POLA[7], 7), false);
  assert.equal(P.bukaPetunjuk(s), false);
  assert.equal(P.kunci(s), null);
});

test('kunci benar tidak menandai sesi sebagai kalah', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  P.taruhKartu(s, PAPAN_POLA[7], 7);
  P.taruhKartu(s, PAPAN_POLA[8], 8);
  P.kunci(s);
  assert.equal(s.selesai, true);
  assert.equal(s.kalah, false);
});

test('Kartu Tersembunyi: kartu tertutup tidak bisa dipilih atau ditaruh', () => {
  const p = puzzleDari(PAPAN_POLA, [0, 1, 3, 4]);
  p.tutup = [PAPAN_POLA[8]];
  const s = P.mulaiSesi(p);
  assert.equal(P.kartuTertutup(s, PAPAN_POLA[8]), true);
  assert.equal(P.kartuTertutup(s, PAPAN_POLA[2]), false);
  assert.equal(P.tekanKartu(s, PAPAN_POLA[8]), false);
  assert.equal(P.taruhKartu(s, PAPAN_POLA[8], 8), false);
  assert.equal(s.papan[8], null);
});

test('Kartu Tersembunyi: membentuk rasi membuka kartu, dan kartu tetap terbuka', () => {
  const p = puzzleDari(PAPAN_POLA, [0, 1, 3, 4]);
  p.tutup = [PAPAN_POLA[8], PAPAN_POLA[7]];
  const s = P.mulaiSesi(p);
  P.taruhKartu(s, PAPAN_POLA[2], 2);
  assert.equal(s.terbuka, 1);
  assert.equal(P.kartuTertutup(s, PAPAN_POLA[8]), false);
  assert.equal(P.kartuTertutup(s, PAPAN_POLA[7]), true);
  assert.equal(P.ambilKartu(s, 2), true);
  assert.equal(P.kartuTertutup(s, PAPAN_POLA[8]), false, 'tetap terbuka walau kartunya diambil');
  assert.equal(P.kartuTertutup(s, PAPAN_POLA[7]), true);
});

test('Kartu Tersembunyi: garis penuh yang bukan rasi tidak membuka kartu', () => {
  const p = puzzleDari(PAPAN_POLA, [0, 1, 3, 4]);
  p.tutup = [PAPAN_POLA[8]];
  const s = P.mulaiSesi(p);
  P.taruhKartu(s, PAPAN_POLA[5], 2); // baris 1 penuh, tetapi bukan rasi
  assert.equal(s.terbuka, 0);
  assert.equal(P.kartuTertutup(s, PAPAN_POLA[8]), true);
});

test('Kartu Tersembunyi: Hint boleh memasang kartu tertutup', () => {
  const p = puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6, 7]);
  p.tutup = [PAPAN_POLA[8]];
  const s = P.mulaiSesi(p);
  s.terbuka = 0;
  assert.deepEqual(P.bukaPetunjuk(s), { slot: 8, id: PAPAN_POLA[8] });
  assert.equal(P.kartuTertutup(s, PAPAN_POLA[8]), false);
});

test('pemeriksa tertutup: menolak puzzle yang membuat pemain buntu', () => {
  const p = puzzleDari(PAPAN_POLA, [0, 1, 3, 4]);
  p.tutup = p.tersedia.slice(); // semua kartu tertutup, tidak ada yang bisa dipasang
  assert.equal(P.ukurTertutup(p).adil, false);
});

test('pemeriksa tertutup: menolak papan yang tidak bisa disimpulkan dari petunjuk', () => {
  const p = puzzleDari(PAPAN_POLA, [0, 1, 3]);
  p.tutup = [];
  assert.equal(P.ukurTertutup(p).adil, false);
});

test('pemeriksa tertutup: skor naik kalau kartu penting tertutup', () => {
  const p = puzzleDari(PAPAN_POLA, [0, 1, 3, 4]);
  p.tutup = [];
  const terbuka = P.ukurTertutup(p);
  p.tutup = [PAPAN_POLA[8]];
  const tertutup = P.ukurTertutup(p);
  assert.equal(terbuka.adil, true);
  assert.equal(tertutup.adil, true);
  assert.ok(tertutup.skor > terbuka.skor);
});

test('kosongkan hanya mengambil kartu pemain, bukan petunjuk', () => {
  const s = P.mulaiSesi(puzzleDari(PAPAN_POLA, [0, 1, 2, 3, 4, 5, 6]));
  P.tekanKartu(s, PAPAN_POLA[7]);
  P.tekanSlot(s, 7);
  P.kosongkan(s);
  assert.equal(s.papan[7], null);
  assert.equal(s.papan[0], PAPAN_POLA[0]);
});
