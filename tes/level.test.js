const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../public/puzzle.js');
const LEVEL = require('../public/level.js');
const { buatSemuaLevel, adalahPola, LEVEL_PER_CHAPTER } = require('../alat/buat-level.js');

const semuaPuzzle = LEVEL.flatMap((l) => [
  { nama: `Level ${l.level} Practice`, level: l, puzzle: l.practice },
  { nama: `Level ${l.level} Ranked`, level: l, puzzle: l.ranked },
]);

function solusi(p) {
  return P.cariSolusi(p, 2)[0];
}

const chapter = (n) => LEVEL.filter((l) => l.chapter === n);

test('ada 150 level bernomor urut, 50 di setiap chapter', () => {
  assert.equal(LEVEL_PER_CHAPTER, 50);
  assert.equal(LEVEL.length, 150);
  assert.deepEqual([1, 2, 3].map((n) => chapter(n).length), [50, 50, 50]);
  LEVEL.forEach((l, i) => {
    assert.equal(l.level, i + 1);
    assert.equal(l.chapter, Math.floor(i / 50) + 1);
    assert.ok(['easy', 'medium', 'hard'].includes(l.kesulitan));
  });
});

test('level.js sama persis dengan hasil generator', () => {
  assert.deepEqual(LEVEL, buatSemuaLevel());
});

test('S-02: setiap puzzle punya tepat satu solusi', () => {
  for (const { nama, puzzle } of semuaPuzzle) {
    assert.equal(P.hitungSolusi(puzzle, 3), 1, nama);
  }
});

test('S-03: setiap puzzle bisa diselesaikan tanpa menebak, dan datanya cocok', () => {
  for (const { nama, puzzle } of semuaPuzzle) {
    const r = P.ukurPenalaran(puzzle);
    assert.equal(r.selesai, true, nama);
    assert.equal(r.skor, puzzle.skor, nama);
    assert.equal(r.tingkat, puzzle.tingkat, nama);
  }
});

test('kartu tidak kembar, dan cukup untuk mengisi papan', () => {
  for (const { nama, puzzle } of semuaPuzzle) {
    const petunjuk = puzzle.papan.filter((k) => k !== null);
    const semua = [...petunjuk, ...puzzle.tersedia];
    assert.equal(new Set(semua).size, semua.length, nama);
    assert.ok(puzzle.tersedia.length >= 9 - petunjuk.length, nama);
    assert.ok(puzzle.tersedia.length <= 12, `${nama}: muat dua baris kartu`);
  }
});

test('Chapter 1 hanya memakai 27 kartu dengan satu simbol', () => {
  for (const { nama, level, puzzle } of semuaPuzzle) {
    if (level.chapter !== 1) continue;
    for (const k of [...puzzle.papan.filter((x) => x !== null), ...puzzle.tersedia]) {
      assert.equal(P.DEK[k].jumlah, 0, nama);
    }
  }
});

test('level 1-10 memakai pola SETDOKU, level lain rasi umum', () => {
  for (const { nama, level, puzzle } of semuaPuzzle) {
    assert.equal(adalahPola(solusi(puzzle)), level.level <= 10, nama);
    assert.equal(level.pola, level.level <= 10 ? 'setdoku' : 'rasi', nama);
  }
});

test('S-06: level 1-10 punya pesan tutorial, dan pengecoh dijelaskan sebelum dipakai', () => {
  for (const l of LEVEL.slice(0, 10)) assert.ok(l.pesan, `Level ${l.level}`);
  const pertama = LEVEL.find((l) => l.practice.tersedia.length > l.practice.papan.filter((k) => k === null).length);
  assert.match(pertama.pesan, /pengecoh/i);
});

test('S-07: Practice dan Ranked berbeda tetapi sepadan', () => {
  for (const l of LEVEL) {
    assert.notDeepEqual(solusi(l.practice), solusi(l.ranked), `Level ${l.level}`);
    assert.equal(l.practice.tingkat, l.ranked.tingkat, `Level ${l.level}`);
    assert.ok(Math.abs(l.practice.skor - l.ranked.skor) <= 1, `Level ${l.level}`);
  }
});

test('tidak ada dua puzzle dengan solusi yang sama', () => {
  const kunci = semuaPuzzle.map(({ puzzle }) => solusi(puzzle).join());
  assert.equal(new Set(kunci).size, kunci.length);
});

// Chapter 3 diukur dengan skorTutup, karena skor biasa menganggap semua kartu terlihat.
const skorLevel = (l) => (l.chapter === 3 ? l.practice.skorTutup : l.practice.skor);

test('kesulitan tidak pernah turun di dalam setiap chapter, dan benar-benar naik', () => {
  for (const n of [1, 2, 3]) {
    const isi = chapter(n);
    for (let i = 1; i < isi.length; i++) {
      assert.ok(skorLevel(isi[i]) >= skorLevel(isi[i - 1]), `Level ${isi[i].level}`);
    }
    assert.ok(skorLevel(isi[isi.length - 1]) - skorLevel(isi[0]) >= 15, `Chapter ${n}`);
    // Tidak boleh ada dataran panjang: skor naik paling lambat setiap 5 level.
    for (let i = 5; i < isi.length; i++) {
      assert.ok(skorLevel(isi[i]) > skorLevel(isi[i - 5]), `Level ${isi[i].level}: skor datar 5 level`);
    }
  }
});

test('Practice dan Tantangan satu level punya skor yang sama', () => {
  for (const l of LEVEL.slice(10)) {
    assert.equal(l.practice.skor, l.ranked.skor, `Level ${l.level}`);
    if (l.chapter === 3) assert.equal(l.practice.skorTutup, l.ranked.skorTutup, `Level ${l.level}`);
  }
});

test('timer mengikuti posisi level di dalam chapter', () => {
  for (const l of LEVEL.slice(10)) {
    const urutan = ((l.level - 1) % 50) + 1;
    assert.equal(l.kesulitan, urutan <= 15 ? 'easy' : urutan <= 35 ? 'medium' : 'hard', `Level ${l.level}`);
  }
});

test('setiap aturan baru diperkenalkan lewat pesan di level pertamanya', () => {
  assert.match(LEVEL[10].pesan, /tiga warna berbeda/);
  assert.match(LEVEL[50].pesan, /jumlah simbol/);
  assert.match(LEVEL[100].pesan, /tertutup/);
});

test('Chapter 2 dan 3: jumlah simbol di papan beragam', () => {
  for (const { nama, level, puzzle } of semuaPuzzle) {
    if (level.chapter === 1) continue;
    assert.ok(new Set(solusi(puzzle).map((k) => P.DEK[k].jumlah)).size > 1, nama);
  }
});

test('Chapter 2 tanpa kartu tertutup, Chapter 1 juga', () => {
  for (const l of [...chapter(1), ...chapter(2)]) {
    assert.equal(l.practice.tutup, undefined, `Level ${l.level}`);
    assert.equal(l.ranked.tutup, undefined, `Level ${l.level}`);
  }
});

test('Chapter 3: setiap puzzle adil, bisa disimpulkan tanpa menebak dan tanpa buntu', () => {
  for (const l of chapter(3)) {
    for (const puzzle of [l.practice, l.ranked]) {
      assert.ok(puzzle.tutup.length >= 1, `Level ${l.level}`);
      const awal = P.mulaiSesi(puzzle);
      assert.ok(puzzle.tutup.every((id) => P.kartuTertutup(awal, id)), `Level ${l.level}: kartu sudah terbuka sejak awal`);
      assert.ok(puzzle.tutup.every((id) => puzzle.tersedia.includes(id)), `Level ${l.level}`);
      const u = P.ukurTertutup(puzzle);
      assert.equal(u.adil, true, `Level ${l.level}`);
      assert.equal(u.skor, puzzle.skorTutup, `Level ${l.level}`);
    }
  }
});

test('Chapter 3: kartu tertutup tidak bisa diambil, dan terbuka setelah rasi terbentuk sampai papan selesai', () => {
  for (const l of chapter(3)) {
    const s = P.mulaiSesi(l.ranked);
    const kunciJawaban = solusi(l.ranked);
    for (const id of s.tutup.slice(s.terbuka)) assert.equal(P.tekanKartu(s, id), false, `Level ${l.level}`);
    for (let langkah = 0; s.papan.includes(null); langkah++) {
      assert.ok(langkah < 9, `Level ${l.level}: buntu`);
      const i = s.papan.findIndex((k, x) => k === null && !P.kartuTertutup(s, kunciJawaban[x]));
      assert.ok(i >= 0, `Level ${l.level}: tidak ada kartu yang bisa dipasang`);
      assert.equal(P.taruhKartu(s, kunciJawaban[i], i), true, `Level ${l.level}`);
    }
    assert.deepEqual(P.kunci(s), { benar: true, gagal: [] }, `Level ${l.level}`);
  }
});

test('Chapter 3: memakai Hint kapan saja tidak membuat pemain buntu', () => {
  for (const l of chapter(3)) {
    for (const puzzle of [l.practice, l.ranked]) {
      const jawaban = solusi(puzzle);
      const kosong = puzzle.papan.filter((k) => k === null).length;
      for (let saatHint = 0; saatHint < kosong; saatHint++) {
        const s = P.mulaiSesi(puzzle);
        for (let langkah = 0; s.papan.includes(null); langkah++) {
          if (langkah === saatHint) {
            assert.ok(P.bukaPetunjuk(s), `Level ${l.level}`);
            continue;
          }
          const i = s.papan.findIndex((k, x) => k === null && !P.kartuTertutup(s, jawaban[x]));
          assert.ok(i >= 0, `Level ${l.level}: buntu setelah Hint di langkah ${saatHint}`);
          assert.equal(P.taruhKartu(s, jawaban[i], i), true, `Level ${l.level}`);
        }
      }
    }
  }
});

test('tutorial level 1-10 tidak berubah setelah level ditambahkan', () => {
  // Level 11 ke atas dibuat ulang saat setiap chapter jadi 50 level.
  assert.deepEqual(LEVEL[0].practice.papan, [null, 20, 73, 37, 9, 65, 29, 1, null]);
  assert.deepEqual(LEVEL[9].ranked.tersedia, [20, 28, 63, 38, 10, 73]);
  assert.deepEqual(LEVEL[9].practice.papan, [null, null, null, null, 45, 19, null, 38, null]);
});
