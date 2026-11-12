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

function roomBaru(kesulitan = 'medium', benih = 7) {
  const puzzle = D.pilihPuzzle(LEVEL, kesulitan, acakTetap(benih));
  return {
    v: D.VERSI,
    dibuat: T0,
    tuan: A,
    kesulitan,
    ...puzzle,
    pemain: { [A]: { nama: 'Tuan', tersambung: true } },
  };
}

function roomMain(kesulitan = 'medium', benih = 7) {
  const room = roomBaru(kesulitan, benih);
  room.tamu = B;
  room.pemain[B] = { nama: 'Tamu', tersambung: true };
  room.mulaiPada = T0 + 60000;
  return room;
}

const puzzleDari = (room) => D.ambilPuzzle(LEVEL, room);
const kawatBenar = (room) => D.solusi(puzzleDari(room)).slice();
// Papan dengan n slot isian yang benar, sisanya kosong.
function kawatSebagian(room, n) {
  const puzzle = puzzleDari(room);
  const kunci = D.solusi(puzzle);
  let sisa = n;
  return puzzle.papan.map((k, i) => {
    if (k !== null) return k;
    if (sisa > 0) { sisa -= 1; return kunci[i]; }
    return -1;
  });
}
const jawab = (room, uid, papan, pada) => {
  room.jawaban = room.jawaban || {};
  room.jawaban[uid] = { papan, pada };
};

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

test('O-2: puzzle yang dipilih selalu bisa diambil lagi dari data room', () => {
  const rng = acakTetap(11);
  for (const kesulitan of D.KESULITAN) {
    for (let i = 0; i < 50; i++) {
      const pilihan = D.pilihPuzzle(LEVEL, kesulitan, rng);
      const puzzle = D.ambilPuzzle(LEVEL, { kesulitan, ...pilihan });
      assert.equal(puzzle, LEVEL[pilihan.level - 1][pilihan.jenis]);
    }
  }
  assert.equal(D.pilihPuzzle(LEVEL, 'mustahil'), null);
});

test('puzzle room ditolak kalau datanya tidak cocok dengan game ini', () => {
  const room = roomBaru();
  assert.ok(D.ambilPuzzle(LEVEL, room));
  assert.equal(D.ambilPuzzle(LEVEL, { ...room, sidik: room.sidik + 1 }), null, 'versi game berbeda');
  assert.equal(D.ambilPuzzle(LEVEL, { ...room, kesulitan: 'hard' }), null);
  assert.equal(D.ambilPuzzle(LEVEL, { ...room, level: 101, kesulitan: LEVEL[100].kesulitan }), null, 'Chapter 3');
  assert.equal(D.ambilPuzzle(LEVEL, { ...room, level: 1, kesulitan: 'easy' }), null, 'puzzle tutorial terlalu singkat');
  assert.equal(D.ambilPuzzle(LEVEL, { ...room, level: 999 }), null);
  assert.equal(D.ambilPuzzle(LEVEL, { ...room, level: 2.5 }), null);
  assert.equal(D.ambilPuzzle(LEVEL, { ...room, jenis: 'lain' }), null);
  assert.equal(D.ambilPuzzle(LEVEL, null), null);
});

test('papan yang dikirim: slot kosong ditulis -1', () => {
  assert.deepEqual(D.keKawat([null, 3, null, 80, 0, null, 1, 2, null]), [-1, 3, -1, 80, 0, -1, 1, 2, -1]);
});

test('nilai jawaban: solusi dinilai penuh, papan sebagian dihitung per posisi', () => {
  const room = roomMain();
  const puzzle = puzzleDari(room);
  const kosong = puzzle.papan.filter((k) => k === null).length;
  assert.deepEqual(D.nilaiJawaban(puzzle, kawatBenar(room)), { sah: true, benar: kosong, penuh: true });
  assert.deepEqual(D.nilaiJawaban(puzzle, kawatSebagian(room, 0)), { sah: true, benar: 0, penuh: false });
  assert.deepEqual(D.nilaiJawaban(puzzle, kawatSebagian(room, 2)), { sah: true, benar: 2, penuh: false });
});

test('nilai jawaban: kartu di tempat yang salah tidak dihitung', () => {
  const room = roomMain();
  const puzzle = puzzleDari(room);
  const kunci = D.solusi(puzzle);
  const [a, b] = puzzle.papan.flatMap((k, i) => (k === null ? [i] : []));
  const kawat = kawatSebagian(room, 0);
  kawat[a] = kunci[b];
  kawat[b] = kunci[a];
  assert.deepEqual(D.nilaiJawaban(puzzle, kawat), { sah: true, benar: 0, penuh: false });
});

test('O-10: papan palsu tidak sah', () => {
  const room = roomMain();
  const puzzle = puzzleDari(room);
  const benar = kawatBenar(room);
  const petunjuk = puzzle.papan.findIndex((k) => k !== null);
  const kosong = puzzle.papan.flatMap((k, i) => (k === null ? [i] : []));
  const tidakSah = (kawat, alasan) => assert.equal(D.nilaiJawaban(puzzle, kawat).sah, false, alasan);

  const ubahPetunjuk = benar.slice();
  ubahPetunjuk[petunjuk] = (ubahPetunjuk[petunjuk] + 1) % 81;
  tidakSah(ubahPetunjuk, 'petunjuk diubah');

  const kartuAsing = benar.slice();
  kartuAsing[kosong[0]] = [...Array(81).keys()].find((k) => !puzzle.tersedia.includes(k) && !puzzle.papan.includes(k));
  tidakSah(kartuAsing, 'kartu di luar kartu tersedia');

  const kembar = kawatSebagian(room, 0);
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

test('semua puzzle duel: solusinya dinilai penuh', () => {
  for (const kesulitan of D.KESULITAN) {
    for (const { level, jenis } of D.daftarPuzzle(LEVEL, kesulitan)) {
      const puzzle = LEVEL[level - 1][jenis];
      const nilai = D.nilaiJawaban(puzzle, D.solusi(puzzle));
      assert.equal(nilai.sah && nilai.penuh, true, `level ${level} ${jenis}`);
    }
  }
});

test('waktu: papan tampil setelah hitung mundur, dan tenggat mengikuti kesulitan', () => {
  for (const kesulitan of D.KESULITAN) {
    const room = roomMain(kesulitan);
    assert.equal(D.mulaiMain(room), room.mulaiPada + D.HITUNG_MUNDUR_MS);
    assert.equal(D.tenggat(room), room.mulaiPada + D.HITUNG_MUNDUR_MS + R.DURASI_MS[kesulitan]);
  }
});

test('fase: menunggu, kedaluwarsa, siap, hitung, main', () => {
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
  assert.equal(D.keadaan(room, LEVEL, B, T0).namaLawan, 'Tuan');

  room.mulaiPada = T0 + 60000;
  assert.equal(D.keadaan(room, LEVEL, A, room.mulaiPada + 10).fase, 'hitung');
  assert.equal(D.keadaan(room, LEVEL, A, D.mulaiMain(room) - 1).fase, 'hitung');
  const main = D.keadaan(room, LEVEL, A, D.mulaiMain(room));
  assert.equal(main.fase, 'main');
  assert.equal(main.tenggat, D.tenggat(room));
  assert.equal(D.keadaan(room, LEVEL, A, D.tenggat(room) - 1).fase, 'main');
  assert.equal(D.keadaan(room, LEVEL, A, D.tenggat(room)).fase, 'hitung-hasil');
});

test('pembuat room memulai duel hanya kalau lawan sudah tersambung', () => {
  const room = roomBaru();
  assert.equal(D.bisaMulai(room, A), false, 'belum ada lawan');
  room.tamu = B;
  room.pemain[B] = { nama: 'Tamu', tersambung: false };
  assert.equal(D.bisaMulai(room, A), false, 'lawan belum tersambung');
  room.pemain[B].tersambung = true;
  assert.equal(D.bisaMulai(room, A), true);
  assert.equal(D.bisaMulai(room, B), false, 'tamu tidak memulai');
  room.mulaiPada = T0 + 5;
  assert.equal(D.bisaMulai(room, A), false, 'sudah dimulai');
});

test('O-1: yang pertama mengunci jawaban benar menang', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  assert.equal(D.hasil(room, LEVEL, t + 1000), null);
  jawab(room, B, kawatBenar(room), t + 30000);
  const h = D.hasil(room, LEVEL, t + 30001);
  assert.equal(h.pemenang, B);
  assert.equal(h.alasan, 'benar');
  assert.equal(D.keadaan(room, LEVEL, A, t + 30001).fase, 'selesai');
});

test('O-1: kalau keduanya mengunci benar, yang lebih dulu menang', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  jawab(room, A, kawatBenar(room), t + 40000);
  jawab(room, B, kawatBenar(room), t + 39999);
  assert.equal(D.hasil(room, LEVEL, t + 50000).pemenang, B);
  room.jawaban[A].pada = t + 39998;
  assert.equal(D.hasil(room, LEVEL, t + 50000).pemenang, A);
});

test('O-1: waktu yang persis sama tetap memberi hasil yang sama di kedua HP', () => {
  const room = roomMain();
  const t = D.mulaiMain(room) + 5000;
  jawab(room, A, kawatBenar(room), t);
  jawab(room, B, kawatBenar(room), t);
  const pertama = D.hasil(room, LEVEL, t + 1).pemenang;
  const terbalik = { ...room, jawaban: { [B]: room.jawaban[B], [A]: room.jawaban[A] } };
  assert.equal(D.hasil(terbalik, LEVEL, t + 1).pemenang, pertama);
});

test('O-10: papan salah yang dikirim sebelum waktu habis tidak membuat menang', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  jawab(room, B, kawatSebagian(room, 1), t + 1000);
  assert.equal(D.hasil(room, LEVEL, t + 2000), null);
  const palsu = kawatBenar(room);
  const petunjuk = puzzleDari(room).papan.findIndex((k) => k !== null);
  palsu[petunjuk] = (palsu[petunjuk] + 1) % 81;
  room.jawaban[B].papan = palsu;
  assert.equal(D.hasil(room, LEVEL, t + 2000), null, 'petunjuk diubah');
});

test('O-10: jawaban yang dikirim sebelum papan tampil tidak dihitung', () => {
  const room = roomMain();
  jawab(room, B, kawatBenar(room), D.mulaiMain(room) - 1);
  assert.equal(D.hasil(room, LEVEL, D.mulaiMain(room) + 10), null);
  jawab(room, A, kawatSebagian(room, 1), D.tenggat(room) + 100);
  const h = D.hasil(room, LEVEL, D.tenggat(room) + 200);
  assert.equal(h.pemenang, A);
  assert.equal(h.benar[B], 0);
});

test('O-3: waktu habis, posisi benar terbanyak menang', () => {
  const room = roomMain();
  const batas = D.tenggat(room);
  jawab(room, A, kawatSebagian(room, 3), batas + 200);
  assert.equal(D.hasil(room, LEVEL, batas + 300), null, 'masih menunggu papan lawan');
  assert.equal(D.keadaan(room, LEVEL, A, batas + 300).fase, 'hitung-hasil');
  jawab(room, B, kawatSebagian(room, 2), batas + 400);
  const h = D.hasil(room, LEVEL, batas + 500);
  assert.equal(h.pemenang, A);
  assert.equal(h.alasan, 'waktu');
  assert.deepEqual(h.benar, { [A]: 3, [B]: 2 });
});

test('O-3: waktu habis dengan posisi benar sama berarti seri', () => {
  const room = roomMain();
  const batas = D.tenggat(room);
  jawab(room, A, kawatSebagian(room, 2), batas + 100);
  jawab(room, B, kawatSebagian(room, 2), batas + 900);
  const h = D.hasil(room, LEVEL, batas + 1000);
  assert.equal(h.pemenang, null);
  assert.equal(h.alasan, 'waktu');
});

test('O-3: papan penuh yang baru tiba setelah waktu habis menang lewat hitungan posisi', () => {
  const room = roomMain();
  const batas = D.tenggat(room);
  jawab(room, A, kawatBenar(room), batas + 50);
  jawab(room, B, kawatSebagian(room, 2), batas + 60);
  const h = D.hasil(room, LEVEL, batas + 100);
  assert.equal(h.pemenang, A);
  assert.equal(h.alasan, 'waktu');
  // Dua papan penuh setelah waktu habis: urutan tiba tidak adil untuk dijadikan penentu.
  room.jawaban[B].papan = kawatBenar(room);
  assert.equal(D.hasil(room, LEVEL, batas + 100).pemenang, null);
});

test('O-3: papan lawan yang tidak pernah tiba dihitung 0 setelah tenggang', () => {
  const room = roomMain();
  const batas = D.tenggat(room);
  jawab(room, A, kawatSebagian(room, 1), batas + 100);
  const tenggang = D.TENGGANG_KIRIM_MS + D.JEDA_AMAN_MS;
  assert.equal(D.hasil(room, LEVEL, batas + tenggang - 1), null);
  const h = D.hasil(room, LEVEL, batas + tenggang);
  assert.equal(h.pemenang, A);
  assert.deepEqual(h.benar, { [A]: 1, [B]: 0 });
});

test('O-3: papan yang terlambat melewati tenggang dihitung 0', () => {
  const room = roomMain();
  const batas = D.tenggat(room);
  jawab(room, A, kawatSebagian(room, 1), batas + 100);
  jawab(room, B, kawatSebagian(room, 3), batas + D.TENGGANG_KIRIM_MS + 1);
  const h = D.hasil(room, LEVEL, batas + D.TENGGANG_KIRIM_MS + 2);
  assert.equal(h.pemenang, A);
  assert.equal(h.benar[B], 0);
});

test('menyerah saat bermain: lawan menang', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  room.pemain[A].menyerah = t + 5000;
  const h = D.hasil(room, LEVEL, t + 5001);
  assert.equal(h.pemenang, B);
  assert.equal(h.alasan, 'menyerah');
});

test('jawaban benar yang lebih dulu mengalahkan menyerah yang datang kemudian', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  jawab(room, A, kawatBenar(room), t + 4000);
  room.pemain[A].menyerah = t + 9000;
  const h = D.hasil(room, LEVEL, t + 9001);
  assert.equal(h.pemenang, A);
  assert.equal(h.alasan, 'benar');
});

test('keluar sebelum papan tampil: duel batal, tanpa pemenang', () => {
  const siap = roomBaru();
  siap.tamu = B;
  siap.pemain[B] = { nama: 'Tamu', tersambung: true, menyerah: T0 + 500 };
  assert.equal(D.keadaan(siap, LEVEL, A, T0 + 600).fase, 'batal');
  assert.equal(D.bisaMulai(siap, A), false);

  const hitung = roomMain();
  hitung.pemain[A].menyerah = D.mulaiMain(hitung) - 1;
  assert.equal(D.keadaan(hitung, LEVEL, B, D.mulaiMain(hitung) + 10).fase, 'batal');
  assert.equal(D.hasil(hitung, LEVEL, D.tenggat(hitung) + 60000), null);
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

test('O-5: klaim putus membuat pemain yang bertahan menang', () => {
  const room = roomMain();
  const t = D.mulaiMain(room) + 50000;
  room.akhir = { pemenang: A, alasan: 'putus', pada: t };
  const h = D.hasil(room, LEVEL, t + 1);
  assert.equal(h.pemenang, A);
  assert.equal(h.alasan, 'putus');
  assert.equal(D.bisaKlaimPutus(room, LEVEL, A, t + 1), false, 'tidak mengklaim dua kali');
});

test('O-5: klaim putus tidak berlaku setelah waktu habis atau untuk orang luar', () => {
  const room = roomMain();
  const batas = D.tenggat(room);
  room.pemain[B].tersambung = false;
  room.pemain[B].putusPada = batas - 10000;
  assert.equal(D.bisaKlaimPutus(room, LEVEL, A, batas + 25000), false);
  room.akhir = { pemenang: A, alasan: 'putus', pada: batas + 1 };
  jawab(room, A, kawatSebagian(room, 0), batas + 10);
  jawab(room, B, kawatSebagian(room, 0), batas + 20);
  assert.equal(D.hasil(room, LEVEL, batas + 30).alasan, 'waktu');
  room.akhir = { pemenang: 'orang-luar', alasan: 'putus', pada: batas - 5000 };
  assert.equal(D.hasil(room, LEVEL, batas + 30).alasan, 'waktu');
});

test('room dengan puzzle yang tidak cocok dinyatakan rusak, bukan macet', () => {
  const room = roomMain();
  room.sidik += 1;
  const h = D.hasil(room, LEVEL, D.mulaiMain(room) + 10);
  assert.equal(h.alasan, 'rusak');
  assert.equal(h.pemenang, null);
});

test('hasil tidak berubah lagi setelah diputuskan, walau waktu terus berjalan', () => {
  const room = roomMain();
  const t = D.mulaiMain(room);
  jawab(room, A, kawatBenar(room), t + 20000);
  const awal = D.hasil(room, LEVEL, t + 20001);
  jawab(room, B, kawatBenar(room), t + 20500);
  room.pemain[B].menyerah = t + 21000;
  const akhir = D.hasil(room, LEVEL, D.tenggat(room) + 999999);
  assert.equal(akhir.pemenang, awal.pemenang);
  assert.equal(akhir.alasan, awal.alasan);
});

test('data room yang rusak tidak membuat galat', () => {
  for (const room of [null, {}, { tuan: A }, { tuan: A, tamu: B, mulaiPada: 'nanti' }, { tuan: A, tamu: B, mulaiPada: T0 }]) {
    assert.doesNotThrow(() => D.keadaan(room, LEVEL, A, T0));
    assert.doesNotThrow(() => D.hasil(room, LEVEL, T0));
    assert.doesNotThrow(() => D.bisaKlaimPutus(room, LEVEL, A, T0));
  }
  const room = roomMain();
  room.jawaban = { [A]: { papan: 'rusak', pada: 'rusak' }, [B]: null };
  assert.doesNotThrow(() => D.hasil(room, LEVEL, D.tenggat(room) + 60000));
});
