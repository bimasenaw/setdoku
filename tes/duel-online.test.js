const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../public/duel-online.js');
const P = require('../public/puzzle.js');
const R = require('../public/progres.js');
const LEVEL = require('../public/level.js');

const T0 = 1_700_000_000_000;
const A = 'uid-tuan';
const B = 'uid-tamu';

// Pembangkit angka acak yang bisa diulang, supaya tes tidak bergantung pada keberuntungan.
function acakTetap(benih = 1) {
  let s = benih;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ATUR = { kesulitan: 'medium', target: 3, sistem: 'rebutan', rev: 0 };

function roomBaru(atur = {}) {
  return {
    v: D.VERSI,
    dibuat: T0,
    tuan: A,
    sidik: D.sidikKumpulan(LEVEL),
    atur: { ...ATUR, ...atur },
    pemain: { [A]: { nama: 'Tuan', tersambung: true } },
  };
}

function roomSiap(atur = {}) {
  const room = roomBaru(atur);
  room.tamu = B;
  room.pemain[B] = { nama: 'Tamu', tersambung: true };
  return room;
}

function roomMain(atur = {}, benih = 7) {
  const room = roomSiap(atur);
  room.pemain[A].siap = room.atur.rev;
  room.pemain[B].siap = room.atur.rev;
  room.mulaiPada = T0 + 60000;
  room.puzzle = D.pilihDaftarPuzzle(LEVEL, room.atur, acakTetap(benih));
  return room;
}

const DURASI = R.DURASI_MS.medium;
const daftarDari = (room) => D.ambilDaftarPuzzle(LEVEL, room);
const kawatBenar = (room, r) => D.solusi(daftarDari(room)[r]).slice();
// Papan dengan n slot isian yang benar, sisanya kosong.
function kawatSebagian(puzzle, n) {
  const kunci = D.solusi(puzzle);
  let sisa = n;
  return puzzle.papan.map((k, i) => {
    if (k !== null) return k;
    if (sisa > 0) { sisa -= 1; return kunci[i]; }
    return -1;
  });
}
function jawab(room, r, uid, pada, papan = kawatBenar(room, r)) {
  room.ronde = room.ronde || {};
  room.ronde[r] = room.ronde[r] || {};
  room.ronde[r][uid] = { papan, pada };
}

/* Username dan kode room */

test('username: dirapikan, dan ditolak kalau di luar 3 sampai 16 karakter', () => {
  assert.equal(D.rapikanNama('  Bima   Sena '), 'Bima Sena');
  assert.equal(D.rapikanNama('ab'), null);
  assert.equal(D.rapikanNama('   a  '), null);
  assert.equal(D.rapikanNama('abc'), 'abc');
  assert.equal(D.rapikanNama('a'.repeat(16)), 'a'.repeat(16));
  assert.equal(D.rapikanNama('a'.repeat(17)), null);
  assert.equal(D.rapikanNama('satu\ndua'), 'satu dua');
  assert.equal(D.rapikanNama(null), null);
  assert.equal(D.rapikanNama(12345), null);
});

test('username: emoji dihitung satu karakter', () => {
  assert.equal(D.rapikanNama('🙂🙂🙂'), '🙂🙂🙂');
  assert.equal(D.rapikanNama('🙂🙂'), null);
});

test('O-9: kode room 5 karakter tanpa 0, O, 1, dan I', () => {
  const rng = acakTetap(3);
  for (let i = 0; i < 500; i++) {
    const kode = D.buatKode(rng);
    assert.equal(kode.length, 5);
    assert.equal(D.kodeSah(kode), true, kode);
    assert.equal(/[01OI]/.test(kode), false, kode);
  }
  assert.equal(D.ALFABET_KODE.length, 32);
  assert.equal(new Set(D.ALFABET_KODE).size, 32);
});

test('kode room: ketikan dari chat dirapikan, kode salah ditolak', () => {
  assert.equal(D.rapikanKode(' ab-c2 3 '), 'ABC23');
  assert.equal(D.kodeSah(D.rapikanKode('abc23')), true);
  assert.equal(D.kodeSah('ABC2'), false);
  assert.equal(D.kodeSah('ABC234'), false);
  assert.equal(D.kodeSah('ABCO2'), false);
  assert.equal(D.kodeSah('ABC12'), false);
  assert.equal(D.kodeSah(null), false);
  assert.equal(D.rapikanKode(null), '');
});

/* Pengaturan dan puzzle */

test('pengaturan: 3, 5, 7, atau 10 poin, dan dua sistem', () => {
  assert.deepEqual(D.TARGET, [3, 5, 7, 10]);
  assert.deepEqual(D.SISTEM, ['rebutan', 'balapan']);
  assert.equal(D.aturSah(D.ATUR_AWAL), true);
  assert.equal(D.aturSah({ ...ATUR, target: 4 }), false);
  assert.equal(D.aturSah({ ...ATUR, sistem: 'lain' }), false);
  assert.equal(D.aturSah({ ...ATUR, kesulitan: 'dewa' }), false);
  assert.equal(D.aturSah(null), false);
});

test('jatah ronde: rebutan 5, 9, 13, 19, dan balapan sebanyak poin target', () => {
  assert.deepEqual(D.TARGET.map((target) => D.jumlahRonde({ ...ATUR, target })), [5, 9, 13, 19]);
  assert.deepEqual(D.TARGET.map((target) => D.jumlahRonde({ ...ATUR, target, sistem: 'balapan' })), [3, 5, 7, 10]);
});

test('timer: rebutan per ronde, balapan untuk seluruh pertandingan', () => {
  assert.equal(D.durasiTimer({ ...ATUR, kesulitan: 'easy' }), R.DURASI_MS.easy);
  assert.equal(D.durasiTimer({ kesulitan: 'easy', target: 3, sistem: 'balapan' }), R.DURASI_MS.easy * 3);
  assert.equal(D.durasiTimer({ kesulitan: 'hard', target: 10, sistem: 'balapan' }), R.DURASI_MS.hard * 10);
});

test('O-2: puzzle hanya dari Chapter 1 dan 2, tanpa Kartu Tersembunyi, minimal 4 slot kosong', () => {
  for (const kesulitan of D.KESULITAN) {
    const daftar = D.daftarPuzzle(LEVEL, kesulitan);
    assert.ok(daftar.length >= 20, `${kesulitan}: ${daftar.length} puzzle`);
    for (const { level, jenis } of daftar) {
      const l = LEVEL[level - 1];
      const puzzle = l[jenis];
      assert.equal(l.kesulitan, kesulitan);
      assert.ok(l.chapter <= 2);
      assert.ok(!puzzle.tutup || puzzle.tutup.length === 0);
      assert.ok(puzzle.papan.filter((k) => k === null).length >= 4);
      assert.equal(P.hitungSolusi(puzzle), 1, `level ${level} ${jenis}`);
    }
  }
});

test('daftar puzzle: cukup untuk pertandingan terpanjang, semuanya berbeda, dan bisa diambil lagi', () => {
  const rng = acakTetap(11);
  for (const kesulitan of D.KESULITAN) {
    for (const sistem of D.SISTEM) {
      for (const target of D.TARGET) {
        const atur = { kesulitan, target, sistem };
        const pilihan = D.pilihDaftarPuzzle(LEVEL, atur, rng);
        assert.equal(pilihan.length, D.jumlahRonde(atur), JSON.stringify(atur));
        assert.equal(new Set(pilihan.map((p) => `${p.level}${p.jenis}`)).size, pilihan.length);
        const daftar = D.ambilDaftarPuzzle(LEVEL, { atur, puzzle: pilihan });
        assert.deepEqual(daftar, pilihan.map((p) => LEVEL[p.level - 1][p.jenis]));
      }
    }
  }
  assert.equal(D.pilihDaftarPuzzle(LEVEL, { ...ATUR, target: 4 }), null);
});

test('daftar puzzle: urutannya acak, tidak selalu sama', () => {
  const a = D.pilihDaftarPuzzle(LEVEL, ATUR, acakTetap(1)).map((p) => `${p.level}${p.jenis}`).join();
  const b = D.pilihDaftarPuzzle(LEVEL, ATUR, acakTetap(2)).map((p) => `${p.level}${p.jenis}`).join();
  assert.notEqual(a, b);
});

test('daftar puzzle room ditolak kalau tidak cocok dengan game ini', () => {
  const room = roomMain();
  assert.ok(daftarDari(room));
  const ubah = (fn) => {
    const puzzle = room.puzzle.map((p) => ({ ...p }));
    const atur = { ...room.atur };
    fn(puzzle, atur);
    return D.ambilDaftarPuzzle(LEVEL, { atur, puzzle });
  };
  assert.equal(ubah((p) => { p[0].sidik += 1; }), null, 'versi game berbeda');
  assert.equal(ubah((p) => { p.pop(); }), null, 'kurang satu ronde');
  assert.equal(ubah((p) => { p.push({ ...p[0] }); }), null, 'lebih satu ronde');
  assert.equal(ubah((p) => { p[1] = { ...p[0] }; }), null, 'puzzle yang sama dua kali');
  assert.equal(ubah((p, atur) => { atur.kesulitan = 'hard'; }), null, 'tingkat tidak cocok');
  assert.equal(ubah((p) => { p[0].level = 999; }), null);
  assert.equal(ubah((p) => { p[0].jenis = 'lain'; }), null);
  assert.equal(D.ambilDaftarPuzzle(LEVEL, { atur: room.atur }), null);
  assert.equal(D.ambilDaftarPuzzle(LEVEL, null), null);
});

test('daftar puzzle dari database yang berbentuk objek tetap terbaca', () => {
  const room = roomMain();
  const objek = Object.fromEntries(room.puzzle.map((p, r) => [r, p]));
  assert.deepEqual(D.ambilDaftarPuzzle(LEVEL, { atur: room.atur, puzzle: objek }), daftarDari(room));
});

test('sidik kumpulan puzzle: sama untuk data yang sama, berubah kalau satu puzzle berubah', () => {
  const asli = D.sidikKumpulan(LEVEL);
  assert.equal(Number.isInteger(asli) && asli >= 0 && asli <= 4294967295, true);
  const salinan = JSON.parse(JSON.stringify(LEVEL));
  assert.equal(D.sidikKumpulan(salinan), asli);
  const { level, jenis } = D.daftarPuzzle(LEVEL, 'hard')[0];
  const ubahan = JSON.parse(JSON.stringify(LEVEL));
  ubahan[level - 1][jenis].tersedia.reverse();
  assert.notEqual(D.sidikKumpulan(ubahan), asli);
});

/* Papan */

test('papan yang dikirim: slot kosong ditulis -1', () => {
  assert.deepEqual(D.keKawat([null, 3, null, 80, 0, null, 1, 2, null]), [-1, 3, -1, 80, 0, -1, 1, 2, -1]);
});

test('nilai jawaban: solusi dinilai penuh, papan sebagian tidak', () => {
  const puzzle = daftarDari(roomMain())[0];
  const kosong = D.jumlahKosong(puzzle);
  assert.deepEqual(D.nilaiJawaban(puzzle, D.solusi(puzzle)), { sah: true, benar: kosong, penuh: true });
  assert.deepEqual(D.nilaiJawaban(puzzle, kawatSebagian(puzzle, 2)), { sah: true, benar: 2, penuh: false });
  assert.equal(D.jawabanBenar(puzzle, D.solusi(puzzle)), true);
  assert.equal(D.jawabanBenar(puzzle, kawatSebagian(puzzle, kosong - 1)), false);
});

test('O-10: papan palsu tidak sah', () => {
  const puzzle = daftarDari(roomMain())[0];
  const benar = D.solusi(puzzle).slice();
  const petunjuk = puzzle.papan.findIndex((k) => k !== null);
  const kosong = puzzle.papan.flatMap((k, i) => (k === null ? [i] : []));
  const tidakSah = (kawat, alasan) => {
    assert.equal(D.nilaiJawaban(puzzle, kawat).sah, false, alasan);
    assert.equal(D.jawabanBenar(puzzle, kawat), false, alasan);
  };

  const ubahPetunjuk = benar.slice();
  ubahPetunjuk[petunjuk] = (ubahPetunjuk[petunjuk] + 1) % 81;
  tidakSah(ubahPetunjuk, 'petunjuk diubah');

  const kartuAsing = benar.slice();
  kartuAsing[kosong[0]] = [...Array(81).keys()].find((k) => !puzzle.tersedia.includes(k) && !puzzle.papan.includes(k));
  tidakSah(kartuAsing, 'kartu di luar kartu tersedia');

  const kembar = kawatSebagian(puzzle, 0);
  kembar[kosong[0]] = puzzle.tersedia[0];
  kembar[kosong[1]] = puzzle.tersedia[0];
  tidakSah(kembar, 'kartu dipakai dua kali');

  tidakSah(benar.slice(0, 8), 'kurang dari 9 slot');
  tidakSah([...benar, 0], 'lebih dari 9 slot');
  tidakSah(benar.map((k, i) => (i === kosong[0] ? 1.5 : k)), 'bukan bilangan bulat');
  tidakSah(benar.map((k, i) => (i === kosong[0] ? null : k)), 'null');
  tidakSah('bukan larik', 'bukan larik');
  tidakSah(undefined, 'kosong');
});

test('semua puzzle duel: solusinya dinilai benar', () => {
  for (const kesulitan of D.KESULITAN) {
    for (const { level, jenis } of D.daftarPuzzle(LEVEL, kesulitan)) {
      const puzzle = LEVEL[level - 1][jenis];
      assert.equal(D.jawabanBenar(puzzle, D.solusi(puzzle)), true, `level ${level} ${jenis}`);
    }
  }
});

/* Ruang tunggu */

test('fase sebelum mulai: menunggu, kedaluwarsa, siap', () => {
  const room = roomBaru();
  assert.equal(D.keadaan(null, LEVEL, A, T0).fase, 'tiada');
  assert.equal(D.keadaan(room, LEVEL, A, T0 + 1000).fase, 'menunggu');
  assert.equal(D.keadaan(room, LEVEL, A, T0 + D.MASA_TUNGGU_MS - 1).fase, 'menunggu');
  assert.equal(D.keadaan(room, LEVEL, A, T0 + D.MASA_TUNGGU_MS).fase, 'kedaluwarsa');

  room.tamu = B;
  room.pemain[B] = { nama: 'Tamu', tersambung: true };
  const siap = D.keadaan(room, LEVEL, A, T0 + D.MASA_TUNGGU_MS + 5);
  assert.equal(siap.fase, 'siap', 'room yang sudah punya lawan tidak kedaluwarsa');
  assert.equal(siap.lawan, B);
  assert.equal(siap.namaLawan, 'Tamu');
  assert.deepEqual(siap.atur, room.atur);
  assert.equal(D.keadaan(room, LEVEL, B, T0).namaLawan, 'Tuan');
});

test('T-3: pertandingan baru bisa dimulai kalau kedua pemain siap dan tersambung', () => {
  const room = roomBaru();
  room.pemain[A].siap = 0;
  assert.equal(D.bisaMulai(room, A), false, 'belum ada lawan');
  room.tamu = B;
  room.pemain[B] = { nama: 'Tamu', tersambung: true };
  assert.equal(D.bisaMulai(room, A), false, 'tamu belum siap');
  assert.deepEqual([D.keadaan(room, LEVEL, A, T0).siapSaya, D.keadaan(room, LEVEL, A, T0).siapLawan], [true, false]);
  room.pemain[B].siap = 0;
  assert.equal(D.bisaMulai(room, A), true);
  assert.equal(D.bisaMulai(room, B), false, 'tamu tidak menulis waktu mulai');
  room.pemain[B].tersambung = false;
  assert.equal(D.bisaMulai(room, A), false, 'tamu sedang terputus');
  room.pemain[B].tersambung = true;
  room.pemain[A].siap = -1;
  assert.equal(D.bisaMulai(room, A), false, 'pembuat room membatalkan siap');
  room.pemain[A].siap = 0;
  room.mulaiPada = T0 + 5;
  assert.equal(D.bisaMulai(room, A), false, 'sudah dimulai');
});

test('T-4: mengubah pengaturan membatalkan tanda siap kedua pemain', () => {
  const room = roomSiap();
  room.pemain[A].siap = 0;
  room.pemain[B].siap = 0;
  assert.equal(D.bisaMulai(room, A), true);
  room.atur = { ...room.atur, target: 5, rev: 1 };
  assert.equal(D.sudahSiap(room, A), false);
  assert.equal(D.sudahSiap(room, B), false);
  assert.equal(D.bisaMulai(room, A), false);
  room.pemain[A].siap = 1;
  room.pemain[B].siap = 1;
  assert.equal(D.bisaMulai(room, A), true);
});

test('keluar sebelum papan tampil: duel batal, tanpa pemenang', () => {
  const siap = roomSiap();
  siap.pemain[B].menyerah = T0 + 500;
  assert.equal(D.keadaan(siap, LEVEL, A, T0 + 600).fase, 'batal');
  assert.equal(D.bisaMulai(siap, A), false);

  const hitung = roomMain();
  hitung.pemain[A].menyerah = D.mulaiMain(hitung) - 1;
  assert.equal(D.keadaan(hitung, LEVEL, B, D.mulaiMain(hitung) + 10).fase, 'batal');
  assert.equal(D.hasil(hitung, LEVEL, D.mulaiMain(hitung) + 99999999), null);
});

/* Rebutan */

test('rebutan: hitung mundur, lalu ronde pertama dengan timer tingkatnya', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  assert.equal(t, room.mulaiPada + D.HITUNG_MUNDUR_MS);
  assert.equal(D.keadaan(room, LEVEL, A, room.mulaiPada + 10).fase, 'hitung');
  const k = D.keadaan(room, LEVEL, A, t);
  assert.equal(k.fase, 'main');
  assert.equal(k.ronde, 0);
  assert.equal(k.jumlahRonde, 5);
  assert.equal(k.puzzle, daftarDari(room)[0]);
  assert.equal(k.mulai, t);
  assert.equal(k.tenggat, t + DURASI);
  assert.deepEqual(k.skor, { [A]: 0, [B]: 0 });
  assert.equal(D.hasil(room, LEVEL, t + 1000), null);
});

test('S1-1: yang pertama mengunci benar dapat poin, lalu keduanya pindah ronde setelah jeda', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  jawab(room, 0, B, t + 30000);
  const jeda = D.keadaan(room, LEVEL, A, t + 30001);
  assert.equal(jeda.fase, 'jeda');
  assert.equal(jeda.ronde, 1);
  assert.deepEqual(jeda.skor, { [A]: 0, [B]: 1 });
  assert.deepEqual(jeda.riwayat, [{ pemenang: B, pada: t + 30000 }]);
  assert.equal(jeda.mulai, t + 30000 + D.JEDA_RONDE_MS);
  for (const uid of [A, B]) {
    const k = D.keadaan(room, LEVEL, uid, jeda.mulai);
    assert.equal(k.fase, 'main');
    assert.equal(k.ronde, 1);
    assert.equal(k.puzzle, daftarDari(room)[1], 'kedua pemain mendapat puzzle ronde 2 yang sama');
    assert.equal(k.tenggat, jeda.mulai + DURASI);
  }
});

test('S1-1: kalau keduanya mengunci benar, yang lebih dulu dapat poin', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  jawab(room, 0, A, t + 40000);
  jawab(room, 0, B, t + 39999);
  assert.deepEqual(D.keadaan(room, LEVEL, A, t + 41000).skor, { [A]: 0, [B]: 1 });
  room.ronde[0][A].pada = t + 39998;
  assert.deepEqual(D.keadaan(room, LEVEL, A, t + 41000).skor, { [A]: 1, [B]: 0 });
});

test('rebutan: waktu yang persis sama tetap memberi hasil yang sama di kedua HP', () => {
  const room = roomMain();
  const t = D.mulaiMain(room) + 5000;
  jawab(room, 0, A, t);
  jawab(room, 0, B, t);
  const pertama = D.keadaan(room, LEVEL, A, t + 1).skor;
  const terbalik = { ...room, ronde: { 0: { [B]: room.ronde[0][B], [A]: room.ronde[0][A] } } };
  assert.deepEqual(D.keadaan(terbalik, LEVEL, B, t + 1).skor, pertama);
});

test('K-2: waktu ronde habis tanpa jawaban benar, tidak ada yang dapat poin', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  assert.equal(D.keadaan(room, LEVEL, A, t + DURASI - 1).fase, 'main');
  assert.equal(D.keadaan(room, LEVEL, A, t + DURASI).fase, 'tunggu');
  assert.equal(D.keadaan(room, LEVEL, A, t + DURASI + D.JEDA_AMAN_MS - 1).fase, 'tunggu');
  const k = D.keadaan(room, LEVEL, A, t + DURASI + D.JEDA_AMAN_MS);
  assert.equal(k.fase, 'jeda');
  assert.equal(k.ronde, 1);
  assert.deepEqual(k.skor, { [A]: 0, [B]: 0 });
  assert.deepEqual(k.riwayat, [{ pemenang: null, pada: t + DURASI }]);
  assert.equal(k.mulai, t + DURASI + D.JEDA_RONDE_MS);
});

test('rebutan: jawaban di menit terakhir yang tiba saat menunggu tetap dihitung', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  assert.equal(D.keadaan(room, LEVEL, A, t + DURASI + 500).fase, 'tunggu');
  jawab(room, 0, A, t + DURASI);
  const k = D.keadaan(room, LEVEL, A, t + DURASI + 600);
  assert.equal(k.fase, 'jeda');
  assert.deepEqual(k.skor, { [A]: 1, [B]: 0 });
});

test('rebutan: jawaban yang tidak berlaku tidak memberi poin', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  const puzzle = daftarDari(room)[0];
  jawab(room, 0, A, t - 1);
  assert.equal(D.keadaan(room, LEVEL, A, t + 10).fase, 'main', 'dikirim sebelum papan tampil');
  jawab(room, 0, A, t + 1000, kawatSebagian(puzzle, 2));
  assert.equal(D.keadaan(room, LEVEL, A, t + 2000).fase, 'main', 'papan belum penuh');
  jawab(room, 0, A, t + 1000, kawatBenar(room, 1));
  assert.equal(D.keadaan(room, LEVEL, A, t + 2000).fase, 'main', 'jawaban untuk puzzle ronde lain');
  jawab(room, 0, A, t + DURASI + 1);
  assert.deepEqual(D.keadaan(room, LEVEL, A, t + DURASI + D.JEDA_AMAN_MS).skor, { [A]: 0, [B]: 0 }, 'terlambat');
  // Jawaban ronde 2 yang dikirim sebelum ronde 2 dimulai tidak dihitung.
  const awal = roomMain();
  jawab(awal, 0, B, t + 5000);
  jawab(awal, 1, A, t + 5000 + D.JEDA_RONDE_MS - 1);
  const k = D.keadaan(awal, LEVEL, A, t + 5000 + D.JEDA_RONDE_MS + 100);
  assert.equal(k.fase, 'main');
  assert.equal(k.ronde, 1);
  assert.deepEqual(k.skor, { [A]: 0, [B]: 1 });
});

// Memainkan rebutan dari urutan pemenang ronde. null berarti waktu ronde habis.
function mainkanRebutan(room, urutan) {
  let mulai = D.mulaiMain(room);
  urutan.forEach((uid, r) => {
    if (uid === null) {
      mulai += DURASI + D.JEDA_RONDE_MS;
      return;
    }
    jawab(room, r, uid, mulai + 20000);
    mulai += 20000 + D.JEDA_RONDE_MS;
  });
  return mulai;
}

test('S1-5: rebutan selesai begitu seseorang mencapai poin target', () => {
  const room = roomMain();
  const t = mainkanRebutan(room, [A, B, A]);
  assert.equal(D.hasil(room, LEVEL, t), null, 'skor 2-1, belum selesai');
  assert.deepEqual(D.keadaan(room, LEVEL, A, t).skor, { [A]: 2, [B]: 1 });
  mainkanRebutan(room, [A, B, A, A]);
  const h = D.hasil(room, LEVEL, t + 20001);
  assert.deepEqual(h, { pemenang: A, alasan: 'poin', skor: { [A]: 3, [B]: 1 } });
  assert.equal(D.keadaan(room, LEVEL, B, t + 20001).fase, 'selesai');
});

test('S1-5: semua panjang pertandingan selesai tepat di poin targetnya', () => {
  for (const target of D.TARGET) {
    const room = roomMain({ target });
    const selang = Array.from({ length: target * 2 - 1 }, (_, r) => (r % 2 ? B : A));
    const t = mainkanRebutan(room, selang);
    const h = D.hasil(room, LEVEL, t);
    assert.deepEqual(h, { pemenang: A, alasan: 'poin', skor: { [A]: target, [B]: target - 1 } }, `target ${target}`);
    delete room.ronde[target * 2 - 2];
    assert.equal(D.hasil(room, LEVEL, t), null, 'ronde terakhir belum dikunci');
  }
});

test('S1-5: jatah ronde habis karena ada ronde tanpa poin, poin terbanyak menang', () => {
  const room = roomMain();
  const t = mainkanRebutan(room, [A, null, B, A, null]);
  const h = D.hasil(room, LEVEL, t);
  assert.deepEqual(h, { pemenang: A, alasan: 'poin', skor: { [A]: 2, [B]: 1 } });
});

test('S1-5: jatah ronde habis dengan poin sama berarti seri', () => {
  const room = roomMain();
  const t = mainkanRebutan(room, [A, null, B, null, null]);
  assert.deepEqual(D.hasil(room, LEVEL, t), { pemenang: null, alasan: 'poin', skor: { [A]: 1, [B]: 1 } });
  const diam = roomMain();
  const akhir = D.mulaiMain(diam) + 5 * DURASI + 4 * D.JEDA_RONDE_MS + D.JEDA_AMAN_MS;
  assert.equal(D.hasil(diam, LEVEL, akhir - 1), null);
  assert.deepEqual(D.hasil(diam, LEVEL, akhir), { pemenang: null, alasan: 'poin', skor: { [A]: 0, [B]: 0 } });
});

test('rebutan: hasil tidak berubah lagi setelah diputuskan', () => {
  const room = roomMain();
  const t = mainkanRebutan(room, [B, B, B]);
  const awal = D.hasil(room, LEVEL, t);
  jawab(room, 3, A, t + 1000);
  room.pemain[B].menyerah = t + 2000;
  room.akhir = { pemenang: A, alasan: 'putus', pada: t + 3000 };
  assert.deepEqual(D.hasil(room, LEVEL, t + 99999999), awal);
  assert.equal(awal.pemenang, B);
});

/* Balapan */

const BALAPAN = { sistem: 'balapan' };

test('balapan: setiap pemain maju sendiri, dan timernya untuk seluruh pertandingan', () => {
  const room = roomMain(BALAPAN);
  const t = D.mulaiMain(room);
  assert.equal(D.keadaan(room, LEVEL, A, t - 1).fase, 'hitung');
  jawab(room, 0, A, t + 20000);
  const a = D.keadaan(room, LEVEL, A, t + 20001);
  const b = D.keadaan(room, LEVEL, B, t + 20001);
  assert.equal(a.fase, 'main', 'tidak ada jeda antarronde');
  assert.equal(a.ronde, 1);
  assert.equal(a.rondeLawan, 0);
  assert.equal(a.puzzle, daftarDari(room)[1]);
  assert.equal(b.ronde, 0, 'yang tertinggal harus menyelesaikan puzzle-nya dulu');
  assert.equal(b.rondeLawan, 1);
  assert.equal(b.puzzle, daftarDari(room)[0]);
  assert.deepEqual(a.skor, { [A]: 1, [B]: 0 });
  assert.equal(a.jumlahRonde, 3);
  assert.equal(a.tenggat, t + DURASI * 3);
  assert.equal(b.tenggat, a.tenggat);
});

test('K-1: di balapan, setiap puzzle yang selesai memberi poin untuk pemain itu sendiri', () => {
  const room = roomMain(BALAPAN);
  const t = D.mulaiMain(room);
  jawab(room, 0, A, t + 20000);
  jawab(room, 0, B, t + 50000);
  jawab(room, 1, B, t + 60000);
  assert.deepEqual(D.keadaan(room, LEVEL, A, t + 61000).skor, { [A]: 1, [B]: 2 }, 'yang tertinggal tetap dapat poin, dan bisa menyalip');
});

test('K-1: yang pertama mencapai poin target menang', () => {
  const room = roomMain(BALAPAN);
  const t = D.mulaiMain(room);
  [20000, 40000, 60000].forEach((ms, r) => jawab(room, r, A, t + ms));
  [25000, 45000].forEach((ms, r) => jawab(room, r, B, t + ms));
  assert.equal(D.hasil(room, LEVEL, t + 59999 - 1) && null, null);
  assert.deepEqual(D.hasil(room, LEVEL, t + 60001), { pemenang: A, alasan: 'poin', skor: { [A]: 3, [B]: 2 } });
  // Lawan yang menyusul sesudahnya tidak mengubah hasil.
  jawab(room, 2, B, t + 60500);
  assert.equal(D.hasil(room, LEVEL, t + 70000).pemenang, A);
  // Kalau keduanya sampai, yang lebih dulu yang menang.
  room.ronde[2][B].pada = t + 59000;
  assert.equal(D.hasil(room, LEVEL, t + 70000).pemenang, B);
});

test('balapan: jawaban harus berurutan dan benar', () => {
  const room = roomMain(BALAPAN);
  const t = D.mulaiMain(room);
  jawab(room, 1, A, t + 10000);
  jawab(room, 2, A, t + 20000);
  assert.deepEqual(D.keadaan(room, LEVEL, A, t + 21000).skor, { [A]: 0, [B]: 0 }, 'melompati ronde 1');
  jawab(room, 0, A, t + 30000);
  assert.deepEqual(D.keadaan(room, LEVEL, A, t + 31000).skor, { [A]: 1, [B]: 0 }, 'ronde 2 dikirim sebelum ronde 1');
  jawab(room, 0, B, t + 5000, kawatBenar(room, 1));
  assert.equal(D.keadaan(room, LEVEL, A, t + 31000).skor[B], 0, 'jawaban puzzle lain');
  jawab(room, 0, B, t - 1);
  assert.equal(D.keadaan(room, LEVEL, A, t + 31000).skor[B], 0, 'sebelum papan tampil');
});

test('S2-4: batas waktu balapan habis, poin terbanyak menang, dan poin sama berarti seri', () => {
  const room = roomMain(BALAPAN);
  const t = D.mulaiMain(room);
  const batas = t + DURASI * 3;
  jawab(room, 0, A, t + 20000);
  assert.equal(D.keadaan(room, LEVEL, A, batas - 1).fase, 'main');
  assert.equal(D.keadaan(room, LEVEL, A, batas).fase, 'tunggu');
  assert.equal(D.hasil(room, LEVEL, batas + D.JEDA_AMAN_MS - 1), null);
  assert.deepEqual(D.hasil(room, LEVEL, batas + D.JEDA_AMAN_MS), { pemenang: A, alasan: 'waktu', skor: { [A]: 1, [B]: 0 } });
  jawab(room, 0, B, batas);
  assert.deepEqual(D.hasil(room, LEVEL, batas + D.JEDA_AMAN_MS), { pemenang: null, alasan: 'waktu', skor: { [A]: 1, [B]: 1 } });
  jawab(room, 1, B, batas + 1);
  assert.equal(D.hasil(room, LEVEL, batas + D.JEDA_AMAN_MS).pemenang, null, 'jawaban setelah batas waktu tidak dihitung');
});

/* Progres lawan */

test('P-2: jumlah slot yang sudah diisi lawan terlihat, dan direset saat lawan pindah ronde', () => {
  const room = roomMain(BALAPAN);
  const t = D.mulaiMain(room);
  const daftar = daftarDari(room);
  let k = D.keadaan(room, LEVEL, A, t + 100);
  assert.equal(k.isiLawan, 0);
  assert.equal(k.kosongLawan, D.jumlahKosong(daftar[0]));
  room.pemain[B].maju = D.kodeMaju(0, 3);
  assert.equal(D.keadaan(room, LEVEL, A, t + 200).isiLawan, 3);
  assert.equal(D.keadaan(room, LEVEL, B, t + 200).isiLawan, 0, 'progres sendiri tidak dianggap progres lawan');
  jawab(room, 0, B, t + 5000);
  k = D.keadaan(room, LEVEL, A, t + 5001);
  assert.equal(k.rondeLawan, 1);
  assert.equal(k.isiLawan, 0, 'angka dari ronde lama tidak dipakai');
  assert.equal(k.kosongLawan, D.jumlahKosong(daftar[1]));
  room.pemain[B].maju = D.kodeMaju(1, 9);
  assert.equal(D.keadaan(room, LEVEL, A, t + 5002).isiLawan, k.kosongLawan, 'tidak melebihi jumlah slot kosong');
  room.pemain[B].maju = 'rusak';
  assert.equal(D.keadaan(room, LEVEL, A, t + 5003).isiLawan, 0);
});

test('kode progres: nomor ronde dan jumlah slot dalam satu angka', () => {
  assert.equal(D.kodeMaju(0, 0), 0);
  assert.equal(D.kodeMaju(18, 9), 189);
  assert.equal(D.kodeMaju(2, 12), 29);
  assert.equal(D.kodeMaju(2, -1), 20);
});

/* Keluar dan putus */

for (const sistem of D.SISTEM) {
  test(`${sistem}: keluar di tengah pertandingan berarti kalah seluruh pertandingan`, () => {
    const room = roomMain({ sistem });
    const t = D.mulaiMain(room);
    jawab(room, 0, A, t + 20000);
    room.pemain[A].menyerah = t + 40000;
    const h = D.hasil(room, LEVEL, t + 40001);
    assert.deepEqual(h, { pemenang: B, alasan: 'menyerah', skor: { [A]: 1, [B]: 0 } });
    assert.equal(D.keadaan(room, LEVEL, B, t + 40001).fase, 'selesai');
  });

  test(`${sistem}: kemenangan lewat poin mengalahkan keluar yang datang kemudian`, () => {
    const room = roomMain({ sistem });
    let t = D.mulaiMain(room);
    for (let r = 0; r < 3; r++) {
      t += 20000;
      jawab(room, r, A, t);
      if (sistem === 'rebutan') t += D.JEDA_RONDE_MS;
    }
    room.pemain[A].menyerah = t + 60000;
    assert.deepEqual(D.hasil(room, LEVEL, t + 60001), { pemenang: A, alasan: 'poin', skor: { [A]: 3, [B]: 0 } });
  });

  test(`${sistem}: klaim putus membuat pemain yang bertahan menang`, () => {
    const room = roomMain({ sistem });
    const t = D.mulaiMain(room) + 50000;
    room.akhir = { pemenang: A, alasan: 'putus', pada: t };
    assert.equal(D.hasil(room, LEVEL, t + 1).pemenang, A);
    assert.equal(D.hasil(room, LEVEL, t + 1).alasan, 'putus');
    assert.equal(D.bisaKlaimPutus(room, LEVEL, A, t + 1), false, 'tidak mengklaim dua kali');
    room.akhir = { pemenang: 'orang-luar', alasan: 'putus', pada: t };
    assert.equal(D.hasil(room, LEVEL, t + 1), null, 'klaim dari orang luar diabaikan');
  });
}

test('jawaban setelah lawan keluar tidak mengubah skor akhir', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  room.pemain[B].menyerah = t + 10000;
  jawab(room, 0, B, t + 12000);
  assert.deepEqual(D.hasil(room, LEVEL, t + 20000), { pemenang: A, alasan: 'menyerah', skor: { [A]: 0, [B]: 0 } });
});

test('dari dua kejadian, yang lebih dulu yang berlaku', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  room.pemain[A].menyerah = t + 9000;
  room.akhir = { pemenang: A, alasan: 'putus', pada: t + 8000 };
  assert.equal(D.hasil(room, LEVEL, t + 10000).alasan, 'putus');
  room.akhir.pada = t + 9500;
  assert.deepEqual([D.hasil(room, LEVEL, t + 10000).alasan, D.hasil(room, LEVEL, t + 10000).pemenang], ['menyerah', B]);
});

test('O-5: lawan yang putus diberi 30 detik untuk kembali', () => {
  const room = roomMain();
  const t = D.mulaiMain(room) + 10000;
  assert.equal(D.sisaPutusMs(room, A, t), null);
  room.pemain[B].tersambung = false;
  room.pemain[B].putusPada = t;
  assert.equal(D.sisaPutusMs(room, A, t + 12000), 18000);
  assert.equal(D.sisaPutusMs(room, A, t - 900), D.BATAS_PUTUS_MS, 'jam HP yang tertinggal tidak menampilkan 31 detik');
  assert.equal(D.bisaKlaimPutus(room, LEVEL, A, t + D.BATAS_PUTUS_MS - 1), false);
  assert.equal(D.bisaKlaimPutus(room, LEVEL, A, t + D.BATAS_PUTUS_MS), true);
  assert.equal(D.bisaKlaimPutus(room, LEVEL, B, t + D.BATAS_PUTUS_MS), false, 'yang putus tidak bisa mengklaim');
  room.pemain[B].tersambung = true;
  delete room.pemain[B].putusPada;
  assert.equal(D.bisaKlaimPutus(room, LEVEL, A, t + D.BATAS_PUTUS_MS), false, 'lawan sudah kembali');
});

test('O-5: klaim putus tidak berlaku sebelum mulai atau setelah pertandingan selesai', () => {
  const siap = roomSiap();
  siap.pemain[B].tersambung = false;
  siap.pemain[B].putusPada = T0;
  assert.equal(D.bisaKlaimPutus(siap, LEVEL, A, T0 + 99999), false, 'di ruang tunggu');

  const room = roomMain();
  const t = mainkanRebutan(room, [A, A, A]);
  room.pemain[B].tersambung = false;
  room.pemain[B].putusPada = t;
  assert.equal(D.bisaKlaimPutus(room, LEVEL, A, t + D.BATAS_PUTUS_MS + 1), false);
});

/* Data rusak */

test('room dengan daftar puzzle yang tidak cocok dinyatakan rusak, bukan macet', () => {
  const room = roomMain();
  room.puzzle = room.puzzle.map((p, r) => (r === 2 ? { ...p, sidik: p.sidik + 1 } : p));
  const h = D.hasil(room, LEVEL, D.mulaiMain(room) + 10);
  assert.equal(h.alasan, 'rusak');
  assert.equal(h.pemenang, null);
  const k = D.keadaan(room, LEVEL, A, D.mulaiMain(room) + 10);
  assert.equal(k.fase, 'selesai');
  assert.equal(k.hasil.alasan, 'rusak');
  assert.equal(D.bisaKlaimPutus(room, LEVEL, A, D.mulaiMain(room) + 10), false);
});

test('data room yang rusak tidak membuat galat', () => {
  const rusak = [
    null, {}, { tuan: A }, { tuan: A, tamu: B, mulaiPada: 'nanti' }, { tuan: A, tamu: B, mulaiPada: T0 },
    { tuan: A, tamu: B, mulaiPada: T0, atur: ATUR }, { tuan: A, tamu: B, mulaiPada: T0, atur: { ...ATUR, target: 99 }, puzzle: [] },
  ];
  for (const room of rusak) {
    assert.doesNotThrow(() => D.keadaan(room, LEVEL, A, T0));
    assert.doesNotThrow(() => D.hasil(room, LEVEL, T0));
    assert.doesNotThrow(() => D.bisaKlaimPutus(room, LEVEL, A, T0));
    assert.doesNotThrow(() => D.bisaMulai(room, A));
  }
  for (const sistem of D.SISTEM) {
    const room = roomMain({ sistem });
    room.ronde = { 0: { [A]: { papan: 'rusak', pada: 'rusak' }, [B]: null }, 1: 'rusak', 7: { [A]: {} } };
    room.pemain[B].maju = {};
    assert.doesNotThrow(() => D.keadaan(room, LEVEL, A, D.mulaiMain(room) + 1000));
    assert.doesNotThrow(() => D.hasil(room, LEVEL, D.mulaiMain(room) + 99999999));
  }
});

test('pembekuan kunci salah 7 detik', () => {
  assert.equal(D.BEKU_KUNCI_MS, 7000);
});
